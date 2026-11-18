import Matter from 'matter-js'
import type { RigidBodyBakeRecipe, RigidBodySnapshot, RigidFractureEvent } from '@/lib/types/physics'
import type { PhysicsBackend } from './PhysicsBackend'
import type { RigidPose2D } from './RigidVisualTransform'

const MATTER_BASE_DELTA_MS = 1000 / 60

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
  private nextFractureEvent = 0

  /** Initializes exactly once from an immutable compiled recipe. */
  initialize(recipe: RigidBodyBakeRecipe): void {
    if (this.engine) throw new Error('Matter physics backend is already initialized')
    if (recipe.solverId !== this.id || recipe.solverVersion !== this.version) {
      throw new Error('Matter physics backend version does not match the recipe')
    }
    const engine = Matter.Engine.create({ enableSleeping: false })
    engine.gravity.x = recipe.gravityMetersPerSecondSquared.x * recipe.pixelsPerMeter
    engine.gravity.y = recipe.gravityMetersPerSecondSquared.y * recipe.pixelsPerMeter
    engine.gravity.scale = 1e-6
    this.engine = engine
    this.recipe = recipe
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
    Matter.Engine.update(this.engine, deltaMs)
    this.elapsedMs += deltaMs
    const events = this.recipe?.fractureEvents ?? []
    while (this.nextFractureEvent < events.length && events[this.nextFractureEvent].timeMs <= this.elapsedMs + 1e-7) {
      this.activateFracture(events[this.nextFractureEvent++])
    }
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

  /** Idempotently clears the owned world and every body reference. */
  dispose(): void {
    if (!this.engine) return
    Matter.Composite.clear(this.engine.world, false, true)
    Matter.Engine.clear(this.engine)
    this.bodies.clear()
    this.snapshots.clear()
    this.engine = undefined
    this.recipe = undefined
    this.elapsedMs = 0
    this.nextFractureEvent = 0
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
    return body
  }

  /** Atomically replaces one source body with precompiled convex fragments. */
  private activateFracture(event: RigidFractureEvent): void {
    if (!this.engine) throw new Error('Matter physics backend is not initialized')
    const source = this.bodies.get(event.sourceBodyId)
    if (!source || source.isStatic) throw new Error(`Fracture source body is unavailable: ${event.sourceBodyId}`)
    const fragments = event.fragmentBodyIds.map(bodyId => {
      if (this.bodies.has(bodyId)) throw new Error(`Fracture fragment is already active: ${bodyId}`)
      const snapshot = this.snapshots.get(bodyId)
      if (!snapshot?.activation || snapshot.activation.eventId !== event.id
        || snapshot.activation.sourceBodyId !== event.sourceBodyId) {
        throw new Error(`Fracture fragment activation does not match event ${event.id}: ${bodyId}`)
      }
      const offset = rotate(snapshot.activation.sourceLocalOffsetPx, source.angle)
      const body = this.createBody(snapshot, {
        x: source.position.x + offset.x,
        y: source.position.y + offset.y,
      }, source.angle * 180 / Math.PI)
      Matter.Body.setVelocity(body, {
        x: source.velocity.x - source.angularVelocity * offset.y,
        y: source.velocity.y + source.angularVelocity * offset.x,
      })
      Matter.Body.setAngularVelocity(body, source.angularVelocity)
      return body
    })
    Matter.Composite.remove(this.engine.world, source)
    Matter.Composite.add(this.engine.world, fragments)
  }
}

function rotate(point: { readonly x: number; readonly y: number }, angleRadians: number): { x: number; y: number } {
  const cosine = Math.cos(angleRadians), sine = Math.sin(angleRadians)
  return { x: cosine * point.x - sine * point.y, y: sine * point.x + cosine * point.y }
}
