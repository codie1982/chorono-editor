import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { ChronoScene } from '@/lib/types'
import type { FractureGeneration, FractureRegionGeneration } from '@/lib/types/fracture'
import type {
  FractureBondDamageReset,
  FractureBondForcedBreak,
  FractureBondGraph,
} from '@/lib/types/fractureCluster'
import type {
  RigidBodyAuthoring,
  RigidBodyBakeRecipe,
  RigidBodySnapshot,
  RigidFractureExplosion,
} from '@/lib/types/physics'
import { hashRigidBodyBakeRecipe, hashRigidBodySource, RigidBodySceneCompiler } from '@/lib/physics/RigidBodySceneCompiler'
import { FractureAppearanceCompiler } from './FractureAppearanceCompiler'
import { FractureBondActionSchedule } from './FractureBondActionSchedule'
import { FractureBondGraphValidator } from './FractureBondGraphValidator'
import { FractureManifestValidator } from './FractureManifestValidator'
import { FractureRegionManifestValidator } from './FractureRegionManifestValidator'
import { FractureSourceBoundaryCompiler } from './FractureSourceBoundaryCompiler'
import { FractureSourceRegionCompiler, type FractureSourceRegion } from './FractureSourceRegionCompiler'
import { hashFractureRegionSource } from './FractureManifestHash'
import { FractureBodySnapshotCompiler } from './FractureBodySnapshotCompiler'

export interface FractureRigidRecipeInput {
  readonly generation: FractureGeneration | FractureRegionGeneration
  readonly bondGraph?: FractureBondGraph
  readonly forcedBondBreaks?: readonly FractureBondForcedBreak[]
  readonly bondDamageResets?: readonly FractureBondDamageReset[]
  readonly timelineId: string
  readonly startTimeMs: number
  readonly durationMs: number
  /** Local simulation time, required by the default timed trigger. */
  readonly fractureTimeMs?: number
  readonly fractureTrigger?:
    | { readonly kind: 'time' }
    | {
      readonly kind: 'impact'
      readonly minimumRelativeNormalSpeedPxPerSecond: number
      /** Layer ids from the explicit static environment; omitted means all static bodies. */
      readonly colliderLayerIds?: readonly string[]
    }
  readonly explosion?: RigidFractureExplosion
  readonly sourceBody: RigidBodyAuthoring
  readonly staticBodies: readonly RigidBodyAuthoring[]
  readonly stepHz?: number
  readonly sampleFps?: number
  readonly pixelsPerMeter?: number
  readonly gravityMetersPerSecondSquared?: { readonly x: number; readonly y: number }
}

/**
 * Compiles one prepared Voronoi generation into the existing rigid recipe.
 *
 * The source boundary and static rectangle environment reuse
 * RigidBodySceneCompiler's shared layer adapter.
 * Fragment colliders are convex polygons centred on their uniform-density
 * centroid and stay inactive until the one topology event. Source-local
 * geometry is converted to composition pixels explicitly; Matter handles and
 * generated scene layers are not created here. Instances are stateless.
 */
export class FractureRigidRecipeCompiler {
  private readonly rigidCompiler = new RigidBodySceneCompiler()
  private readonly manifestValidator = new FractureManifestValidator()
  private readonly regionManifestValidator = new FractureRegionManifestValidator()
  private readonly appearanceCompiler = new FractureAppearanceCompiler()
  private readonly sourceBoundaryCompiler = new FractureSourceBoundaryCompiler()
  private readonly sourceRegionCompiler = new FractureSourceRegionCompiler()
  private readonly bondGraphValidator = new FractureBondGraphValidator()
  private readonly bondActionSchedule = new FractureBondActionSchedule()
  private readonly bodySnapshotCompiler = new FractureBodySnapshotCompiler()

