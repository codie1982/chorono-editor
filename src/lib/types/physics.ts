import type { SimulationCacheHeader } from '@/lib/simulation/SimulationCacheHeader'
import type { FractureGeneration } from './fracture'

export type RigidBodyMotionType = 'dynamic' | 'static'

export type RigidBodyCollider = 'rectangle' | 'convexPolygon'

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
  readonly collider: RigidBodyCollider
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
  /** Convex vertices relative to the body's centre, in composition pixels. */
  readonly colliderVerticesPx?: readonly { readonly x: number; readonly y: number }[]
  /** Delayed body activation owned by one topology event. */
  readonly activation?: {
    readonly kind: 'fractureFragment'
    readonly eventId: string
    readonly sourceBodyId: string
    /** Source-body local offset after authored uniform scale, before rotation. */
    readonly sourceLocalOffsetPx: { readonly x: number; readonly y: number }
  }
  readonly visual: {
    readonly widthPx: number
    readonly heightPx: number
    readonly anchorX: number
    readonly anchorY: number
    readonly uniformScale: number
    /** Local centre of mass; rectangle snapshots default to width/2,height/2. */
    readonly centerOfMassLocalPx?: { readonly x: number; readonly y: number }
  }
}

/** One atomic source-to-fragment body replacement at an integer solver tick. */
export interface RigidFractureEvent {
  readonly id: string
  readonly timeMs: number
  readonly tick: number
  readonly sourceBodyId: string
  readonly fragmentBodyIds: readonly string[]
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
  /** Optional first-generation topology events; absent for ordinary rigid bake. */
  readonly fractureEvents?: readonly RigidFractureEvent[]
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
  /** Realized immutable topology; dense per-frame pose samples remain external. */
  readonly fractureGenerations?: readonly FractureGeneration[]
}
