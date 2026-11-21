import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
import type { RigidPose2D } from './RigidVisualTransform'

export type RigidBodySolverEventKind =
  | 'contact-start'
  | 'contact-end'
  | 'sleep-start'
  | 'sleep-end'
  | 'fracture'

export interface RigidBodyFractureSolverEvidence {
  readonly eventId: string
  readonly triggerKind: 'time' | 'impact'
  readonly contactBodyId?: string
  readonly relativeNormalSpeedPxPerSecond?: number
  readonly contactPointPx?: { readonly x: number; readonly y: number }
  readonly contactNormal?: { readonly x: number; readonly y: number }
}

/**
 * One solver-observed discontinuity at an exact fixed tick.
 *
 * Body ids use recipe ids rather than Matter handles. Contact ids are sorted
 * and contain two bodies; sleep events contain one dynamic body. Records are
 * detached values that may cross the Worker boundary and never enter ordinary
 * scene JSON directly.
 */
export interface RigidBodySolverEvent {
  readonly kind: RigidBodySolverEventKind
  readonly tick: number
  readonly timeMs: number
  readonly bodyIds: readonly string[]
  /** Present only for the exact topology replacement marker. */
  readonly fracture?: RigidBodyFractureSolverEvidence
}

/** Narrow solver contract used by the rigid bake adapter. */
export interface PhysicsBackend {
  readonly id: string
  readonly version: string
  initialize(recipe: RigidBodyBakeRecipe): void
  step(deltaMs: number): void
  readPose(bodyId: string): RigidPose2D
  /** Transfers events accumulated since the preceding drain call. */
  drainEvents(): readonly RigidBodySolverEvent[]
  dispose(): void
}

export type PhysicsBackendFactory = () => PhysicsBackend
