import Matter from 'matter-js'
import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
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
    const created: Matter.Body[] = []
    for (const input of recipe.bodies) {
      const density = input.material.densityKgPerSquareMeter / recipe.pixelsPerMeter ** 2
      const body = Matter.Bodies.rectangle(input.centerPx.x, input.centerPx.y, input.widthPx, input.heightPx, {
        label: input.bodyId,
        isStatic: input.motionType === 'static',
        angle: input.angleDeg * Math.PI / 180,
        density,
        friction: input.material.friction,
        restitution: input.material.restitution,
        frictionAir: input.material.airFriction,
      })
      if (this.bodies.has(input.bodyId)) throw new Error(`Duplicate rigid body id: ${input.bodyId}`)
      this.bodies.set(input.bodyId, body)
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
  }

  /** Reads one detached composition-space pose without exposing Matter state. */
  readPose(bodyId: string): RigidPose2D {
    const body = this.bodies.get(bodyId)
    if (!body) throw new Error(`Rigid body is not available: ${bodyId}`)
    return { centerX: body.position.x, centerY: body.position.y, angleDeg: body.angle * 180 / Math.PI }
  }

  /** Idempotently clears the owned world and every body reference. */
  dispose(): void {
    if (!this.engine) return
    Matter.Composite.clear(this.engine.world, false, true)
    Matter.Engine.clear(this.engine)
    this.bodies.clear()
    this.engine = undefined
  }
}
