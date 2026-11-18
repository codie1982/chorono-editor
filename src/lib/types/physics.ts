import type { SimulationCacheHeader } from '@/lib/simulation/SimulationCacheHeader'

export type RigidBodyMotionType = 'dynamic' | 'static'

export interface RigidBodyMaterial {
  /** Mass per square metre before conversion to Matter's pixel-area density. */
  densityKgPerSquareMeter: number
  friction: number
  restitution: number
  airFriction: number
}

/** User-authored body role and physical settings; no engine/runtime handles. */
export interface RigidBodyAuthoring {
  readonly layerId: string
  readonly motionType: RigidBodyMotionType
  readonly collider: 'rectangle'
  readonly material: RigidBodyMaterial
  readonly initialVelocityPxPerSecond: { readonly x: number; readonly y: number }
  readonly initialAngularVelocityDegPerSecond: number
}

/** Immutable rectangle body compiled from one supported 2D source layer. */
export interface RigidBodySnapshot extends RigidBodyAuthoring {
  readonly bodyId: string
  readonly centerPx: { readonly x: number; readonly y: number }
  readonly angleDeg: number
  readonly widthPx: number
  readonly heightPx: number
  readonly visual: {
    readonly widthPx: number
    readonly heightPx: number
    readonly anchorX: number
    readonly anchorY: number
    readonly uniformScale: number
  }
}

export interface RigidBodyBakeRecipe {
  readonly version: 1
  readonly kind: 'rigidPose'
  readonly source: { readonly kind: 'rigidScene'; readonly ownerId: string; readonly revision: string }
  readonly recipeHash: string
  readonly timelineId: string
  readonly startTimeMs: number
  readonly durationMs: number
  readonly stepHz: number
  readonly sampleFps: number
  readonly pixelsPerMeter: number
  readonly gravityMetersPerSecondSquared: { readonly x: number; readonly y: number }
  readonly solverId: 'matter-js'
  readonly solverVersion: '0.20.0'
  readonly bodies: readonly RigidBodySnapshot[]
}

export type RigidPoseCacheHeader = SimulationCacheHeader<'rigidPose'> & {
  readonly bodyIds: readonly string[]
  readonly channels: readonly ['centerX', 'centerY', 'angle']
}

export interface RigidBakeTrackOwnership {
  readonly target: string
  readonly contentHash: string
}

/** Persisted recipe and generated-track ownership; dense pose samples stay out. */
export interface RigidBakeRecord {
  readonly schemaVersion: 1
  readonly id: string
  readonly recipe: RigidBodyBakeRecipe
  readonly sampleCount: number
  readonly tracks: readonly RigidBakeTrackOwnership[]
}

/** Optional 2D physics authoring state. Runtime engine objects never enter it. */
export interface PhysicsSceneData {
  readonly schemaVersion: 1
  readonly rigidBakes: readonly RigidBakeRecord[]
}