  /** Compiles an immutable one-generation recipe without mutating the scene. */
  compile(scene: ChronoScene, input: FractureRigidRecipeInput): RigidBodyBakeRecipe {
    if (input.generation.schemaVersion === 1) this.manifestValidator.validate(input.generation)
    else this.regionManifestValidator.validate(input.generation)
    if (input.bondGraph) {
      this.bondGraphValidator.validate(input.bondGraph, input.generation)
      if (input.explosion) throw new Error('Bonded cluster and artistic explosion cannot be combined yet')
    }
    if (input.sourceBody.layerId !== input.generation.source.ownerId || input.sourceBody.motionType !== 'dynamic'
      || !['rectangle', 'convexPolygon', 'compoundPolygon'].includes(input.sourceBody.collider)) {
      throw new Error('Fracture source must be the generation owner and a dynamic supported boundary')
    }
    if (input.staticBodies.some(body => body.motionType !== 'static' || body.collider !== 'rectangle')) {
      throw new Error('First-slice fracture environment supports static rectangles only')
    }
    const sourceLayer = scene.layers.find(layer => layer.id === input.sourceBody.layerId)
    if (!sourceLayer) throw new Error('Fracture source layer is missing')
    const fractureAppearance = this.appearanceCompiler.snapshot(scene, sourceLayer)
    let sourceSnapshot: RigidBodySnapshot
    if (input.generation.schemaVersion === 1) {
      const boundary = this.sourceBoundaryCompiler.compile(sourceLayer)
      if (boundary.colliderKind !== input.sourceBody.collider) {
        throw new Error('Fracture source collider no longer matches its compiled boundary')
      }
      assertGenerationMatchesSource(input.generation, boundary)
      sourceSnapshot = this.rigidCompiler.compileBodySnapshot(
        scene,
        input.sourceBody,
        input.sourceBody.collider === 'rectangle' ? undefined : boundary,
      )
    } else {
      const region = this.sourceRegionCompiler.compile(sourceLayer)
      if (input.sourceBody.collider !== 'compoundPolygon') {
        throw new Error('Fracture region source requires a compound collider')
      }
      assertGenerationMatchesSource(input.generation, region)
      sourceSnapshot = this.rigidCompiler.compileBodySnapshot(
        scene,
        input.sourceBody,
        compoundSourceGeometry(region),
      )
    }
    const staticSnapshots = input.staticBodies.map(body => this.rigidCompiler.compileBodySnapshot(scene, body))
    const base = this.rigidCompiler.compileSnapshots(scene, {
      timelineId: input.timelineId,
      startTimeMs: input.startTimeMs,
      durationMs: input.durationMs,
      stepHz: input.stepHz,
      sampleFps: input.sampleFps,
      pixelsPerMeter: input.pixelsPerMeter,
      gravityMetersPerSecondSquared: input.gravityMetersPerSecondSquared,
      bodies: [sourceSnapshot, ...staticSnapshots],
    })
    const clock = new SimulationClock(base)
    const trigger = resolveTrigger(input, base)
    const eventTick = trigger.kind === 'time' ? resolveEventTick(input.fractureTimeMs, clock) : 0
    const eventTimeMs = trigger.kind === 'time' ? input.fractureTimeMs! : 0
    const source = base.bodies[0]
    const eventId = `${input.generation.generationId}:event`
    const bondActions = input.bondGraph
      ? this.bondActionSchedule.compile(input.bondGraph, clock, {
        forcedBreaks: input.forcedBondBreaks,
        damageResets: input.bondDamageResets,
      })
      : undefined
    const fragments = this.bodySnapshotCompiler.compile(source, input.generation, eventId)
    const bodies = [source, ...base.bodies.slice(1), ...fragments]
    const fractureEvents = [{
      id: eventId,
      timeMs: eventTimeMs,
      tick: eventTick,
      sourceBodyId: source.bodyId,
      fragmentBodyIds: fragments.map(fragment => fragment.bodyId),
      trigger,
      ...(input.explosion ? { explosion: cloneExplosion(input.explosion) } : {}),
    }]
    const sourceRevision = hashRigidBodySource(base.timelineId, bodies)
    const withoutHash: Omit<RigidBodyBakeRecipe, 'recipeHash'> = {
      ...base,
      source: { ...base.source, revision: sourceRevision },
      bodies,
      fractureEvents,
      ...(input.bondGraph ? { fractureClusters: [Object.freeze({
        eventId,
        strategy: 'compoundBody' as const,
        graph: input.bondGraph,
        ...(bondActions?.forcedBreaks.length ? { forcedBreaks: bondActions.forcedBreaks } : {}),
        ...(bondActions?.damageResets.length ? { damageResets: bondActions.damageResets } : {}),
      })] } : {}),
      fractureAppearance,
    }
    return Object.freeze({ ...withoutHash, recipeHash: hashRigidBodyBakeRecipe(withoutHash) })
  }

