import { FractureRigidRecipeCompiler } from '@/lib/fracture/FractureRigidRecipeCompiler'
import { FractureSourceBoundaryCompiler } from '@/lib/fracture/FractureSourceBoundaryCompiler'
import { VoronoiFractureGenerator } from '@/lib/fracture/VoronoiFractureGenerator'
import type { ChronoScene } from '@/lib/types'
import type { FractureGeneration } from '@/lib/types/fracture'
import type {
  RigidBodyAuthoring,
  RigidBodyBakeRecipe,
  RigidBodyMaterial,
  RigidFractureExplosion,
} from '@/lib/types/physics'
import { RigidBodySceneCompiler } from './RigidBodySceneCompiler'

export const DEFAULT_RIGID_BODY_MATERIAL: RigidBodyMaterial = Object.freeze({
  densityKgPerSquareMeter: 1,
  friction: 0.2,
  restitution: 0.2,
  airFriction: 0.01,
})

export interface PhysicsBodyInput {
  readonly layerId: string
  readonly motionType: 'dynamic' | 'static'
  readonly material?: Partial<RigidBodyMaterial>
  readonly initialVelocityPxPerSecond?: { readonly x?: number; readonly y?: number }
  readonly initialAngularVelocityDegPerSecond?: number
}

export interface RigidBakeRecipeInput {
  readonly timelineId: string
  readonly startTimeMs?: number
  readonly durationMs: number
  readonly stepHz?: number
  readonly sampleFps?: number
  readonly pixelsPerMeter?: number
  readonly gravity?: { readonly x?: number; readonly y?: number }
  readonly bodies: readonly PhysicsBodyInput[]
}

export interface VoronoiBakeRecipeInput {
  readonly sourceLayerId: string
  readonly staticLayerIds?: readonly string[]
  readonly timelineId: string
  readonly startTimeMs?: number
  readonly durationMs: number
  /** Required when fractureTrigger is omitted or uses the time policy. */
  readonly fractureTimeMs?: number
  readonly fractureTrigger?:
    | { readonly kind: 'time' }
    | {
      readonly kind: 'impact'
      readonly minimumRelativeNormalSpeedPxPerSecond: number
      readonly colliderLayerIds?: readonly string[]
    }
  readonly explosion?: RigidFractureExplosion
  readonly fragmentCount: number
  readonly seed: number
  readonly generationId: string
  readonly stepHz?: number
  readonly sampleFps?: number
  readonly pixelsPerMeter?: number
  readonly gravity?: { readonly x?: number; readonly y?: number }
  readonly material?: Partial<RigidBodyMaterial>
  readonly initialVelocityPxPerSecond?: { readonly x?: number; readonly y?: number }
  readonly initialAngularVelocityDegPerSecond?: number
}

export interface PreparedVoronoiBakeRecipe {
  readonly recipe: RigidBodyBakeRecipe
  readonly generation: FractureGeneration
}

/**
 * Composes the existing scene, Voronoi and fracture compilers for product and
 * automation callers that need an unpublished rigid-body recipe.
 *
 * Instances are stateless. Inputs use composition pixels, seconds-facing
 * gravity values and milliseconds; the returned recipe owns immutable source
 * snapshots only. No solver, worker, scene mutation or runtime handle is
 * created here. Unsupported source geometry fails explicitly in the owning
 * compiler rather than falling back to approximate colliders.
 */
export class PhysicsBakeRecipeFactory {
  private readonly rigidCompiler = new RigidBodySceneCompiler()
  private readonly fractureCompiler = new FractureRigidRecipeCompiler()
  private readonly fractureGenerator = new VoronoiFractureGenerator()
  private readonly sourceBoundaryCompiler = new FractureSourceBoundaryCompiler()

  /** Compile a deterministic rigid recipe without starting the simulation. */
  compileRigid(scene: ChronoScene, input: RigidBakeRecipeInput): RigidBodyBakeRecipe {
    return this.rigidCompiler.compile(scene, {
      timelineId: input.timelineId,
      startTimeMs: input.startTimeMs ?? 0,
      durationMs: input.durationMs,
      stepHz: input.stepHz,
      sampleFps: input.sampleFps,
      pixelsPerMeter: input.pixelsPerMeter,
      gravityMetersPerSecondSquared: resolveGravity(input.gravity),
      bodies: input.bodies.map(body => createRigidBodyAuthoring(body)),
    })
  }

  /**
   * Generate one convex-source Voronoi manifest and compile its replacement
   * into a rigid recipe. The realized polygons are returned for the eventual
   * atomic editor command; callers must keep them paired with this recipe.
   */
  compileVoronoi(scene: ChronoScene, input: VoronoiBakeRecipeInput): PreparedVoronoiBakeRecipe {
    const source = scene.layers.find(layer => layer.id === input.sourceLayerId)
    if (!source) throw new Error(`Fracture source layer does not exist: ${input.sourceLayerId}`)
    const boundary = this.sourceBoundaryCompiler.compile(source)
    const generation = this.fractureGenerator.generate({
      generationId: input.generationId,
      sourceOwnerId: source.id,
      sourcePolygon: boundary.polygon,
      fragmentCount: input.fragmentCount,
      seed: input.seed,
    })
    const material = resolveMaterial(input.material)
    const sourceBody = createRigidBodyAuthoring({
      layerId: source.id,
      motionType: 'dynamic',
      material,
      initialVelocityPxPerSecond: input.initialVelocityPxPerSecond,
      initialAngularVelocityDegPerSecond: input.initialAngularVelocityDegPerSecond,
    }, boundary.colliderKind)
    const staticBodies = (input.staticLayerIds ?? []).map(layerId => createRigidBodyAuthoring({
      layerId,
      motionType: 'static',
      material,
    }))
    const recipe = this.fractureCompiler.compile(scene, {
      generation,
      timelineId: input.timelineId,
      startTimeMs: input.startTimeMs ?? 0,
      durationMs: input.durationMs,
      fractureTimeMs: input.fractureTimeMs,
      fractureTrigger: input.fractureTrigger,
      explosion: input.explosion,
      sourceBody,
      staticBodies,
      stepHz: input.stepHz,
      sampleFps: input.sampleFps,
      pixelsPerMeter: input.pixelsPerMeter,
      gravityMetersPerSecondSquared: resolveGravity(input.gravity),
    })
    return { recipe, generation }
  }
}

/** Convert concise product/MCP settings into complete persisted authoring. */
export function createRigidBodyAuthoring(
  input: PhysicsBodyInput,
  collider: RigidBodyAuthoring['collider'] = 'rectangle',
): RigidBodyAuthoring {
  return {
    layerId: input.layerId,
    motionType: input.motionType,
    collider,
    material: resolveMaterial(input.material),
    initialVelocityPxPerSecond: {
      x: input.initialVelocityPxPerSecond?.x ?? 0,
      y: input.initialVelocityPxPerSecond?.y ?? 0,
    },
    initialAngularVelocityDegPerSecond: input.initialAngularVelocityDegPerSecond ?? 0,
  }
}

/** Merge known material fields with stable first-slice defaults. */
export function resolveMaterial(material?: Partial<RigidBodyMaterial>): RigidBodyMaterial {
  return { ...DEFAULT_RIGID_BODY_MATERIAL, ...material }
}

/** Resolve y-down earth-like gravity without accepting extra fields. */
export function resolveGravity(value?: { readonly x?: number; readonly y?: number }): { x: number; y: number } {
  return { x: value?.x ?? 0, y: value?.y ?? 9.81 }
}
