import { canonicalJson, hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import type {
  AnyFractureGeneration,
  FractureGenerationBudgetLimits,
  FractureGenerationHierarchy,
  FractureGenerationLineageEntry,
} from '@/lib/types/fracture'
import { FractureManifestValidator } from './FractureManifestValidator'
import { FractureRegionManifestValidator } from './FractureRegionManifestValidator'

export const DEFAULT_FRACTURE_GENERATION_BUDGETS: FractureGenerationBudgetLimits = Object.freeze({
  maxDepth: 3,
  maxGenerations: 16,
  maxFragments: 256,
  maxTriangles: 4096,
  maxPortableBytes: 8 * 1024 * 1024,
})

/**
 * Validates an ordered root/child topology forest and admits it against limits.
 *
 * The first manifest must be the only generation-zero root. Every later convex
 * generation names a fragment from an earlier generation as both `parentId`
 * and source owner, and its depth must be exactly one greater than that parent
 * generation. Fragment and generation ids are globally unique. Usage is
 * derived from realized geometry and UTF-8 portable JSON, so callers do not
 * estimate resources from requested Voronoi counts. Instances are stateless.
 */
export class FractureGenerationHierarchyCompiler {
  private readonly convexValidator = new FractureManifestValidator()
  private readonly regionValidator = new FractureRegionManifestValidator()

  /** Compile an immutable lineage manifest or fail before solver allocation. */
  compile(
    generations: readonly AnyFractureGeneration[],
    limits: Partial<FractureGenerationBudgetLimits> = {},
  ): FractureGenerationHierarchy {
    if (!generations.length) throw new Error('Fracture hierarchy requires one root generation')
    const resolvedLimits = resolveLimits(limits)
    const generationIds = new Set<string>()
    const fragmentOwner = new Map<string, AnyFractureGeneration>()
    const entries: FractureGenerationLineageEntry[] = []

    generations.forEach((generation, index) => {
      if (generation.schemaVersion === 1) this.convexValidator.validate(generation)
      else this.regionValidator.validate(generation)
      if (generationIds.has(generation.generationId)) {
        throw new Error(`Duplicate fracture generation id: ${generation.generationId}`)
      }
      generationIds.add(generation.generationId)
      if (index === 0) {
        if (generation.generationIndex !== 0) throw new Error('Fracture hierarchy root must be generation zero')
        entries.push(Object.freeze({ generationId: generation.generationId, generationIndex: 0 }))
      } else {
        if (generation.schemaVersion !== 1 || generation.generationIndex < 1) {
          throw new Error('First FRACTURE3 slice supports convex child generations only')
        }
        const parent = fragmentOwner.get(generation.parentId)
        if (!parent || generation.source.ownerId !== generation.parentId
          || generation.generationIndex !== parent.generationIndex + 1) {
          throw new Error(`Fracture child lineage is invalid: ${generation.generationId}`)
        }
        entries.push(Object.freeze({
          generationId: generation.generationId,
          generationIndex: generation.generationIndex,
          parentGenerationId: parent.generationId,
          parentFragmentId: generation.parentId,
        }))
      }
      generation.fragments.forEach(fragment => {
        if (fragmentOwner.has(fragment.id)) throw new Error(`Duplicate fracture fragment id: ${fragment.id}`)
        fragmentOwner.set(fragment.id, generation)
      })
    })

    const usage = Object.freeze({
      depth: Math.max(...generations.map(generation => generation.generationIndex)),
      generations: generations.length,
      fragments: generations.reduce((sum, generation) => sum + generation.fragments.length, 0),
      triangles: generations.reduce((sum, generation) => sum + generationTriangleCount(generation), 0),
      portableBytes: new TextEncoder().encode(canonicalJson(generations)).byteLength,
    })
    assertAdmitted(usage, resolvedLimits)
    const withoutHash = {
      schemaVersion: 1 as const,
      rootGenerationId: generations[0].generationId,
      entries: Object.freeze(entries),
      limits: resolvedLimits,
      usage,
    }
    return Object.freeze({
      ...withoutHash,
      hierarchyHash: hashCanonicalRecords('fracture-generation-hierarchy-v1', [canonicalJson(withoutHash)]),
    })
  }
}

function resolveLimits(value: Partial<FractureGenerationBudgetLimits>): FractureGenerationBudgetLimits {
  const limits = Object.freeze({ ...DEFAULT_FRACTURE_GENERATION_BUDGETS, ...value })
  const fields: Array<keyof FractureGenerationBudgetLimits> = [
    'maxDepth', 'maxGenerations', 'maxFragments', 'maxTriangles', 'maxPortableBytes',
  ]
  if (fields.some(field => !Number.isSafeInteger(limits[field]) || limits[field] < 1)) {
    throw new RangeError('Fracture hierarchy budgets must be positive safe integers')
  }
  if (limits.maxDepth > 8 || limits.maxGenerations > 32 || limits.maxFragments > 4096
    || limits.maxTriangles > 65_536 || limits.maxPortableBytes > 64 * 1024 * 1024) {
    throw new RangeError('Fracture hierarchy budget exceeds the supported safety ceiling')
  }
  return limits
}

function generationTriangleCount(generation: AnyFractureGeneration): number {
  if (generation.schemaVersion === 1) {
    return generation.fragments.reduce((sum, fragment) => sum + Math.max(0, fragment.polygon.length - 2), 0)
  }
  return generation.fragments.reduce((sum, fragment) => sum + fragment.geometry.topology.triangleIndices.length / 3, 0)
}

function assertAdmitted(
  usage: FractureGenerationHierarchy['usage'],
  limits: FractureGenerationBudgetLimits,
): void {
  const exceeded = usage.depth > limits.maxDepth ? 'depth'
    : usage.generations > limits.maxGenerations ? 'generation count'
      : usage.fragments > limits.maxFragments ? 'fragment count'
        : usage.triangles > limits.maxTriangles ? 'triangle count'
          : usage.portableBytes > limits.maxPortableBytes ? 'portable byte count'
            : undefined
  if (exceeded) throw new RangeError(`Fracture hierarchy ${exceeded} budget exceeded`)
}
