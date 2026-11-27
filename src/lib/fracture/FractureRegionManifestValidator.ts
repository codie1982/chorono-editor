import { containsMesh2DPoint, Mesh2DTopologyValidator } from '@/lib/geometry/mesh2d'
import type {
  FractureBounds2D,
  FracturePoint2D,
  FractureRegionFragmentGeometry,
  FractureRegionGeneration,
  FractureRegionRingGeometry,
} from '@/lib/types/fracture'
import { ConvexPolygon2D } from './ConvexPolygon2D'
import { FractureFragmentAdjacencyBuilder } from './FractureFragmentAdjacencyBuilder'
import { hashFractureRegionGeneration } from './FractureManifestHash'

/**
 * Validates a portable FRACTURE1 manifest without rerunning D3 or clipping.
 *
 * The validator recomputes render triangle metrics, convex collider area,
 * boundary-ring area, seed ownership, fragment adjacency and the generation
 * hash. Saved realized topology remains authoritative across future library
 * versions. Instances retain no manifest data.
 */
export class FractureRegionManifestValidator {
  constructor(
    private readonly topologyValidator = new Mesh2DTopologyValidator(),
    private readonly adjacencyBuilder = new FractureFragmentAdjacencyBuilder(),
  ) {}

  validate(generation: FractureRegionGeneration): void {
    assertHeader(generation)
    const sourceArea = ringArea(generation.source.rings)
    assertClose(sourceArea, generation.source.areaPx2, 'Fracture region source area')
    assertBounds(pointsBounds(generation.source.rings.flatMap(ring => ring.points)),
      generation.source.boundsPx, 'Fracture region source bounds')
    if (generation.seeds.length !== generation.requestedFragmentCount) {
      throw new Error('Fracture region seed count does not match its request')
    }
    const seeds = new Map(generation.seeds.map(seed => [seed.id, seed]))
    if (seeds.size !== generation.seeds.length) throw new Error('Fracture region seeds are duplicated')
    const ids = new Set<string>()
    const seedOwners = new Map(generation.seeds.map(seed => [seed.id, 0]))
    let combinedArea = 0
    generation.fragments.forEach((fragment, index) => {
      if (fragment.id !== `${generation.generationId}-fragment-${index}` || ids.has(fragment.id)) {
        throw new Error(`Invalid fracture region fragment id: ${fragment.id}`)
      }
      ids.add(fragment.id)
      const seed = seeds.get(fragment.seedId)
      if (!seed || fragment.cellIndex < 0 || fragment.cellIndex >= generation.seeds.length
        || generation.seeds[fragment.cellIndex].id !== fragment.seedId
        || !Number.isSafeInteger(fragment.componentIndex) || fragment.componentIndex < 0) {
        throw new Error(`Fracture region fragment ${index} has invalid cell ownership`)
      }
      this.validateFragment(fragment, index)
      const containsSeed = containsMesh2DPoint(fragment.geometry, seed.x, seed.y, 1e-7)
      if (containsSeed !== fragment.containsSeed) {
        throw new Error(`Fracture region fragment ${index} seed ownership is stale`)
      }
      if (containsSeed) seedOwners.set(seed.id, (seedOwners.get(seed.id) ?? 0) + 1)
      combinedArea += fragment.areaPx2
    })
    if (!Array.from(seedOwners.values()).every(count => count === 1)) {
      throw new Error('Every fracture region seed must belong to exactly one component')
    }
    assertClose(combinedArea, generation.source.areaPx2, 'Fracture region combined area',
      Math.max(1e-5, generation.source.areaPx2 * 1e-7))
    const expectedAdjacency = this.adjacencyBuilder.build(generation.fragments)
    if (JSON.stringify(expectedAdjacency) !== JSON.stringify(generation.adjacency)) {
      throw new Error('Fracture region adjacency is stale')
    }
    const { topologyHash, ...withoutHash } = generation
    if (hashFractureRegionGeneration(withoutHash) !== topologyHash) {
      throw new Error('Fracture region topology hash is stale')
    }
  }

