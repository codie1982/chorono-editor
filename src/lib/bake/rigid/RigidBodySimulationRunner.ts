import { MatterPhysicsBackend } from '@/lib/physics/MatterPhysicsBackend'
import type { PhysicsBackend, PhysicsBackendFactory } from '@/lib/physics/PhysicsBackend'
import type { RigidBodySolverEvent } from '@/lib/physics/PhysicsBackend'
import { cancelledJobError } from '@/lib/resources/jobs'
import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
import type {
  RigidBodySimulationContext,
  RigidBodySimulationExecutor,
  RigidBodySimulationResult,
} from './RigidBodySimulationExecutor'

const DEFAULT_YIELD_EVERY_TICKS = 64
const MAX_RETAINED_EVENTS = 100_000

/**
 * Runs Matter on the current execution thread with bounded cooperative yields.
 *
 * The runner owns one backend per call and disposes it on success, failure or
 * cancellation. It never compiles tracks, reserves editor resources or mutates
 * scene data, so the same implementation can run inside a dedicated worker or
 * provide the compatibility fallback when Worker is unavailable.
 */
export class RigidBodySimulationRunner implements RigidBodySimulationExecutor {
  readonly execution = 'inline' as const
  private readonly backendFactory: PhysicsBackendFactory
  private readonly yieldEveryTicks: number

  constructor(options: {
    readonly backendFactory?: PhysicsBackendFactory
    readonly yieldEveryTicks?: number
  } = {}) {
    this.backendFactory = options.backendFactory ?? (() => new MatterPhysicsBackend())
    this.yieldEveryTicks = options.yieldEveryTicks ?? DEFAULT_YIELD_EVERY_TICKS
    if (!Number.isSafeInteger(this.yieldEveryTicks) || this.yieldEveryTicks < 1) {
      throw new RangeError('Rigid simulation yield interval is invalid')
    }
  }

  /** Allocates and fills one detached dense pose result. */
  async simulate(
    recipe: RigidBodyBakeRecipe,
    context: RigidBodySimulationContext,
  ): Promise<RigidBodySimulationResult> {
    checkCancelled(context.signal)
    const clock = new SimulationClock(recipe)
    const valueCount = safePoseValueCount(clock.sampleCount, recipe.bodies.length)
    const poses = new Float64Array(valueCount)
    const sampleTimesMs = clock.sampleTimesMs()
    const backend = this.backendFactory()
    const events: RigidBodySolverEvent[] = []
    try {
      if (backend.id !== recipe.solverId || backend.version !== recipe.solverVersion) {
        throw new Error('Rigid physics backend does not match the recipe')
      }
      backend.initialize(recipe)
      writeSample(poses, 0, recipe, backend)
      context.reportProgress({ tick: 0, totalTicks: clock.totalTicks })
      for (let tick = 1; tick <= clock.totalTicks; tick++) {
        checkCancelled(context.signal)
        backend.step(clock.stepDurationMs)
        events.push(...backend.drainEvents())
        if (events.length > MAX_RETAINED_EVENTS) throw new RangeError('Rigid solver event budget exceeded')
        if (clock.isSampleTick(tick)) writeSample(poses, clock.sampleIndexForTick(tick), recipe, backend)
        if (tick % this.yieldEveryTicks === 0 || tick === clock.totalTicks) {
          context.reportProgress({ tick, totalTicks: clock.totalTicks })
          await yieldToHost()
        }
      }
      checkCancelled(context.signal)
      return { execution: this.execution, sampleTimesMs, poses, events: freezeEvents(events) }
    } finally {
      backend.dispose()
    }
  }
}

function freezeEvents(events: readonly RigidBodySolverEvent[]): readonly RigidBodySolverEvent[] {
  return Object.freeze(events.map(event => Object.freeze({
    ...event,
    bodyIds: Object.freeze([...event.bodyIds]),
    ...(event.fracture ? { fracture: Object.freeze({
      ...event.fracture,
      ...(event.fracture.contactPointPx ? { contactPointPx: Object.freeze({ ...event.fracture.contactPointPx }) } : {}),
      ...(event.fracture.contactNormal ? { contactNormal: Object.freeze({ ...event.fracture.contactNormal }) } : {}),
    }) } : {}),
  })))
}

function writeSample(
  target: Float64Array,
  sampleIndex: number,
  recipe: RigidBodyBakeRecipe,
  backend: PhysicsBackend,
): void {
  recipe.bodies.forEach((body, bodyIndex) => {
    const pose = backend.readPose(body.bodyId)
    const offset = (sampleIndex * recipe.bodies.length + bodyIndex) * 3
    if (![pose.centerX, pose.centerY, pose.angleDeg].every(Number.isFinite)) {
      throw new RangeError(`Rigid solver produced a non-finite pose for ${body.bodyId}`)
    }
    target[offset] = pose.centerX
    target[offset + 1] = pose.centerY
    target[offset + 2] = pose.angleDeg
  })
}

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw cancelledJobError()
}

function yieldToHost(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function safePoseValueCount(sampleCount: number, bodyCount: number): number {
  const result = sampleCount * bodyCount * 3
  if (!Number.isSafeInteger(result) || result < 1) throw new RangeError('Rigid pose dimensions exceed supported limits')
  return result
}