  /** Recompiles authored inputs and compares full recipe provenance. */
  isCurrent(
    recipe: RigidBodyBakeRecipe,
    generation: FractureGeneration | FractureRegionGeneration,
    scene: ChronoScene,
  ): boolean {
    const event = recipe.fractureEvents?.[0]
    if (!event) return false
    const source = recipe.bodies.find(body => body.bodyId === event.sourceBodyId)
    if (!source) return false
    const staticBodies = recipe.bodies.filter(body => body.motionType === 'static')
    try {
      const current = this.compile(scene, {
        generation,
        bondGraph: recipe.fractureClusters?.[0]?.graph,
        forcedBondBreaks: recipe.fractureClusters?.[0]?.forcedBreaks,
        bondDamageResets: recipe.fractureClusters?.[0]?.damageResets,
        timelineId: recipe.timelineId,
        startTimeMs: recipe.startTimeMs,
        durationMs: recipe.durationMs,
        fractureTimeMs: event.trigger?.kind === 'impact' ? undefined : event.timeMs,
        fractureTrigger: triggerInput(recipe, event),
        explosion: event.explosion,
        stepHz: recipe.stepHz,
        sampleFps: recipe.sampleFps,
        pixelsPerMeter: recipe.pixelsPerMeter,
        gravityMetersPerSecondSquared: recipe.gravityMetersPerSecondSquared,
        sourceBody: authored(source),
        staticBodies: staticBodies.map(authored),
      })
      const comparable = copyRealization(current, recipe)
      return comparable.recipeHash === recipe.recipeHash && comparable.source.revision === recipe.source.revision
    } catch {
      return false
    }
  }
}

function resolveEventTick(timeMs: number | undefined, clock: SimulationClock): number {
  if (!Number.isFinite(timeMs)) throw new RangeError('Fracture time is required for a timed trigger')
  const tick = timeMs! * clock.stepHz / 1000
  if (!Number.isSafeInteger(tick) || tick < 1 || tick >= clock.totalTicks) {
    throw new RangeError('Fracture time must align to an interior fixed-step tick')
  }
  return tick
}

function resolveTrigger(input: FractureRigidRecipeInput, base: RigidBodyBakeRecipe) {
  if (input.fractureTrigger?.kind !== 'impact') return Object.freeze({ kind: 'time' as const })
  const minimum = input.fractureTrigger.minimumRelativeNormalSpeedPxPerSecond
  if (!Number.isFinite(minimum) || minimum <= 0) throw new RangeError('Impact fracture speed must be positive and finite')
  const requested = input.fractureTrigger.colliderLayerIds
  const colliders = base.bodies.filter(body => body.motionType === 'static'
    && (!requested || requested.includes(body.layerId)))
  if (!colliders.length) throw new Error('Impact fracture requires at least one selected static collider')
  if (requested?.some(layerId => !colliders.some(body => body.layerId === layerId))) {
    throw new Error('Impact fracture collider selection is missing or is not static')
  }
  return Object.freeze({
    kind: 'impact' as const,
    minimumRelativeNormalSpeedPxPerSecond: minimum,
    colliderBodyIds: Object.freeze(colliders.map(body => body.bodyId)),
  })
}

