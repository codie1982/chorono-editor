import { Delaunay } from 'd3-delaunay'
import { containsMesh2DPoint } from '@/lib/geometry/mesh2d'
import type {
  FracturePoint2D,
  FractureRegionFragmentGeometry,
  FractureRegionGeneration,
  FractureSeedPoint,
} from '@/lib/types/fracture'
import { FractureFragmentAdjacencyBuilder } from './FractureFragmentAdjacencyBuilder'
import { hashFractureRegionGeneration, hashFractureRegionSource } from './FractureManifestHash'
import { FractureRegionClipper } from './FractureRegionClipper'
import type { FractureSourceRegion } from './FractureSourceRegionCompiler'
import { SeededRandom } from './SeededRandom'

const MIN_FRAGMENT_COUNT = 2
const MAX_FRAGMENT_COUNT = 100
const MAX_SEED_DRAWS_PER_POINT = 4096
const MAX_GENERATION_ID_LENGTH = 110

export interface VoronoiRegionFractureInput {
  readonly generationId: string
  readonly sourceOwnerId: string
  readonly sourceRegion: FractureSourceRegion
  /** Voronoi cell count; disconnected intersections may realize more bodies. */
  readonly fragmentCount: number
  readonly seed: number
  /** Minimum connected-component area as a fraction of mean cell area. */
  readonly minimumAreaRatio?: number
  readonly maxGenerationAttempts?: number
}

/**
 * Generates deterministic FRACTURE1 topology for an arbitrary Mesh2D region.
 *
 * Seeds are sampled only from filled source triangles. D3 supplies convex
 * cells over source bounds; `FractureRegionClipper` intersects each cell with
 * the actual concave/holed source and splits edge-disconnected components.
 * The manifest retains interpolated render UVs, convex collider parts,
 * boundary rings and shared-edge adjacency. Instances retain no generation
 * state and are safe to reuse.
 */
export class VoronoiRegionFractureGenerator {
  constructor(
    private readonly clipper = new FractureRegionClipper(),
    private readonly adjacencyBuilder = new FractureFragmentAdjacencyBuilder(),
  ) {}

  /** Creates generation zero in source-local composition pixels. */
  generate(input: VoronoiRegionFractureInput): FractureRegionGeneration {
    validateInput(input)
    const minimumAreaRatio = input.minimumAreaRatio ?? 0.005
    const maxAttempts = input.maxGenerationAttempts ?? 24
    const meanArea = input.sourceRegion.areaPx2 / input.fragmentCount
    const sourceRevision = hashFractureRegionSource(input.sourceOwnerId, input.sourceRegion.geometry)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const seeds = createSeeds(input, mixSeed(input.seed, attempt))
      const fragments = this.createFragments(input, seeds)
      if (!fragments || fragments.some(fragment => fragment.areaPx2 < meanArea * minimumAreaRatio)) continue
      assertAreaPreserved(input.sourceRegion.areaPx2, fragments)
      const withoutHash: Omit<FractureRegionGeneration, 'topologyHash'> = {
        schemaVersion: 2,
        generationId: input.generationId,
        generationIndex: 0,
        parentId: input.sourceOwnerId,
        rootSeed: input.seed,
        generationAttempt: attempt,
        requestedFragmentCount: input.fragmentCount,
        source: Object.freeze({
          ownerId: input.sourceOwnerId,
          revision: sourceRevision,
          topologyHash: input.sourceRegion.geometry.topology.topologyHash,
          rings: Object.freeze(input.sourceRegion.rings.map(ring => Object.freeze({
            points: ring.points,
            signedDoubleArea: ring.signedDoubleArea,
            parentIndex: ring.parentIndex,
            depth: ring.depth,
            role: ring.role,
          }))),
          areaPx2: input.sourceRegion.areaPx2,
          boundsPx: Object.freeze({ ...input.sourceRegion.boundsPx }),
        }),
        algorithm: Object.freeze({ id: 'd3-delaunay-region', version: '6.0.4', compilerVersion: 1 }),
        seeds: Object.freeze(seeds),
        fragments: Object.freeze(fragments),
        adjacency: this.adjacencyBuilder.build(fragments),
      }
      return Object.freeze({ ...withoutHash, topologyHash: hashFractureRegionGeneration(withoutHash) })
    }
    throw new Error(`Voronoi region fracture could not satisfy minimum component area after ${maxAttempts} attempts`)
  }

  private createFragments(
    input: VoronoiRegionFractureInput,
    seeds: readonly FractureSeedPoint[],
  ): FractureRegionFragmentGeometry[] | undefined {
    const bounds = input.sourceRegion.boundsPx
    const voronoi = Delaunay.from(seeds.map(seed => [seed.x, seed.y] as [number, number])).voronoi([
      bounds.minX, bounds.minY, bounds.maxX, bounds.maxY,
    ])
    const fragments: FractureRegionFragmentGeometry[] = []
    seeds.forEach((seed, cellIndex) => {
      const cell = voronoi.cellPolygon(cellIndex)
      if (!cell) return
      const polygon = cell.map(([x, y]) => ({ x, y }))
      const components = this.clipper.clip(input.sourceRegion.geometry, polygon, `${input.generationId}-cell-${cellIndex}`)
      components.forEach((component, componentIndex) => {
        const fragmentIndex = fragments.length
        const geometry = Object.freeze({
          ...component.geometry,
          ...(input.sourceRegion.geometry.textureReferenceBounds
            ? { textureReferenceBounds: Object.freeze({ ...input.sourceRegion.geometry.textureReferenceBounds }) }
            : {}),
        })
        fragments.push(Object.freeze({
          id: `${input.generationId}-fragment-${fragmentIndex}`,
          seedId: seed.id,
          cellIndex,
          componentIndex,
          containsSeed: containsMesh2DPoint(geometry, seed.x, seed.y, 1e-7),
          geometry,
          colliderParts: component.colliderParts,
          boundaryRings: component.boundaryRings,
          centroidPx: component.centroidPx,
          areaPx2: component.areaPx2,
          boundsPx: component.boundsPx,
        }))
      })
    })
    if (fragments.length < seeds.length) return undefined
    const seedOwners = new Map(seeds.map(seed => [seed.id, 0]))
    fragments.forEach(fragment => {
      if (fragment.containsSeed) seedOwners.set(fragment.seedId, (seedOwners.get(fragment.seedId) ?? 0) + 1)
    })
    return Array.from(seedOwners.values()).every(count => count === 1) ? fragments : undefined
  }
}

