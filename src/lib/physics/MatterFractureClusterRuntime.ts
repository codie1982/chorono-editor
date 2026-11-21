import Matter from 'matter-js'
import { FractureClusterComponents } from '@/lib/fracture/FractureClusterComponents'
import type { FractureBond, FractureBondGraph } from '@/lib/types/fractureCluster'
import type {
  RigidBodyBakeRecipe,
  RigidBodySnapshot,
  RigidFractureEvent,
} from '@/lib/types/physics'
import type { RigidBondBreakSolverEvidence } from './PhysicsBackend'
import type { RigidPose2D } from './RigidVisualTransform'
import { MatterBodyFactory } from './MatterBodyFactory'
import {
  applyConservedMatterClusterField,
  matterClusterContactLoad,
  rotateMatterVector,
} from './MatterFractureClusterDynamics'

interface RuntimeCluster {
  readonly id: string
  readonly graph: FractureBondGraph
  readonly body: Matter.Body
  readonly fragmentLayerIds: readonly string[]
}

interface VirtualFragment {
  readonly clusterId: string
  readonly localOffsetPx: { readonly x: number; readonly y: number }
  readonly angleOffsetRad: number
}

interface ContactLoad {
  readonly cluster: RuntimeCluster
  readonly pointPx: { readonly x: number; readonly y: number }
  readonly load: number
}

export interface MatterClusterRuntimeEvent {
  readonly bodyIds: readonly string[]
  readonly evidence: RigidBondBreakSolverEvidence
}

/**
 * Owns FRACTURE2 compound bodies, virtual fragment poses and bond damage.
 *
 * One intact graph component is represented by one Matter compound body.
 * Contact load is applied once per fixed tick to the nearest intact bond.
 * After a break, connected components are rebuilt in the same tick; each new
 * body inherits the old rigid velocity field at its centre of mass. The class
 * owns only runtime Matter objects and scalar damage, never scene JSON.
 */
export class MatterFractureClusterRuntime {
  private readonly clusterRecipes = new Map<string, NonNullable<RigidBodyBakeRecipe['fractureClusters']>[number]>()
  private readonly snapshotsByBodyId = new Map<string, RigidBodySnapshot>()
  private readonly snapshotsByLayerId = new Map<string, RigidBodySnapshot>()
  private readonly clusters = new Map<string, RuntimeCluster>()
  private readonly clusterIdByMatterBodyId = new Map<number, string>()
  private readonly virtualFragments = new Map<string, VirtualFragment>()
  private readonly brokenBondIds = new Set<string>()
  private readonly damageByBondId = new Map<string, number>()
  private readonly components = new FractureClusterComponents()
  private sequence = 0

  constructor(
    private readonly engine: Matter.Engine,
    private readonly factory: MatterBodyFactory,
    recipe: RigidBodyBakeRecipe,
    private readonly emitBreak: (event: MatterClusterRuntimeEvent) => void,
  ) {
    ;(recipe.fractureClusters ?? []).forEach(cluster => this.clusterRecipes.set(cluster.eventId, cluster))
    recipe.bodies.forEach(snapshot => {
      this.snapshotsByBodyId.set(snapshot.bodyId, snapshot)
      this.snapshotsByLayerId.set(snapshot.layerId, snapshot)
    })
  }

  /** Whether an event has a bonded cluster policy. */
  supports(eventId: string): boolean {
    return this.clusterRecipes.has(eventId)
  }