function cloneExplosion(value: RigidFractureExplosion): RigidFractureExplosion {
  return Object.freeze({ ...value, centerLocalOffsetPx: Object.freeze({ ...value.centerLocalOffsetPx }) })
}

function triggerInput(recipe: RigidBodyBakeRecipe, event: NonNullable<RigidBodyBakeRecipe['fractureEvents']>[number]) {
  if (event.trigger?.kind !== 'impact') return { kind: 'time' as const }
  return {
    kind: 'impact' as const,
    minimumRelativeNormalSpeedPxPerSecond: event.trigger.minimumRelativeNormalSpeedPxPerSecond,
    colliderLayerIds: event.trigger.colliderBodyIds.map(bodyId => {
      const body = recipe.bodies.find(candidate => candidate.bodyId === bodyId)
      if (!body) throw new Error(`Impact fracture collider is missing: ${bodyId}`)
      return body.layerId
    }),
  }
}

function copyRealization(current: RigidBodyBakeRecipe, stored: RigidBodyBakeRecipe): RigidBodyBakeRecipe {
  const events = current.fractureEvents?.map((event, index) => {
    const source = stored.fractureEvents?.[index]
    return source?.trigger?.kind === 'impact'
      ? { ...event, timeMs: source.timeMs, tick: source.tick, realization: source.realization }
      : event
  })
  const withoutHash: Omit<RigidBodyBakeRecipe, 'recipeHash'> = {
    ...current,
    fractureEvents: events,
    ...(stored.fractureBondBreakEvents ? { fractureBondBreakEvents: stored.fractureBondBreakEvents } : {}),
  }
  return { ...withoutHash, recipeHash: hashRigidBodyBakeRecipe(withoutHash) }
}

function compoundSourceGeometry(region: FractureSourceRegion) {
  const indices = region.geometry.topology.triangleIndices
  const colliderParts = Array.from({ length: indices.length / 3 }, (_, triangleIndex) => (
    indices.slice(triangleIndex * 3, triangleIndex * 3 + 3).map(vertexIndex => ({
      x: region.geometry.positions[vertexIndex * 2],
      y: region.geometry.positions[vertexIndex * 2 + 1],
    }))
  ))
  if (colliderParts.length > 256) throw new Error('Fracture source compound collider exceeds the 256-part budget')
  return {
    colliderParts,
    centroidPx: region.centroidPx,
    boundsPx: region.boundsPx,
  }
}

function authored(body: RigidBodySnapshot): RigidBodyAuthoring {
  return {
    layerId: body.layerId,
    motionType: body.motionType,
    collider: body.collider,
    material: { ...body.material },
    initialVelocityPxPerSecond: { ...body.initialVelocityPxPerSecond },
    initialAngularVelocityDegPerSecond: body.initialAngularVelocityDegPerSecond,
  }
}

function assertGenerationMatchesSource(
  generation: FractureGeneration | FractureRegionGeneration,
  expected: ReturnType<FractureSourceBoundaryCompiler['compile']> | FractureSourceRegion,
): void {
  if (generation.schemaVersion === 2) {
    if (!('geometry' in expected)
      || generation.source.revision !== hashFractureRegionSource(generation.source.ownerId, expected.geometry)) {
      throw new Error('Fracture region generation no longer matches the source geometry')
    }
    return
  }
  if (!('polygon' in expected) || generation.source.polygon.length !== expected.polygon.length
    || generation.source.polygon.some((point, index) => (
      Math.abs(point.x - expected.polygon[index].x) > 1e-7
      || Math.abs(point.y - expected.polygon[index].y) > 1e-7
    ))) throw new Error('Fracture generation no longer matches the source boundary')
}
