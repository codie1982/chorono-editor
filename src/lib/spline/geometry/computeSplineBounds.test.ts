import { describe, expect, it } from 'vitest'
import { createLineSpline } from '../primitives/createLineSpline'
import { computeSplineBounds } from './computeSplineBounds'
import { createCircleSpline } from '../primitives/createCircleSpline'
import { buildSplineData } from '../util/buildSplineData'
import { Matrix2D } from '@/lib/geometry/Matrix2D'

describe('computeSplineBounds', () => {
  it('uses quadratic curve extrema rather than the off-curve control point', () => {
    const data = createLineSpline({ x1: 0, y1: 0, x2: 100, y2: 0 })
    const segment = Object.values(data.segments)[0]
    data.segments[segment.id] = { ...segment, type: 'quadratic', control1: { x: -20, y: 150 } }
    const bounds = computeSplineBounds(data)
    expect(bounds.x).toBeCloseTo(-20 / 7)
    expect(bounds.y).toBe(0)
    expect(bounds.width).toBeCloseTo(100 + 20 / 7)
    expect(bounds.height).toBe(75)
  })

  it('uses both cubic extrema without including the handle positions', () => {
    const data = buildSplineData({
      kind: 'custom', name: 'S Curve', contours: [{ closed: false, anchors: [
        { x: 0, y: 0, type: 'bezierCorner', out: { x: 0, y: 200 } },
        { x: 100, y: 0, type: 'bezierCorner', in: { x: 100, y: -200 } },
      ] }],
    })
    const bounds = computeSplineBounds(data)
    expect(bounds.x).toBe(0)
    expect(bounds.width).toBe(100)
    expect(bounds.y).toBeCloseTo(-100 / Math.sqrt(3))
    expect(bounds.height).toBeCloseTo(200 / Math.sqrt(3))
  })

  it('does not inflate a rotated circle to the rotated local-box corners', () => {
    const circle = createCircleSpline({ radius: 80 })
    const bounds = computeSplineBounds(circle, Matrix2D.translation(200, 150).rotate(45))
    expect(bounds.x).toBeCloseTo(120)
    expect(bounds.y).toBeCloseTo(70)
    expect(bounds.width).toBeCloseTo(160)
    expect(bounds.height).toBeCloseTo(160)
  })

  it('ignores orphan handles and points which are absent from the rendered path', () => {
    const data = createLineSpline({ x1: -20, y1: 10, x2: 40, y2: 10 })
    data.points.orphan = { id: 'orphan', x: 900, y: 700, type: 'corner' }
    data.handles.orphan = { id: 'orphan', pointId: 'orphan', kind: 'out', x: -800, y: -800, locked: false }
    expect(computeSplineBounds(data)).toEqual({ x: -20, y: 10, width: 60, height: 0 })
  })

  it('returns a zero box for an empty spline', () => {
    const data = buildSplineData({ kind: 'custom', name: 'Empty', contours: [] })
    expect(computeSplineBounds(data)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})
