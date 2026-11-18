import { hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import type { FractureGeneration, FracturePoint2D, FragmentGeometry } from '@/lib/types/fracture'

/** Hashes every portable source/seed/fragment field that defines topology. */
export function hashFractureGeneration(
  generation: Omit<FractureGeneration, 'topologyHash'>,
): string {
  return hashCanonicalRecords('fracture-generation-v1', [
    `id:${generation.generationId}`,
    `index:${generation.generationIndex}`,
    `parent:${generation.parentId}`,
    `root-seed:${generation.rootSeed}`,
    `attempt:${generation.generationAttempt}`,
    `requested:${generation.requestedFragmentCount}`,
    `source-owner:${generation.source.ownerId}`,
    `source-revision:${generation.source.revision}`,
    `source-area:${number(generation.source.areaPx2)}`,
    `source-polygon:${polygon(generation.source.polygon)}`,
    `algorithm:${generation.algorithm.id}@${generation.algorithm.version}`,
    `compiler:${generation.algorithm.compilerVersion}`,
    ...generation.seeds.map(seed => `seed:${seed.id}:${point(seed)}`),
    ...generation.fragments.flatMap(fragmentRecords),
  ])
}

/** Hashes a validated source polygon independently from a generated topology. */
export function hashFractureSource(ownerId: string, polygonValue: readonly FracturePoint2D[]): string {
  return hashCanonicalRecords('fracture-source-v1', [`owner:${ownerId}`, `polygon:${polygon(polygonValue)}`])
}

function fragmentRecords(fragment: FragmentGeometry): string[] {
  return [
    `fragment:${fragment.id}`,
    `fragment-seed:${fragment.seedId}`,
    `fragment-area:${number(fragment.areaPx2)}`,
    `fragment-centroid:${point(fragment.centroidPx)}`,
    `fragment-polygon:${polygon(fragment.polygon)}`,
  ]
}

function polygon(points: readonly FracturePoint2D[]): string {
  return points.map(point).join(';')
}

function point(value: FracturePoint2D): string {
  return `${number(value.x)},${number(value.y)}`
}

function number(value: number): string {
  return Number(value.toFixed(9)).toString()
}