  /** Replace the source with one initially intact compound cluster. */
  activate(event: RigidFractureEvent, source: Matter.Body, fragments: readonly RigidBodySnapshot[]): Matter.Body {
    const recipe = this.clusterRecipes.get(event.id)
    if (!recipe) throw new Error(`Fracture cluster recipe is missing: ${event.id}`)
    const requested = new Set(fragments.map(fragment => fragment.layerId))
    if (recipe.graph.fragmentIds.some(id => !requested.has(id)) || requested.size !== recipe.graph.fragmentIds.length) {
      throw new Error(`Fracture cluster fragments do not match graph ${recipe.graph.graphId}`)
    }
    const poses = new Map(fragments.map(snapshot => {
      const offset = rotateMatterVector(snapshot.activation!.sourceLocalOffsetPx, source.angle)
      return [snapshot.bodyId, {
        centerX: source.position.x + offset.x,
        centerY: source.position.y + offset.y,
        angleDeg: source.angle * 180 / Math.PI,
      }] as const
    }))
    const cluster = this.createComponent(recipe.graph, recipe.graph.fragmentIds, poses, source, true)
    return cluster.body
  }

  /** Returns a detached virtual pose for one fragment, if currently clustered. */
  readPose(bodyId: string): RigidPose2D | null {
    const virtual = this.virtualFragments.get(bodyId)
    if (!virtual) return null
    const cluster = this.clusters.get(virtual.clusterId)
    if (!cluster) throw new Error(`Fracture runtime cluster is missing: ${virtual.clusterId}`)
    const offset = rotateMatterVector(virtual.localOffsetPx, cluster.body.angle)
    return {
      centerX: cluster.body.position.x + offset.x,
      centerY: cluster.body.position.y + offset.y,
      angleDeg: (cluster.body.angle + virtual.angleOffsetRad) * 180 / Math.PI,
    }
  }

  /** Maps a collision part to the public fragment body used by tracks/events. */
  collisionBodyId(body: Matter.Body): string | null {
    if (this.snapshotsByBodyId.has(body.label)) return body.label
    const parent = body.parent ?? body
    const clusterId = this.clusterIdByMatterBodyId.get(parent.id)
    const cluster = clusterId ? this.clusters.get(clusterId) : undefined
    const layerId = cluster?.fragmentLayerIds[0]
    return layerId ? this.snapshotsByLayerId.get(layerId)?.bodyId ?? null : null
  }

  /** Apply decay/contact load and split changed components after one solver tick. */
  afterStep(deltaMs: number): void {
    this.decayDamage(deltaMs)
    const loads = this.collectContactLoads()
    loads.forEach(load => this.applyContactLoad(load))
  }

  /** Release references; the owning backend clears the Matter world. */
  dispose(): void {
    this.clusters.clear()
    this.clusterIdByMatterBodyId.clear()
    this.virtualFragments.clear()
    this.brokenBondIds.clear()
    this.damageByBondId.clear()
  }

  private collectContactLoads(): Map<string, ContactLoad> {
    const loads = new Map<string, ContactLoad>()
    this.engine.pairs.list.forEach((pair: Matter.Pair) => {
      if (!pair.isActive) return
      const parentA = pair.bodyA.parent ?? pair.bodyA
      const parentB = pair.bodyB.parent ?? pair.bodyB
      const clusterA = this.clusterForBody(parentA)
      const clusterB = this.clusterForBody(parentB)
      if (clusterA && clusterB?.id === clusterA.id) return
      const { pointPx, impulse, relativeSpeed } = matterClusterContactLoad(pair, parentA, parentB)
      if (clusterA) this.retainStrongest(loads, clusterA, pointPx, impulse, relativeSpeed)
      if (clusterB) this.retainStrongest(loads, clusterB, pointPx, impulse, relativeSpeed)
    })
    return loads
  }

  private retainStrongest(
    loads: Map<string, ContactLoad>,
    cluster: RuntimeCluster,
    pointPx: { readonly x: number; readonly y: number },
    impulse: number,
    relativeSpeed: number,
  ): void {
    const bond = this.nearestBreakableBond(cluster, pointPx)
    if (!bond) return
    const load = impulse + relativeSpeed * bond.relativeNormalSpeedScale
    const previous = loads.get(cluster.id)
    if (load > (previous?.load ?? -Infinity)) loads.set(cluster.id, { cluster, pointPx, load })
  }

