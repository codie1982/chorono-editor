import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
import type { RigidBodySolverEvent } from '@/lib/physics/PhysicsBackend'

export type RigidBodyWorkerRequest =
  | { readonly kind: 'simulate'; readonly recipe: RigidBodyBakeRecipe }
  | { readonly kind: 'cancel' }

export type RigidBodyWorkerReply =
  | { readonly kind: 'ready'; readonly supported: boolean }
  | { readonly kind: 'progress'; readonly tick: number; readonly totalTicks: number }
  | { readonly kind: 'result'; readonly sampleTimesBuffer: ArrayBuffer; readonly posesBuffer: ArrayBuffer; readonly events: readonly RigidBodySolverEvent[] }
  | { readonly kind: 'error'; readonly name: string; readonly message: string }

/** Narrow platform handle used by real Worker and deterministic unit tests. */
export interface RigidBodyWorkerHandle {
  onmessage: ((event: MessageEvent<RigidBodyWorkerReply>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(message: RigidBodyWorkerRequest, transfer?: Transferable[]): void
  terminate(): void
}
