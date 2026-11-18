import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
import type { RigidPose2D } from './RigidVisualTransform'

/** Narrow solver contract used by the rigid bake adapter. */
export interface PhysicsBackend {
  readonly id: string
  readonly version: string
  initialize(recipe: RigidBodyBakeRecipe): void
  step(deltaMs: number): void
  readPose(bodyId: string): RigidPose2D
  dispose(): void
}

export type PhysicsBackendFactory = () => PhysicsBackend