function validateInput(input: VoronoiRegionFractureInput): void {
  if (!new RegExp(`^[\\w-]{1,${MAX_GENERATION_ID_LENGTH}}$`).test(input.generationId)) {
    throw new Error(`Fracture generation id must be 1–${MAX_GENERATION_ID_LENGTH} portable characters`)
  }
  if (!/^[\w-]{1,128}$/.test(input.sourceOwnerId)) throw new Error('Fracture source owner id is not portable')
  if (!Number.isSafeInteger(input.fragmentCount) || input.fragmentCount < MIN_FRAGMENT_COUNT
    || input.fragmentCount > MAX_FRAGMENT_COUNT) {
    throw new RangeError(`Fracture fragment count must be ${MIN_FRAGMENT_COUNT}–${MAX_FRAGMENT_COUNT}`)
  }
  if (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) {
    throw new RangeError('Fracture seed must be an unsigned 32-bit integer')
  }
  const minimumAreaRatio = input.minimumAreaRatio ?? 0.005
  if (!Number.isFinite(minimumAreaRatio) || minimumAreaRatio < 0 || minimumAreaRatio >= 1) {
    throw new RangeError('Fracture minimum area ratio must be in [0, 1)')
  }
  const maxAttempts = input.maxGenerationAttempts ?? 24
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 256) {
    throw new RangeError('Fracture generation attempts must be an integer from 1 to 256')
  }
}

function createSeeds(input: VoronoiRegionFractureInput, mixedSeed: number): FractureSeedPoint[] {
  const random = new SeededRandom(mixedSeed)
  const seeds: FractureSeedPoint[] = []
  const bounds = input.sourceRegion.boundsPx
  const separation = Math.sqrt(input.sourceRegion.areaPx2 / input.fragmentCount) * 1e-4
  for (let index = 0; index < input.fragmentCount; index++) {
    let realized: FracturePoint2D | undefined
    for (let draw = 0; draw < MAX_SEED_DRAWS_PER_POINT; draw++) {
      const candidate = {
        x: bounds.minX + random.next() * (bounds.maxX - bounds.minX),
        y: bounds.minY + random.next() * (bounds.maxY - bounds.minY),
      }
      if (containsMesh2DPoint(input.sourceRegion.geometry, candidate.x, candidate.y)
        && seeds.every(seed => Math.hypot(seed.x - candidate.x, seed.y - candidate.y) > separation)) {
        realized = candidate
        break
      }
    }
    if (!realized) throw new Error(`Fracture seed ${index} could not be placed inside the source region`)
    seeds.push(Object.freeze({ id: `${input.generationId}-seed-${index}`, ...realized }))
  }
  return seeds
}

function assertAreaPreserved(
  sourceArea: number,
  fragments: readonly FractureRegionFragmentGeometry[],
): void {
  const fragmentArea = fragments.reduce((sum, fragment) => sum + fragment.areaPx2, 0)
  const tolerance = Math.max(1e-5, sourceArea * 1e-7)
  if (Math.abs(fragmentArea - sourceArea) > tolerance) {
    throw new Error(`Voronoi region fracture does not preserve source area (${fragmentArea} vs ${sourceArea})`)
  }
}

function mixSeed(seed: number, attempt: number): number {
  let value = (seed ^ Math.imul(attempt + 1, 0x9e3779b9)) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d) >>> 0
  value ^= value >>> 15
  return value >>> 0
}
