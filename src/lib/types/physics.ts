import type { SimulationCacheHeader } from '@/lib/simulation/SimulationCacheHeader'
import type { AnyFractureGeneration, FractureAppearanceSnapshot } from './fracture'

export type RigidBodyMotionType = 'dynamic' | 'static'

export type RigidBodyCollider = 'rectangle' | 'convexPolygon' | 'compoundPolygon'

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
  /** Non-overlapping convex parts relative to the compound body's centre. */
  readonly colliderPartsPx?: readonly (readonly { readonly x: number; readonly y: number }[])[]
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

/** Authored condition that replaces one source body with prepared fragments. */
export type RigidFractureTrigger =
  | { readonly kind: 'time' }
  | {
    readonly kind: 'impact'
    /** Pre-solve closing speed at the contact point, in composition pixels/s. */
    readonly minimumRelativeNormalSpeedPxPerSecond: number
    /** Explicit bodies allowed to trigger the source; no implicit scene-wide collision. */
    readonly colliderBodyIds: readonly string[]
  }

/** Optional, explicitly non-physical velocity impulse applied once at fracture. */
export interface RigidFractureExplosion {
  /** Source-local offset from its centre of mass, before source rotation. */
  readonly centerLocalOffsetPx: { readonly x: number; readonly y: number }
  readonly radialVelocityPxPerSecond: number
  /** Composition-space clockwise direction; 0 points right and 90 points down. */
  readonly directionDeg: number
  readonly directionalVelocityPxPerSecond: number
  readonly spinVelocityDegPerSecond: number
  /** Per-fragment multiplier range around one, from 0 (uniform) to 1. */
  readonly variation: number
  readonly seed: number
}

/** Solver-observed evidence for an impact-triggered topology event. */
export interface RigidFractureImpactRealization {
  readonly kind: 'impact'
  readonly contactBodyId: string
  readonly relativeNormalSpeedPxPerSecond: number
  readonly contactPointPx: { readonly x: number; readonly y: number }
  /** Unit normal pointing from the contact body toward the fracture source. */
  readonly contactNormal: { readonly x: number; readonly y: number }
}

/** One atomic source-to-fragment body replacement at an integer solver tick. */
export interface RigidFractureEvent {
  readonly id: string
  /** Zero until an impact trigger is realized; timed and committed events are positive. */
  readonly timeMs: number
  readonly tick: number
  readonly sourceBodyId: string
  readonly fragmentBodyIds: readonly string[]
  /** Missing on legacy recipes and therefore interpreted as a timed event. */
  readonly trigger?: RigidFractureTrigger
  readonly explosion?: RigidFractureExplosion
  readonly realization?: RigidFractureImpactRealization
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
  /** Supported source appearance captured for current fracture recipes. */
  readonly fractureAppearance?: FractureAppearanceSnapshot
}

export type RigidPoseCacheHeader = SimulationCacheHeader<'rigidPose'> & {
  readonly bodyIds: readonly string[]
  readonly channels: readonly ['centerX', 'centerY', 'angle']
}

export interface RigidBakeTrackOwnership {
  readonly target: string
  readonly contentHash: string
}

/** One generated fracture layer whose initial portable content is bake-owned. */
export interface RigidBakeLayerOwnership {
  readonly layerId: string
  readonly contentHash: string
}

/** Immutable topology manifest owned by one fracture bake. */
export interface RigidBakeGenerationOwnership {
  readonly generationId: string
  readonly topologyHash: string
}

/**
 * Persisted recipe and generated-content ownership; dense pose samples stay out.
 *
 * The optional fields are an additive schema-v1 extension. Older projects
 * without them remain readable, but destructive fracture lifecycle actions
 * must treat their generated-layer ownership as unverified.
 */
export interface RigidBakeRecord {
  readonly schemaVersion: 1
  readonly id: string
  readonly recipe: RigidBodyBakeRecipe
  readonly sampleCount: number
  readonly tracks: readonly RigidBakeTrackOwnership[]
  readonly generatedLayers?: readonly RigidBakeLayerOwnership[]
  readonly fractureGeneration?: RigidBakeGenerationOwnership
  /** Timeline memberships introduced by this bake, not pre-existing entries. */
  readonly timelineLayerIdsAdded?: readonly string[]
}

/** Optional 2D physics authoring state. Runtime engine objects never enter it. */
export interface PhysicsSceneData {
  readonly schemaVersion: 1
  readonly rigidBakes: readonly RigidBakeRecord[]
  /** Realized immutable topology; dense per-frame pose samples remain external. */
  readonly fractureGenerations?: readonly AnyFractureGeneration[]
}
