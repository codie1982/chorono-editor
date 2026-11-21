import { Delaunay } from 'd3-delaunay'
import type {
  FractureGeneration,
  FracturePoint2D,
  FractureSeedPoint,
  FragmentGeometry,
} from '@/lib/types/fracture'
import { ConvexPolygon2D, clipConvexPolygon } from './ConvexPolygon2D'
import { hashFractureGeneration, hashFractureSource } from './FractureManifestHash'
import { SeededRandom } from './SeededRandom'

const MIN_FRAGMENT_COUNT = 2
const MAX_FRAGMENT_COUNT = 100
const MAX_SEED_DRAWS_PER_POINT = 4096
const MAX_GENERATION_ID_LENGTH = 116

export interface VoronoiFractureInput {
  /**
   * Stable ASCII scene-id prefix. The 116-character limit leaves room for
   * the longest generated `-fragment-99` layer id inside the scene's
   * 128-character entity-id contract.
   */
  readonly generationId: string
  readonly sourceOwnerId: string
  readonly sourcePolygon: readonly FracturePoint2D[]
  readonly fragmentCount: number
  readonly seed: number
  /** Minimum fragment area as a fraction of mean area. Default 0.01. */
  readonly minimumAreaRatio?: number
  /** Whole-generation retries when a cell is too small. Default 24. */
  readonly maxGenerationAttempts?: number
}

/**
 * Generates one deterministic, area-preserving Voronoi fracture manifest.
 *
 * D3 creates cells inside source bounds; every cell is then clipped against
 * the actual validated convex source polygon. Seeds use a compiler-owned PRNG,
 * are de-duplicated by a scale-aware distance, and are stored with realized
 * polygons. A sliver causes the entire generation to retry deterministically,
 * never a silent fragment drop that would leave a hole. Instances are
 * stateless and safe to share.
 */
export class VoronoiFractureGenerator {
  /** Creates generation zero in source-local pixels without mutating input. */
  generate(input: VoronoiFractureInput): FractureGeneration {
    assertSceneId(input.generationId, 'Fracture generation id', MAX_GENERATION_ID_LENGTH)
    assertSceneId(input.sourceOwnerId, 'Fracture source owner id', 128)
    if (!Number.isSafeInteger(input.fragmentCount) || input.fragmentCount < MIN_FRAGMENT_COUNT
      || input.fragmentCount > MAX_FRAGMENT_COUNT) {
      throw new RangeError(`Fracture fragment count must be ${MIN_FRAGMENT_COUNT}–${MAX_FRAGMENT_COUNT}`)
    }
    if (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) {
      throw new RangeError('Fracture seed must be an unsigned 32-bit integer')
    }
    const minimumAreaRatio = input.minimumAreaRatio ?? 0.01
    if (!Number.isFinite(minimumAreaRatio) || minimumAreaRatio < 0 || minimumAreaRatio >= 1) {
      throw new RangeError('Fracture minimum area ratio must be in [0, 1)')
    }
    const maxAttempts = input.maxGenerationAttempts ?? 24
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 256) {
      throw new RangeError('Fracture generation attempts must be an integer from 1 to 256')
    }
    const source = new ConvexPolygon2D(input.sourcePolygon, 'Fracture source polygon')
    const sourceRevision = hashFractureSource(input.sourceOwnerId, source.points)
    const meanArea = source.area / input.fragmentCount

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const seeds = createSeeds(source, input.fragmentCount, mixSeed(input.seed, attempt), input.generationId)
      const fragments = this.cells(source, seeds, input.generationId)
      const minimumArea = meanArea * minimumAreaRatio
      if (fragments.length !== input.fragmentCount || fragments.some(fragment => fragment.areaPx2 < minimumArea)) continue
      assertAreaPreserved(source.area, fragments)
      const withoutHash: Omit<FractureGeneration, 'topologyHash'> = {
        schemaVersion: 1,
        generationId: input.generationId,
        generationIndex: 0,
        parentId: input.sourceOwnerId,
        rootSeed: input.seed,
        generationAttempt: attempt,
        requestedFragmentCount: input.fragmentCount,
        source: {
          ownerId: input.sourceOwnerId,
          revision: sourceRevision,
          polygon: source.points,
          areaPx2: source.area,
          boundsPx: source.bounds,
        },
        algorithm: { id: 'd3-delaunay', version: '6.0.4', compilerVersion: 2 },
        seeds,
        fragments,
      }
      return Object.freeze({ ...withoutHash, topologyHash: hashFractureGeneration(withoutHash) })
    }
    throw new Error(`Voronoi fracture could not satisfy minimum fragment area after ${maxAttempts} attempts`)
  }

  private cells(
    source: ConvexPolygon2D,
    seeds: readonly FractureSeedPoint[],
    generationId: string,
  ): FragmentGeometry[] {
    const points = seeds.map(seed => [seed.x, seed.y] as [number, number])
    const voronoi = Delaunay.from(points).voronoi([
      source.bounds.minX, source.bounds.minY, source.bounds.maxX, source.bounds.maxY,
    ])
    return seeds.map((seed, index) => {
      const cell = voronoi.cellPolygon(index)
      if (!cell) throw new Error(`Voronoi cell is missing for seed ${seed.id}`)
      const clipped = clipConvexPolygon(cell.map(([x, y]) => ({ x, y })), source)
      const polygon = new ConvexPolygon2D(clipped, `Voronoi fragment ${index}`)
      if (!polygon.contains(seed, 1e-7)) throw new Error(`Voronoi fragment ${index} does not contain its seed`)
      return Object.freeze({
        id: `${generationId}-fragment-${index}`,
        seedId: seed.id,
        polygon: polygon.points,
        centroidPx: polygon.centroid,
        areaPx2: polygon.area,
        boundsPx: polygon.bounds,
      })
    })
  }
}

