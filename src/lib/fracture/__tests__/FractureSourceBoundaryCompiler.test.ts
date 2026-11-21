import { describe, expect, it } from 'vitest'
import { newCircleLayer, newImageLayer, newSplineLayerFromData, newStarLayer } from '@/lib/defaults'
import { createRectangleSpline } from '@/lib/spline/primitives/createRectangleSpline'
import { FractureSourceBoundaryCompiler, isFractureSourceLayerCandidate } from '../FractureSourceBoundaryCompiler'

describe('FractureSourceBoundaryCompiler', () => {
  const compiler = new FractureSourceBoundaryCompiler()

  it('preserves the historical origin rectangle contract for images', () => {
    const layer = { ...newImageLayer('poster', 160, 90), id: 'poster-source' }
    const result = compiler.compile(layer)

    expect(result).toMatchObject({
      sourceKind: 'rectangle',
      isOriginRectangle: true,
      areaPx2: 14_400,
      centroidPx: { x: 80, y: 45 },
    })
    expect(result.polygon).toEqual([
      { x: 0, y: 0 }, { x: 160, y: 0 }, { x: 160, y: 90 }, { x: 0, y: 90 },
    ])
  })

  it('reuses shape and spline boundary generation for convex sources', () => {
    const circle = { ...newCircleLayer(), id: 'circle-source' }
    const spline = newSplineLayerFromData(createRectangleSpline({ width: 120, height: 80 }), {
      name: 'Convex spline', x: 200, y: 120,
    })
    const circleBoundary = compiler.compile(circle)
    const splineBoundary = compiler.compile(spline)

    expect(circleBoundary.sourceKind).toBe('shape')
    expect(circleBoundary.isOriginRectangle).toBe(false)
    expect(circleBoundary.polygon.length).toBeGreaterThan(8)
    expect(circleBoundary.areaPx2).toBeGreaterThan(0)
    expect(splineBoundary).toMatchObject({
      sourceKind: 'spline',
      isOriginRectangle: false,
      centroidPx: { x: 0, y: 0 },
      boundsPx: { minX: -60, minY: -40, maxX: 60, maxY: 40 },
    })
  })

  it('admits recoverable picker candidates but rejects concave geometry clearly', () => {
    const star = { ...newStarLayer(), id: 'star-source' }
    expect(isFractureSourceLayerCandidate(star)).toBe(true)
    expect(() => compiler.compile(star)).toThrow('hole-free convex boundary')
  })
})