  private applyContactLoad(contact: ContactLoad): void {
    const bond = this.nearestBreakableBond(contact.cluster, contact.pointPx)
    if (!bond) return
    const damage = (this.damageByBondId.get(bond.bondId) ?? 0) + contact.load
    this.damageByBondId.set(bond.bondId, damage)
    const reason = contact.load + 1e-7 >= bond.impulseStrength
      ? 'impulse' as const
      : damage + 1e-7 >= bond.damageThreshold ? 'damage' as const : null
    if (!reason) return
    this.brokenBondIds.add(bond.bondId)
    const splitComponents = this.components.resolve(contact.cluster.graph, Array.from(this.brokenBondIds))
      .filter(component => component.fragmentIds.some(id => contact.cluster.fragmentLayerIds.includes(id)))
    this.emitBreak({
      bodyIds: [this.snapshotsByLayerId.get(bond.fragmentAId)!.bodyId,
        this.snapshotsByLayerId.get(bond.fragmentBId)!.bodyId].sort(),
      evidence: {
        graphId: contact.cluster.graph.graphId,
        bondId: bond.bondId,
        load: contact.load,
        accumulatedDamage: damage,
        reason,
        componentIds: splitComponents.map(component => component.componentId),
      },
    })
    if (splitComponents.length > 1) this.splitCluster(contact.cluster, splitComponents.map(component => component.fragmentIds))
  }

  private splitCluster(cluster: RuntimeCluster, componentIds: readonly (readonly string[])[]): void {
    const poses = new Map(cluster.fragmentLayerIds.map(layerId => {
      const snapshot = this.snapshotsByLayerId.get(layerId)!
      return [snapshot.bodyId, this.readPose(snapshot.bodyId)!] as const
    }))
    Matter.Composite.remove(this.engine.world, cluster.body)
    this.removeCluster(cluster)
    const children = componentIds.map(fragmentLayerIds => (
      this.createComponent(cluster.graph, fragmentLayerIds, poses, cluster.body)
    ))
    applyConservedMatterClusterField(cluster.body, children.map(child => child.body))
    children.forEach(child => {
      Matter.Composite.add(this.engine.world, child.body)
    })
  }

  private createComponent(
    graph: FractureBondGraph,
    fragmentLayerIds: readonly string[],
    poses: ReadonlyMap<string, RigidPose2D>,
    velocitySource: Matter.Body,
    inheritMassProperties = false,
  ): RuntimeCluster {
    const runtimeId = `${graph.graphId}-runtime-${this.sequence++}`
    const partBodies: Matter.Body[] = []
    fragmentLayerIds.forEach(layerId => {
      const snapshot = this.snapshotsByLayerId.get(layerId)
      if (!snapshot) throw new Error(`Fracture cluster snapshot is missing: ${layerId}`)
      const pose = poses.get(snapshot.bodyId)
      if (!pose) throw new Error(`Fracture cluster pose is missing: ${snapshot.bodyId}`)
      const fragmentBody = this.factory.create(snapshot, { x: pose.centerX, y: pose.centerY }, pose.angleDeg)
      const physicalParts = fragmentBody.parts.length > 1 ? fragmentBody.parts.slice(1) : [fragmentBody]
      physicalParts.forEach(part => { part.label = snapshot.bodyId })
      partBodies.push(...physicalParts)
    })
    const material = this.snapshotsByLayerId.get(fragmentLayerIds[0])!.material
    const body = Matter.Body.create({
      label: runtimeId,
      parts: partBodies,
      friction: material.friction,
      restitution: material.restitution,
      frictionAir: material.airFriction,
    })
    if (inheritMassProperties) {
      Matter.Body.setMass(body, velocitySource.mass)
      Matter.Body.setInertia(body, velocitySource.inertia)
    }
    const offset = { x: body.position.x - velocitySource.position.x, y: body.position.y - velocitySource.position.y }
    Matter.Body.setVelocity(body, {
      x: velocitySource.velocity.x - velocitySource.angularVelocity * offset.y,
      y: velocitySource.velocity.y + velocitySource.angularVelocity * offset.x,
    })
    Matter.Body.setAngularVelocity(body, velocitySource.angularVelocity)
    const cluster: RuntimeCluster = Object.freeze({ id: runtimeId, graph, body, fragmentLayerIds: [...fragmentLayerIds].sort() })
    this.clusters.set(runtimeId, cluster)
    this.clusterIdByMatterBodyId.set(body.id, runtimeId)
    fragmentLayerIds.forEach(layerId => {
      const snapshot = this.snapshotsByLayerId.get(layerId)!
      const pose = poses.get(snapshot.bodyId)!
      const worldOffset = { x: pose.centerX - body.position.x, y: pose.centerY - body.position.y }
      this.virtualFragments.set(snapshot.bodyId, {
        clusterId: runtimeId,
        localOffsetPx: rotateMatterVector(worldOffset, -body.angle),
        angleOffsetRad: pose.angleDeg * Math.PI / 180 - body.angle,
      })
    })
    return cluster
  }

