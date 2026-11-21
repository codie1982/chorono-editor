import { describe, expect, it } from 'vitest'
import { newImageLayer, newSplineLayerFromData, newStarLayer } from '@/lib/defaults'
import { createCircleSpline } from '@/lib/spline/primitives/createCircleSpline'
import { mergeSplineData } from '@/lib/spline/factory/mergeSplineData'
import { FractureSourceRegionCompiler } from '../FractureSourceRegionCompiler'

describe('FractureSourceRegionCompiler', () => {
  const compiler = new FractureSourceRegionCompiler()

  it('compiles an image rectangle into canonical Mesh2D geometry', () => {
    const region = compiler.compile({ ...newImageLayer('poster', 160, 90), id: 'poster-source' })

    expect(region).toMatchObject({
      sourceKind: 'rectangle',
      areaPx2: 14_400,
      centroidPx: { x: 80, y: 45 },
      boundsPx: { minX: 0, minY: 0, maxX: 160, maxY: 90 },
      isSingleConvexRing: true,
    })
    expect(region.geometry.topology.triangleIndices).toHaveLength(6)
    expect(region.rings).toHaveLength(1)
  })

  it('preserves a concave star as a valid non-convex source region', () => {
    const star = { ...newStarLayer(), id: 'star-source' }
    const region = compiler.compile(star)

    expect(region.sourceKind).toBe('shape')
    expect(region.rings).toHaveLength(1)
    expect(region.rings[0].role).toBe('outer')
    expect(region.isSingleConvexRing).toBe(false)
    expect(region.areaPx2).toBeGreaterThan(0)
    expect(region.centroidPx.x).toBeCloseTo(star.size!.width / 2, 6)
    expect(region.centroidPx.y).toBeCloseTo(star.size!.height / 2, 6)
  })

  it('classifies a spline cutout and integrates only its filled triangles', () => {
    const outer = createCircleSpline({ radius: 80 })
    const inner = createCircleSpline({ radius: 30 })
    const spline = mergeSplineData(outer, inner)
    spline.fillRule = 'evenodd'
    const region = compiler.compile(newSplineLayerFromData(spline, { name: 'Donut', x: 0, y: 0 }))

    expect(region.sourceKind).toBe('spline')
    expect(region.rings.map(ring => ring.role).sort()).toEqual(['hole', 'outer'])
    expect(region.isSingleConvexRing).toBe(false)
    expect(region.areaPx2).toBeGreaterThan(0)
    expect(region.areaPx2).toBeLessThan(Math.PI * 80 * 80)
    expect(region.centroidPx.x).toBeCloseTo(0, 5)
    expect(region.centroidPx.y).toBeCloseTo(0, 5)
  })
})
