import type { FractureGeneration } from '@/lib/types/fracture'
import { ConvexPolygon2D } from './ConvexPolygon2D'
import { hashFractureGeneration, hashFractureSource } from './FractureManifestHash'

/**
 * Validates a portable generation without invoking D3 or trusting derived data.
 *
 * This document-boundary validator recomputes polygon area, centroid, bounds,
 * source and topology hashes; checks one-to-one seed ownership; and rejects
 * missing area. It does not regenerate a diagram, so saved realized geometry
 * remains authoritative across future algorithm versions.
 */
export class FractureManifestValidator {
  validate(generation: FractureGeneration): void {
    if (!generation || generation.schemaVersion !== 1 || generation.generationIndex !== 0
      || generation.algorithm?.id !== 'd3-delaunay' || generation.algorithm.version !== '6.0.4'
      || generation.algorithm.compilerVersion !== 1) throw new Error('Unsupported fracture generation schema')
    if (!Number.isSafeInteger(generation.rootSeed) || generation.rootSeed < 0 || generation.rootSeed > 0xffffffff
      || !Number.isSafeInteger(generation.generationAttempt) || generation.generationAttempt < 0
      || !Number.isSafeInteger(generation.requestedFragmentCount) || generation.requestedFragmentCount < 2
      || generation.requestedFragmentCount > 100) throw new Error('Invalid fracture generation parameters')
    const source = new ConvexPolygon2D(generation.source.polygon, 'Stored fracture source')
    if (generation.source.revision !== hashFractureSource(generation.source.ownerId, source.points)) {
      throw new Error('Fracture source revision is stale')
    }
    assertClose(source.area, generation.source.areaPx2, 'Fracture source area')
    assertBounds(source.bounds, generation.source.boundsPx, 'Fracture source bounds')
    if (generation.seeds.length !== generation.requestedFragmentCount
      || generation.fragments.length !== generation.requestedFragmentCount) {
      throw new Error('Fracture generation count does not match its request')
    }
    const seeds = new Map(generation.seeds.map(seed => [seed.id, seed]))
    if (seeds.size !== generation.seeds.length || generation.seeds.some(seed => !source.contains(seed, 1e-7))) {
      throw new Error('Fracture seeds are duplicated or outside the source')
    }
    const ids = new Set<string>()
    let area = 0
    generation.fragments.forEach((fragment, index) => {
      if (ids.has(fragment.id)) throw new Error(`Duplicate fracture fragment id: ${fragment.id}`)
      ids.add(fragment.id)
      const seed = seeds.get(fragment.seedId)
      if (!seed) throw new Error(`Fracture fragment ${index} references an unknown seed`)
      const polygon = new ConvexPolygon2D(fragment.polygon, `Stored fracture fragment ${index}`)
      if (!polygon.contains(seed, 1e-7) || polygon.points.some(point => !source.contains(point, 1e-7))) {
        throw new Error(`Fracture fragment ${index} leaves its source or seed`)
      }
      assertClose(polygon.area, fragment.areaPx2, `Fracture fragment ${index} area`)
      assertClose(polygon.centroid.x, fragment.centroidPx.x, `Fracture fragment ${index} centroid x`)
      assertClose(polygon.centroid.y, fragment.centroidPx.y, `Fracture fragment ${index} centroid y`)
      assertBounds(polygon.bounds, fragment.boundsPx, `Fracture fragment ${index} bounds`)
      area += polygon.area
    })
    assertClose(area, source.area, 'Fracture combined area', Math.max(1e-6, source.area * 1e-8))
    const { topologyHash, ...withoutHash } = generation
    if (hashFractureGeneration(withoutHash) !== topologyHash) throw new Error('Fracture topology hash is stale')
  }
}

function assertBounds(
  actual: { minX: number; minY: number; maxX: number; maxY: number },
  stored: { minX: number; minY: number; maxX: number; maxY: number },
  label: string,
): void {
  assertClose(actual.minX, stored.minX, `${label} minX`)
  assertClose(actual.minY, stored.minY, `${label} minY`)
  assertClose(actual.maxX, stored.maxX, `${label} maxX`)
  assertClose(actual.maxY, stored.maxY, `${label} maxY`)
}

function assertClose(actual: number, expected: number, label: string, tolerance = 1e-7): void {
  if (!Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) throw new Error(`${label} is stale`)
}