function createSeeds(
  source: ConvexPolygon2D,
  count: number,
  seed: number,
  generationId: string,
): FractureSeedPoint[] {
  const random = new SeededRandom(seed)
  const seeds: FractureSeedPoint[] = []
  const separation = Math.sqrt(source.area / count) * 1e-4
  const width = source.bounds.maxX - source.bounds.minX
  const height = source.bounds.maxY - source.bounds.minY
  for (let index = 0; index < count; index++) {
    let realized: FracturePoint2D | undefined
    for (let draw = 0; draw < MAX_SEED_DRAWS_PER_POINT; draw++) {
      const candidate = {
        x: source.bounds.minX + random.next() * width,
        y: source.bounds.minY + random.next() * height,
      }
      if (source.contains(candidate) && seeds.every(existing => Math.hypot(existing.x - candidate.x, existing.y - candidate.y) > separation)) {
        realized = candidate
        break
      }
    }
    if (!realized) throw new Error(`Fracture seed ${index} could not be placed inside the source polygon`)
    seeds.push(Object.freeze({ id: `${generationId}-seed-${index}`, ...realized }))
  }
  return seeds
}

function assertAreaPreserved(sourceArea: number, fragments: readonly FragmentGeometry[]): void {
  const fragmentArea = fragments.reduce((sum, fragment) => sum + fragment.areaPx2, 0)
  const tolerance = Math.max(1e-6, sourceArea * 1e-8)
  if (Math.abs(fragmentArea - sourceArea) > tolerance) {
    throw new Error(`Voronoi fracture does not preserve source area (${fragmentArea} vs ${sourceArea})`)
  }
}

function mixSeed(seed: number, attempt: number): number {
  let value = (seed ^ Math.imul(attempt + 1, 0x9e3779b9)) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d) >>> 0
  value ^= value >>> 15
  return value >>> 0
}

/** Validates ids that may become scene layer ids or prefixes for them. */
function assertSceneId(value: string, label: string, maxLength: number): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength || !/^[\w-]+$/.test(value)) {
    throw new Error(`${label} must be 1–${maxLength} ASCII letters, digits, underscores or hyphens`)
  }
}