  private nearestBreakableBond(cluster: RuntimeCluster, pointPx: { readonly x: number; readonly y: number }): FractureBond | null {
    let nearest: FractureBond | null = null
    let nearestDistance = Infinity
    cluster.graph.bonds.forEach(bond => {
      if (bond.unbreakable || this.brokenBondIds.has(bond.bondId)
        || !cluster.fragmentLayerIds.includes(bond.fragmentAId)
        || !cluster.fragmentLayerIds.includes(bond.fragmentBId)) return
      const midpoint = this.worldBondMidpoint(bond)
      const distance = (midpoint.x - pointPx.x) ** 2 + (midpoint.y - pointPx.y) ** 2
      if (distance < nearestDistance) {
        nearest = bond
        nearestDistance = distance
      }
    })
    return nearest
  }

  private worldBondMidpoint(bond: FractureBond): { x: number; y: number } {
    const snapshot = this.snapshotsByLayerId.get(bond.fragmentAId)!
    const pose = this.readPose(snapshot.bodyId)!
    const centroid = snapshot.visual.centerOfMassLocalPx
    if (!centroid) throw new Error(`Fracture cluster fragment has no local centroid: ${snapshot.bodyId}`)
    const local = {
      x: (bond.sharedBoundaryMidpointPx.x - centroid.x) * snapshot.visual.uniformScale,
      y: (bond.sharedBoundaryMidpointPx.y - centroid.y) * snapshot.visual.uniformScale,
    }
    const world = rotateMatterVector(local, pose.angleDeg * Math.PI / 180)
    return { x: pose.centerX + world.x, y: pose.centerY + world.y }
  }

  private decayDamage(deltaMs: number): void {
    this.clusters.forEach(cluster => cluster.graph.bonds.forEach(bond => {
      const damage = this.damageByBondId.get(bond.bondId)
      if (damage === undefined || damage <= 0 || bond.damageDecayPerSecond <= 0) return
      this.damageByBondId.set(bond.bondId, Math.max(0, damage - bond.damageDecayPerSecond * deltaMs / 1000))
    }))
  }

  private clusterForBody(body: Matter.Body): RuntimeCluster | null {
    const id = this.clusterIdByMatterBodyId.get(body.id)
    return id ? this.clusters.get(id) ?? null : null
  }

  private removeCluster(cluster: RuntimeCluster): void {
    this.clusters.delete(cluster.id)
    this.clusterIdByMatterBodyId.delete(cluster.body.id)
    cluster.fragmentLayerIds.forEach(layerId => {
      const bodyId = this.snapshotsByLayerId.get(layerId)?.bodyId
      if (bodyId) this.virtualFragments.delete(bodyId)
    })
  }
}
