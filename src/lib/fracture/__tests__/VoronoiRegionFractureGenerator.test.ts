import { describe, expect, it } from 'vitest'
import { newSplineLayerFromData, newStarLayer } from '@/lib/defaults'
import { mergeSplineData } from '@/lib/spline/factory/mergeSplineData'
import { createCircleSpline } from '@/lib/spline/primitives/createCircleSpline'
import { FractureSourceRegionCompiler } from '../FractureSourceRegionCompiler'
import { FractureRegionManifestValidator } from '../FractureRegionManifestValidator'
import { VoronoiRegionFractureGenerator } from '../VoronoiRegionFractureGenerator'

describe('VoronoiRegionFractureGenerator', () => {
  const sourceCompiler = new FractureSourceRegionCompiler()
  const generator = new VoronoiRegionFractureGenerator()
  const validator = new FractureRegionManifestValidator()

  it('generates deterministic portable topology for a concave source', () => {
    const sourceRegion = sourceCompiler.compile({ ...newStarLayer(), id: 'star-source' })
    const input = {
      generationId: 'star-region-generation',
      sourceOwnerId: 'star-source',
      sourceRegion,
      fragmentCount: 8,
      seed: 42,
      minimumAreaRatio: 0,
    }
    const first = generator.generate(input)
    const second = generator.generate(input)

    expect(second).toEqual(first)
    expect(first).toMatchObject({
      schemaVersion: 2,
      requestedFragmentCount: 8,
      source: { ownerId: 'star-source', areaPx2: sourceRegion.areaPx2 },
      algorithm: { id: 'd3-delaunay-region', compilerVersion: 1 },
    })
    expect(first.seeds).toHaveLength(8)
    expect(first.fragments.length).toBeGreaterThanOrEqual(8)
    expect(first.fragments.filter(fragment => fragment.containsSeed)).toHaveLength(8)
    expect(first.adjacency.length).toBeGreaterThan(0)
    expect(first.fragments.reduce((sum, fragment) => sum + fragment.areaPx2, 0))
      .toBeCloseTo(sourceRegion.areaPx2, 5)
    expect(() => validator.validate(first)).not.toThrow()
  })

  it('preserves a source hole without convex-hull filling', () => {
    const spline = mergeSplineData(createCircleSpline({ radius: 80 }), createCircleSpline({ radius: 30 }))
    spline.fillRule = 'evenodd'
    const sourceRegion = sourceCompiler.compile(newSplineLayerFromData(spline, { name: 'Donut', x: 0, y: 0 }))
    const generation = generator.generate({
      generationId: 'donut-region-generation',
      sourceOwnerId: 'donut-source',
      sourceRegion,
      fragmentCount: 10,
      seed: 17,
      minimumAreaRatio: 0,
    })

    expect(generation.source.rings.map(ring => ring.role).sort()).toEqual(['hole', 'outer'])
    expect(generation.fragments.reduce((sum, fragment) => sum + fragment.areaPx2, 0))
      .toBeCloseTo(sourceRegion.areaPx2, 5)
    expect(generation.fragments.every(fragment => fragment.colliderParts.length > 0)).toBe(true)
    expect(() => validator.validate(generation)).not.toThrow()
  })
})
