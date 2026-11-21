import Matter from 'matter-js'
import type { RigidBodyBakeRecipe, RigidBodySnapshot, RigidFractureEvent } from '@/lib/types/physics'
import type {
  PhysicsBackend,
  RigidBodyFractureSolverEvidence,
  RigidBodySolverEvent,
  RigidBodySolverEventKind,
} from './PhysicsBackend'
import { compareRigidBodyIds } from './RigidBodyEventOrdering'
import type { RigidPose2D } from './RigidVisualTransform'
import { FractureExplosionImpulseResolver } from '@/lib/fracture/FractureExplosionImpulseResolver'

const MATTER_BASE_DELTA_MS = 1000 / 60

interface ImpactCandidate {
  readonly event: RigidFractureEvent
  readonly contactBodyId: string
  readonly relativeNormalSpeedPxPerSecond: number
  readonly contactPointPx: { readonly x: number; readonly y: number }
  readonly contactNormal: { readonly x: number; readonly y: number }
}

/**
 * Matter.js implementation of the fixed-step 2D rigid backend.
 *
 * Bodies use composition pixels and clockwise, y-down angles. User gravity is
 * metres/s² and is converted using recipe.pixelsPerMeter. Matter velocity input
 * is displacement per 60 Hz base delta, so px/s and deg/s are converted only at
 * this boundary. The backend owns all Matter objects and releases them on
 * dispose; no engine object enters scene JSON or preview payloads.
 */
export class MatterPhysicsBackend implements PhysicsBackend {
  readonly id = 'matter-js'
  readonly version = '0.20.0'
  private engine: Matter.Engine | undefined
  private readonly bodies = new Map<string, Matter.Body>()
  private readonly snapshots = new Map<string, RigidBodySnapshot>()
  private recipe: RigidBodyBakeRecipe | undefined
  private elapsedMs = 0
  private currentTick = 0
  private currentStepTimeMs = 0
  private readonly pendingEvents: RigidBodySolverEvent[] = []
  private readonly eventKeys = new Set<string>()
  private readonly activatedFractureEvents = new Set<string>()
  private readonly impactCandidates = new Map<string, ImpactCandidate>()
  private readonly explosionResolver = new FractureExplosionImpulseResolver()
  private readonly sleepListeners = new Map<string, {
    body: Matter.Body
    onStart: (event: Matter.IEvent<Matter.Body>) => void
    onEnd: (event: Matter.IEvent<Matter.Body>) => void
  }>()

  /** Initializes exactly once from an immutable compiled recipe. */
  initialize(recipe: RigidBodyBakeRecipe): void {
    if (this.engine) throw new Error('Matter physics backend is already initialized')
    if (recipe.solverId !== this.id || recipe.solverVersion !== this.version) {
      throw new Error('Matter physics backend version does not match the recipe')
    }
    const engine = Matter.Engine.create({ enableSleeping: true })
    engine.gravity.x = recipe.gravityMetersPerSecondSquared.x * recipe.pixelsPerMeter
    engine.gravity.y = recipe.gravityMetersPerSecondSquared.y * recipe.pixelsPerMeter
    engine.gravity.scale = 1e-6
    this.engine = engine
    this.recipe = recipe
    Matter.Events.on(engine, 'collisionStart', event => this.recordCollisions('contact-start', event.pairs))
    Matter.Events.on(engine, 'collisionEnd', event => this.recordCollisions('contact-end', event.pairs))
    const created: Matter.Body[] = []
    for (const input of recipe.bodies) {
      if (this.snapshots.has(input.bodyId)) throw new Error(`Duplicate rigid body id: ${input.bodyId}`)
      this.snapshots.set(input.bodyId, input)
      if (input.activation) continue
      const body = this.createBody(input, input.centerPx, input.angleDeg)
      created.push(body)
      if (input.motionType === 'dynamic') {
        Matter.Body.setVelocity(body, {
          x: input.initialVelocityPxPerSecond.x * MATTER_BASE_DELTA_MS / 1000,
          y: input.initialVelocityPxPerSecond.y * MATTER_BASE_DELTA_MS / 1000,
        })
        Matter.Body.setAngularVelocity(body, input.initialAngularVelocityDegPerSecond * Math.PI / 180 * MATTER_BASE_DELTA_MS / 1000)
      }
    }
    Matter.Composite.add(engine.world, created)
  }