  private validateFragment(fragment: FractureRegionFragmentGeometry, index: number): void {
    const validation = this.topologyValidator.validate(fragment.geometry)
    if (!validation.valid) {
      const codes = validation.diagnostics.filter(item => item.severity === 'error').map(item => item.code)
      throw new Error(`Fracture region fragment ${index} topology is invalid: ${codes.join(', ')}`)
    }
    const metrics = triangleMetrics(fragment)
    assertClose(metrics.areaPx2, fragment.areaPx2, `Fracture region fragment ${index} area`)
    assertClose(metrics.centroidPx.x, fragment.centroidPx.x, `Fracture region fragment ${index} centroid x`)
    assertClose(metrics.centroidPx.y, fragment.centroidPx.y, `Fracture region fragment ${index} centroid y`)
    assertBounds(metrics.boundsPx, fragment.boundsPx, `Fracture region fragment ${index} bounds`)
    const colliderArea = fragment.colliderParts.reduce((sum, part, partIndex) => (
      sum + new ConvexPolygon2D(part, `Fracture region fragment ${index} collider ${partIndex}`).area
    ), 0)
    assertClose(colliderArea, fragment.areaPx2, `Fracture region fragment ${index} collider area`,
      Math.max(1e-5, fragment.areaPx2 * 1e-7))
    assertClose(ringArea(fragment.boundaryRings), fragment.areaPx2,
      `Fracture region fragment ${index} boundary area`, Math.max(1e-5, fragment.areaPx2 * 1e-7))
  }
}

function assertHeader(generation: FractureRegionGeneration): void {
  if (!generation || generation.schemaVersion !== 2 || generation.generationIndex !== 0
    || generation.algorithm?.id !== 'd3-delaunay-region' || generation.algorithm.version !== '6.0.4'
    || generation.algorithm.compilerVersion !== 1) throw new Error('Unsupported fracture region generation schema')
  if (!/^[\w-]{1,110}$/.test(generation.generationId)
    || !/^[\w-]{1,128}$/.test(generation.parentId)
    || generation.parentId !== generation.source.ownerId) throw new Error('Invalid fracture region scene ids')
  if (!Number.isSafeInteger(generation.rootSeed) || generation.rootSeed < 0 || generation.rootSeed > 0xffffffff
    || !Number.isSafeInteger(generation.generationAttempt) || generation.generationAttempt < 0
    || !Number.isSafeInteger(generation.requestedFragmentCount) || generation.requestedFragmentCount < 2
    || generation.requestedFragmentCount > 100) throw new Error('Invalid fracture region generation parameters')
}

function triangleMetrics(fragment: FractureRegionFragmentGeometry) {
  const { positions } = fragment.geometry
  const indices = fragment.geometry.topology.triangleIndices
  let area2Sum = 0, weightedX = 0, weightedY = 0
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset] * 2, b = indices[offset + 1] * 2, c = indices[offset + 2] * 2
    const ax = positions[a], ay = positions[a + 1]
    const bx = positions[b], by = positions[b + 1]
    const cx = positions[c], cy = positions[c + 1]
    const area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    area2Sum += area2
    weightedX += (ax + bx + cx) * area2
    weightedY += (ay + by + cy) * area2
  }
  return {
    areaPx2: area2Sum / 2,
    centroidPx: { x: weightedX / (3 * area2Sum), y: weightedY / (3 * area2Sum) },
    boundsPx: pointsBounds(Array.from({ length: positions.length / 2 }, (_, index) => ({
      x: positions[index * 2], y: positions[index * 2 + 1],
    }))),
  }
}

function ringArea(rings: readonly FractureRegionRingGeometry[]): number {
  return rings.reduce((sum, ring) => sum + ring.signedDoubleArea / 2, 0)
}

function pointsBounds(points: readonly FracturePoint2D[]): FractureBounds2D {
  if (!points.length) throw new Error('Fracture region has no boundary points')
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x), minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x), maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
}

function assertBounds(actual: FractureBounds2D, expected: FractureBounds2D, label: string): void {
  assertClose(actual.minX, expected.minX, `${label} minX`)
  assertClose(actual.minY, expected.minY, `${label} minY`)
  assertClose(actual.maxX, expected.maxX, `${label} maxX`)
  assertClose(actual.maxY, expected.maxY, `${label} maxY`)
}

function assertClose(actual: number, expected: number, label: string, tolerance = 1e-7): void {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} is stale`)
  }
}
