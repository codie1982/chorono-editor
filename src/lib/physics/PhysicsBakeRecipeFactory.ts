import { FractureRigidRecipeCompiler } from '@/lib/fracture/FractureRigidRecipeCompiler'
import { FractureRecursiveRecipeCompiler } from '@/lib/fracture/FractureRecursiveRecipeCompiler'
import type { FractureGenerationBudgetLimits } from '@/lib/types/fracture'
import { FractureBondGraphCompiler } from '@/lib/fracture/FractureBondGraphCompiler'
import { FractureSourceBoundaryCompiler } from '@/lib/fracture/FractureSourceBoundaryCompiler'
import { FractureSourceRegionCompiler } from '@/lib/fracture/FractureSourceRegionCompiler'
import { VoronoiFractureGenerator } from '@/lib/fracture/VoronoiFractureGenerator'
import { VoronoiRegionFractureGenerator } from '@/lib/fracture/VoronoiRegionFractureGenerator'
import type { ChronoScene } from '@/lib/types'
import type { FractureGeneration, FractureRegionGeneration } from '@/lib/types/fracture'
import type {
  FractureBondDamageReset,
  FractureBondDefaults,
  FractureBondForcedBreak,
  FractureBondOverride,
} from '@/lib/types/fractureCluster'
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
  readonly cluster?: {
    readonly graphId?: string
    readonly defaults?: Partial<FractureBondDefaults>
    readonly overrides?: readonly FractureBondOverride[]
    readonly forcedBreaks?: readonly FractureBondForcedBreak[]
    readonly damageResets?: readonly FractureBondDamageReset[]
  }
  /** Optional first FRACTURE3 precomputed child generation. */
  readonly secondary?: {
    readonly parentFragmentIndex: number
    readonly fractureTimeMs: number
    readonly fragmentCount: number
    readonly seed: number
    readonly generationId?: string
    readonly budgets?: Partial<FractureGenerationBudgetLimits>
  }
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
  readonly generation: FractureGeneration | FractureRegionGeneration
  readonly generations: readonly (FractureGeneration | FractureRegionGeneration)[]
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
  private readonly recursiveCompiler = new FractureRecursiveRecipeCompiler()
  private readonly fractureGenerator = new VoronoiFractureGenerator()
  private readonly regionFractureGenerator = new VoronoiRegionFractureGenerator()
  private readonly sourceBoundaryCompiler = new FractureSourceBoundaryCompiler()
  private readonly sourceRegionCompiler = new FractureSourceRegionCompiler()
  private readonly bondGraphCompiler = new FractureBondGraphCompiler()

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
    const sourceRegion = this.sourceRegionCompiler.compile(source)
    const boundary = sourceRegion.isSingleConvexRing ? this.sourceBoundaryCompiler.compile(source) : undefined
    const generation = boundary
      ? this.fractureGenerator.generate({
        generationId: input.generationId,
        sourceOwnerId: source.id,
        sourcePolygon: boundary.polygon,
        fragmentCount: input.fragmentCount,
        seed: input.seed,
      })
      : this.regionFractureGenerator.generate({
        generationId: input.generationId,
        sourceOwnerId: source.id,
        sourceRegion,
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
    }, boundary?.colliderKind ?? 'compoundPolygon')
    const staticBodies = (input.staticLayerIds ?? []).map(layerId => createRigidBodyAuthoring({
      layerId,
      motionType: 'static',
      material,
    }))
    const bondGraph = input.cluster ? this.bondGraphCompiler.compile(generation, {
      graphId: input.cluster.graphId ?? defaultClusterGraphId(input.generationId, generation.topologyHash),
      defaults: resolveBondDefaults(input.cluster.defaults, input.seed),
      overrides: input.cluster.overrides,
    }) : undefined
    const rootInput = {
      generation,
      ...(bondGraph ? {
        bondGraph,
        forcedBondBreaks: input.cluster?.forcedBreaks,
        bondDamageResets: input.cluster?.damageResets,
      } : {}),
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
    }
    if (!input.secondary) {
      const recipe = this.fractureCompiler.compile(scene, rootInput)
      return { recipe, generation, generations: [generation] }
    }
    if (generation.schemaVersion !== 1) {
      throw new Error('First secondary-fracture slice requires a convex root generation')
    }
    if (input.cluster) throw new Error('Secondary fracture cannot be combined with a bonded root cluster yet')
    if (input.fractureTrigger?.kind === 'impact') {
      throw new Error('Secondary fracture currently requires a fixed-time root event')
    }
    const parentIndex = input.secondary.parentFragmentIndex
    if (!Number.isSafeInteger(parentIndex) || parentIndex < 0 || parentIndex >= generation.fragments.length) {
      throw new RangeError('Secondary fracture parent index is outside the root fragment set')
    }
    const parent = generation.fragments[parentIndex]
    const childGeneration = this.fractureGenerator.generate({
      generationId: input.secondary.generationId ?? childGenerationId(input.generationId, parentIndex),
      sourceOwnerId: parent.id,
      parentId: parent.id,
      generationIndex: 1,
      sourcePolygon: parent.polygon,
      fragmentCount: input.secondary.fragmentCount,
      seed: input.secondary.seed,
    })
    const recipe = this.recursiveCompiler.compile(scene, {
      root: rootInput,
      children: [{ generation: childGeneration, fractureTimeMs: input.secondary.fractureTimeMs }],
      budgets: input.secondary.budgets,
    })
    return { recipe, generation, generations: [generation, childGeneration] }
  }
}

function childGenerationId(rootGenerationId: string, parentIndex: number): string {
  const suffix = `-g1-p${parentIndex}`
  return `${rootGenerationId.slice(0, 116 - suffix.length)}${suffix}`
}

/** Stable first FRACTURE2 material defaults shared by UI and MCP callers. */
export function resolveBondDefaults(
  value: Partial<FractureBondDefaults> | undefined,
  fallbackSeed: number,
): FractureBondDefaults {
  return {
    impulseStrength: value?.impulseStrength ?? 40,
    damageThreshold: value?.damageThreshold ?? 80,
    damageDecayPerSecond: value?.damageDecayPerSecond ?? 0,
    relativeNormalSpeedScale: value?.relativeNormalSpeedScale ?? 0.1,
    variation: value?.variation ?? 0.1,
    seed: value?.seed ?? fallbackSeed,
  }
}

function defaultClusterGraphId(generationId: string, topologyHash: string): string {
  const readable = `${generationId}-cluster`
  return readable.length <= 96 ? readable : `${generationId.slice(0, 79)}-cluster-${topologyHash.slice(0, 8)}`
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