  /** Advances only by the caller's explicit positive fixed step. */
  step(deltaMs: number): void {
    if (!this.engine) throw new Error('Matter physics backend is not initialized')
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) throw new RangeError('Physics step must be positive and finite')
    this.currentTick += 1
    this.currentStepTimeMs = this.elapsedMs + deltaMs
    Matter.Engine.update(this.engine, deltaMs)
    this.elapsedMs = this.currentStepTimeMs
    for (const event of this.recipe?.fractureEvents ?? []) {
      if (this.activatedFractureEvents.has(event.id)) continue
      if (event.trigger?.kind === 'impact') {
        const candidate = this.impactCandidates.get(event.id)
        if (candidate) this.activateFracture(event, candidate)
      } else if (event.timeMs <= this.elapsedMs + 1e-7) {
        this.activateFracture(event)
      }
    }
    this.impactCandidates.clear()
  }

  /** Reads one detached composition-space pose without exposing Matter state. */
  readPose(bodyId: string): RigidPose2D {
    const body = this.bodies.get(bodyId)
    if (!body) {
      const snapshot = this.snapshots.get(bodyId)
      if (snapshot?.activation) return {
        centerX: snapshot.centerPx.x,
        centerY: snapshot.centerPx.y,
        angleDeg: snapshot.angleDeg,
      }
      throw new Error(`Rigid body is not available: ${bodyId}`)
    }
    return { centerX: body.position.x, centerY: body.position.y, angleDeg: body.angle * 180 / Math.PI }
  }

  /** Returns detached event records and clears only the pending delivery list. */
  drainEvents(): readonly RigidBodySolverEvent[] {
    const drained = this.pendingEvents.map(event => ({
      ...event,
      bodyIds: [...event.bodyIds],
      ...(event.fracture ? { fracture: cloneFractureEvidence(event.fracture) } : {}),
    }))
    this.pendingEvents.length = 0
    return drained
  }

  /** Idempotently clears the owned world and every body reference. */
  dispose(): void {
    if (!this.engine) return
    Matter.Events.off(this.engine, 'collisionStart')
    Matter.Events.off(this.engine, 'collisionEnd')
    this.sleepListeners.forEach(({ body, onStart, onEnd }) => {
      Matter.Events.off(body, 'sleepStart', onStart)
      Matter.Events.off(body, 'sleepEnd', onEnd)
    })
    Matter.Composite.clear(this.engine.world, false, true)
    Matter.Engine.clear(this.engine)
    this.bodies.clear()
    this.snapshots.clear()
    this.sleepListeners.clear()
    this.engine = undefined
    this.recipe = undefined
    this.elapsedMs = 0
    this.currentTick = 0
    this.currentStepTimeMs = 0
    this.pendingEvents.length = 0
    this.eventKeys.clear()
    this.activatedFractureEvents.clear()
    this.impactCandidates.clear()
  }

  private createBody(input: RigidBodySnapshot, center: { x: number; y: number }, angleDeg: number): Matter.Body {
    if (!this.recipe) throw new Error('Matter physics recipe is unavailable')
    const options = {
      label: input.bodyId,
      isStatic: input.motionType === 'static',
      angle: angleDeg * Math.PI / 180,
      density: input.material.densityKgPerSquareMeter / this.recipe.pixelsPerMeter ** 2,
      friction: input.material.friction,
      restitution: input.material.restitution,
      frictionAir: input.material.airFriction,
    }
    let body: Matter.Body
    if (input.collider === 'rectangle') {
      body = Matter.Bodies.rectangle(center.x, center.y, input.widthPx, input.heightPx, options)
    } else {
      if (!input.colliderVerticesPx || input.colliderVerticesPx.length < 3) {
        throw new Error(`Convex rigid body ${input.bodyId} has no collider vertices`)
      }
      body = Matter.Bodies.fromVertices(
        center.x,
        center.y,
        [input.colliderVerticesPx.map(point => ({ x: point.x, y: point.y }))],
        options,
        false,
        1e-9,
        1e-9,
        1e-9,
      )
    }
    this.bodies.set(input.bodyId, body)
    if (input.motionType === 'dynamic') {
      const onStart = () => this.recordEvent('sleep-start', [input.bodyId])
      const onEnd = () => this.recordEvent('sleep-end', [input.bodyId])
      Matter.Events.on(body, 'sleepStart', onStart)
      Matter.Events.on(body, 'sleepEnd', onEnd)
      this.sleepListeners.set(input.bodyId, { body, onStart, onEnd })
    }
    return body
  }

  private recordCollisions(kind: 'contact-start' | 'contact-end', pairs: readonly Matter.Pair[]): void {
    pairs.forEach(pair => {
      const bodyIds = [bodyId(pair.bodyA), bodyId(pair.bodyB)].sort(compareRigidBodyIds)
      if (bodyIds[0] && bodyIds[1] && bodyIds[0] !== bodyIds[1]) this.recordEvent(kind, bodyIds)
      if (kind === 'contact-start') this.captureImpactCandidates(pair)
    })
  }

  private recordEvent(
    kind: RigidBodySolverEventKind,
    bodyIds: readonly string[],
    fracture?: RigidBodyFractureSolverEvidence,
  ): void {
    if (this.currentTick < 1 || !Number.isFinite(this.currentStepTimeMs)) return
    const key = `${this.currentTick}:${kind}:${bodyIds.join(',')}`
    if (this.eventKeys.has(key)) return
    this.eventKeys.add(key)
    this.pendingEvents.push(Object.freeze({
      kind,
      tick: this.currentTick,
      timeMs: this.currentStepTimeMs,
      bodyIds: Object.freeze([...bodyIds]),
      ...(fracture ? { fracture: Object.freeze(cloneFractureEvidence(fracture)) } : {}),
    }))
  }

  /** Captures the strongest qualifying pre-solve contact for each impact event. */
  private captureImpactCandidates(pair: Matter.Pair): void {
    const events = this.recipe?.fractureEvents ?? []
    const bodyA = pair.collision.parentA ?? pair.bodyA
    const bodyB = pair.collision.parentB ?? pair.bodyB
    const idA = bodyId(bodyA), idB = bodyId(bodyB)
    for (const event of events) {
      if (event.trigger?.kind !== 'impact' || this.activatedFractureEvents.has(event.id)) continue
      const sourceIsA = idA === event.sourceBodyId
      const sourceIsB = idB === event.sourceBodyId
      if (!sourceIsA && !sourceIsB) continue
      const contactBody = sourceIsA ? bodyB : bodyA
      const contactBodyId = sourceIsA ? idB : idA
      if (!event.trigger.colliderBodyIds.includes(contactBodyId)) continue
      const sourceBody = sourceIsA ? bodyA : bodyB
      const point = contactPoint(pair, sourceBody, contactBody)
      const pairNormal = pair.collision.normal
      const normal = sourceIsA
        ? { x: pairNormal.x, y: pairNormal.y }
        : { x: -pairNormal.x, y: -pairNormal.y }
      const sourceVelocity = velocityAtPoint(sourceBody, point)
      const contactVelocity = velocityAtPoint(contactBody, point)
      const closingPerBaseDelta = (contactVelocity.x - sourceVelocity.x) * normal.x
        + (contactVelocity.y - sourceVelocity.y) * normal.y
      const speed = Math.max(0, closingPerBaseDelta * 1000 / MATTER_BASE_DELTA_MS)
      if (speed + 1e-7 < event.trigger.minimumRelativeNormalSpeedPxPerSecond) continue
      const previous = this.impactCandidates.get(event.id)
      if (!previous || speed > previous.relativeNormalSpeedPxPerSecond) {
        this.impactCandidates.set(event.id, {
          event,
          contactBodyId,
          relativeNormalSpeedPxPerSecond: speed,
          contactPointPx: point,
          contactNormal: normal,
        })
      }
    }
  }

  /** Atomically replaces one source body with precompiled convex fragments. */
  private activateFracture(event: RigidFractureEvent, impact?: ImpactCandidate): void {
    if (!this.engine) throw new Error('Matter physics backend is not initialized')
    const source = this.bodies.get(event.sourceBodyId)
    if (!source || source.isStatic) throw new Error(`Fracture source body is unavailable: ${event.sourceBodyId}`)
    const fragmentSnapshots = event.fragmentBodyIds.map(bodyId => {
      if (this.bodies.has(bodyId)) throw new Error(`Fracture fragment is already active: ${bodyId}`)
      const snapshot = this.snapshots.get(bodyId)
      if (!snapshot?.activation || snapshot.activation.eventId !== event.id
        || snapshot.activation.sourceBodyId !== event.sourceBodyId) {
        throw new Error(`Fracture fragment activation does not match event ${event.id}: ${bodyId}`)
      }
      return snapshot
    })
    const explosionDeltas = event.explosion
      ? this.explosionResolver.resolve(event.explosion, source.angle, fragmentSnapshots.map(snapshot => ({
        sourceLocalOffsetPx: snapshot.activation!.sourceLocalOffsetPx,
      })))
      : undefined
    const fragments = fragmentSnapshots.map((snapshot, index) => {
      const offset = rotate(snapshot.activation!.sourceLocalOffsetPx, source.angle)
      const body = this.createBody(snapshot, {
        x: source.position.x + offset.x,
        y: source.position.y + offset.y,
      }, source.angle * 180 / Math.PI)
      const delta = explosionDeltas?.[index]
      Matter.Body.setVelocity(body, {
        x: source.velocity.x - source.angularVelocity * offset.y
          + (delta?.linearVelocityPxPerSecond.x ?? 0) * MATTER_BASE_DELTA_MS / 1000,
        y: source.velocity.y + source.angularVelocity * offset.x
          + (delta?.linearVelocityPxPerSecond.y ?? 0) * MATTER_BASE_DELTA_MS / 1000,
      })
      Matter.Body.setAngularVelocity(body, source.angularVelocity
        + (delta?.angularVelocityDegPerSecond ?? 0) * Math.PI / 180 * MATTER_BASE_DELTA_MS / 1000)
      return body
    })
    Matter.Composite.remove(this.engine.world, source)
    Matter.Composite.add(this.engine.world, fragments)
    this.activatedFractureEvents.add(event.id)
    const bodyIds = impact
      ? [event.sourceBodyId, impact.contactBodyId].sort(compareRigidBodyIds)
      : [event.sourceBodyId]
    this.recordEvent('fracture', bodyIds, impact ? {
      eventId: event.id,
      triggerKind: 'impact',
      contactBodyId: impact.contactBodyId,
      relativeNormalSpeedPxPerSecond: impact.relativeNormalSpeedPxPerSecond,
      contactPointPx: impact.contactPointPx,
      contactNormal: impact.contactNormal,
    } : { eventId: event.id, triggerKind: 'time' })
  }
}

