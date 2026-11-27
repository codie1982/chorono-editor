import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
import type { RigidBodySolverEvent } from '@/lib/physics/PhysicsBackend'

export type RigidBodySimulationExecution = 'inline' | 'worker'

/** Progress reported by the fixed-step solver before track compilation. */
export interface RigidBodySimulationProgress {
  readonly tick: number
  readonly totalTicks: number
}

/**
 * Dense solver output in composition pixels, y-down and unwrapped degrees.
 *
 * Buffers are exclusively owned by the receiver. A worker implementation
 * transfers them; an inline implementation returns newly allocated buffers.
 */
export interface RigidBodySimulationResult {
  readonly execution: RigidBodySimulationExecution
  readonly sampleTimesMs: Float64Array
  readonly poses: Float64Array
  /** Ordered fixed-tick events used as protected simplification boundaries. */
  readonly events: readonly RigidBodySolverEvent[]
}

export interface RigidBodySimulationContext {
  readonly signal: AbortSignal
  readonly reportProgress: (progress: RigidBodySimulationProgress) => void
}

/** Variable execution boundary for one deterministic rigid solver run. */
export interface RigidBodySimulationExecutor {
  readonly execution: RigidBodySimulationExecution
  simulate(recipe: RigidBodyBakeRecipe, context: RigidBodySimulationContext): Promise<RigidBodySimulationResult>
}
