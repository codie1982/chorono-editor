import { describe, expect, it } from 'vitest'
import { createPolylineSpline } from '@/lib/spline/creation/createPolylineSpline'
import { createCircleSpline } from '@/lib/spline/primitives/createCircleSpline'
import { createDonutSpline } from '@/lib/spline/primitives/createDonutSpline'
import { createRectangleSpline } from '@/lib/spline/primitives/createRectangleSpline'
import { containsMesh2DPoint } from './Mesh2DGeometryQueries'
import { SplineBoundaryMesh2DGenerator } from './SplineBoundaryMesh2DGenerator'

describe('SplineBoundaryMesh2DGenerator', () => {
  const generator = new SplineBoundaryMesh2DGenerator()

  it('triangulates a closed rectangle with positive fixed topology', () => {
    const spline = createRectangleSpline({ width: 100, height: 60 })
    const before = JSON.stringify(spline)
    const result = generator.generate('spline-1', spline)

    expect(result.source).toMatchObject({
      kind: 'splineBoundary', sourceLayerId: 'spline-1', flattenTolerance: 0.25,
      uvFit: 'bounds', triangulation: { algorithm: 'earcut', algorithmVersion: '3.2.4' },
    })
    expect(result.geometry.positions).toHaveLength(8)
    expect(result.geometry.topology.triangleIndices).toHaveLength(6)
    for (let offset = 0; offset < result.geometry.topology.triangleIndices.length; offset += 3) {
      const [a, b, c] = result.geometry.topology.triangleIndices.slice(offset, offset + 3)
      const p = result.geometry.positions
      expect((p[b * 2] - p[a * 2]) * (p[c * 2 + 1] - p[a * 2 + 1])
        - (p[b * 2 + 1] - p[a * 2 + 1]) * (p[c * 2] - p[a * 2])).toBeGreaterThan(0)
    }
    expect(JSON.stringify(spline)).toBe(before)
  })

  it('preserves an even-odd donut hole in triangle hit testing', () => {
    const result = generator.generate('donut', createDonutSpline({ outerRadius: 80, innerRadius: 35 }))
    expect(containsMesh2DPoint(result.geometry, 0, 0)).toBe(false)
    expect(containsMesh2DPoint(result.geometry, 55, 0)).toBe(true)
    expect(containsMesh2DPoint(result.geometry, 100, 0)).toBe(false)
  })

  it('triangulates a concave closed spline without filling its notch', () => {
    const spline = createPolylineSpline([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
      { x: 50, y: 45 }, { x: 0, y: 100 },
    ], true)
    const result = generator.generate('concave', spline)
    expect(containsMesh2DPoint(result.geometry, 20, 20)).toBe(true)
    expect(containsMesh2DPoint(result.geometry, 50, 80)).toBe(false)
  })

  it('rejects open and self-intersecting source contours before triangulation', () => {
    const open = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 50 }], false)
    expect(() => generator.generate('open', open)).toThrow(/must be closed/)

    const crossed = createPolylineSpline([
      { x: 0, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 100 },
      { x: 100, y: 0 }, { x: 100, y: 120 }, { x: 0, y: 120 },
    ], true)
    expect(() => generator.generate('crossed', crossed)).toThrow(/self-intersects/)
  })

  it('uses a deterministic local tolerance and reports source staleness', () => {
    const circle = createCircleSpline({ radius: 100 })
    const coarse = generator.generate('circle', circle, { flattenTolerance: 2 })
    const fine = generator.generate('circle', circle, { flattenTolerance: 0.1 })
    expect(fine.geometry.positions.length).toBeGreaterThan(coarse.geometry.positions.length)
    expect(fine.source.kind).toBe('splineBoundary')
    expect(coarse.source.kind).toBe('splineBoundary')
    if (fine.source.kind !== 'splineBoundary' || coarse.source.kind !== 'splineBoundary') {
      throw new Error('Expected spline-boundary source')
    }
    expect(fine.source.sourceFingerprint).not.toBe(coarse.source.sourceFingerprint)
    expect(generator.isCurrent(fine, circle)).toBe(true)

    const pointId = Object.keys(circle.points)[0]
    const edited = {
      ...circle,
      points: { ...circle.points, [pointId]: { ...circle.points[pointId], x: circle.points[pointId].x + 1 } },
    }
    expect(generator.isCurrent(fine, edited)).toBe(false)
  })
})