function bodyId(body: Matter.Body): string {
  return body.parent?.label || body.label
}

function rotate(point: { readonly x: number; readonly y: number }, angleRadians: number): { x: number; y: number } {
  const cosine = Math.cos(angleRadians), sine = Math.sin(angleRadians)
  return { x: cosine * point.x - sine * point.y, y: sine * point.x + cosine * point.y }
}

function contactPoint(pair: Matter.Pair, bodyA: Matter.Body, bodyB: Matter.Body): { x: number; y: number } {
  const vertices = (pair.collision.supports ?? []).filter((vertex): vertex is Matter.Vector => !!vertex)
  if (!vertices.length) return { x: (bodyA.position.x + bodyB.position.x) / 2, y: (bodyA.position.y + bodyB.position.y) / 2 }
  return {
    x: vertices.reduce((sum, vertex) => sum + vertex.x, 0) / vertices.length,
    y: vertices.reduce((sum, vertex) => sum + vertex.y, 0) / vertices.length,
  }
}

function velocityAtPoint(body: Matter.Body, point: { readonly x: number; readonly y: number }): { x: number; y: number } {
  const offsetX = point.x - body.position.x, offsetY = point.y - body.position.y
  return {
    x: body.velocity.x - body.angularVelocity * offsetY,
    y: body.velocity.y + body.angularVelocity * offsetX,
  }
}

function cloneFractureEvidence(value: RigidBodyFractureSolverEvidence): RigidBodyFractureSolverEvidence {
  return {
    ...value,
    ...(value.contactPointPx ? { contactPointPx: { ...value.contactPointPx } } : {}),
    ...(value.contactNormal ? { contactNormal: { ...value.contactNormal } } : {}),
  }
}
