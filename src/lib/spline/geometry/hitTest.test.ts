import { describe, it, expect } from 'vitest'
import { createRectangleSpline } from '../primitives/createRectangleSpline'
import { createCircleSpline } from '../primitives/createCircleSpline'
import { createDonutSpline } from '../primitives/createDonutSpline'
import { mergeSplineData } from '../factory/mergeSplineData'
import {
  hitTestSplinePoint, hitTestSplineHandle, hitTestSplineSegment, hitTestSplineContour, hitTestSplineFill,
} from './hitTest'

describe('spline hit-testing', () => {
  // 100×60 rectangle centered at origin → corners at (±50, ±30).
  const rect = createRectangleSpline({ width: 100, height: 60, cornerMode: 'sharp' })

  it('hits an on-curve point near a corner', () => {
    const id = hitTestSplinePoint(rect, -50, -30, 5)
    expect(id).not.toBeNull()
    const p = rect.points[id!]
    expect(p.x).toBeCloseTo(-50)
    expect(p.y).toBeCloseTo(-30)
  })

  it('misses when the cursor is outside tolerance', () => {
    expect(hitTestSplinePoint(rect, 0, 0, 5)).toBeNull()
  })

  it('hits a line segment along the top edge', () => {
    // Midpoint of the top edge is (0, -30).
    const hit = hitTestSplineSegment(rect, 0, -30, 3)
    expect(hit).not.toBeNull()
  })

  it('detects a point inside a closed contour', () => {
    expect(hitTestSplineContour(rect, 0, 0)).not.toBeNull()
    expect(hitTestSplineContour(rect, 999, 999)).toBeNull()
  })

  it('hits a bezier handle on a circle', () => {
    // radius 80 → handle near (44.18, -80) on the top anchor.
    const circle = createCircleSpline({ radius: 80 })
    const k = 80 * 0.5522847498307936
    const hit = hitTestSplineHandle(circle, k, -80, 4)
    expect(hit).not.toBeNull()
    expect(hit!.kind === 'in' || hit!.kind === 'out').toBe(true)
  })

  it('hits the curved edge of a circle (flattened cubic)', () => {
    const circle = createCircleSpline({ radius: 80 })
    // Rightmost point of the circle is (80, 0).
    const hit = hitTestSplineSegment(circle, 80, 0, 3)
    expect(hit).not.toBeNull()
  })

  it('respects compound fill winding and even-odd overlap', () => {
    const compound = mergeSplineData(createCircleSpline({ radius: 80 }), createCircleSpline({ radius: 40 }))
    compound.fillRule = 'nonzero'
    expect(hitTestSplineFill(compound, 0, 0)).toBe(true)
    compound.fillRule = 'evenodd'
    expect(hitTestSplineFill(compound, 0, 0)).toBe(false)
    expect(hitTestSplineFill(compound, 60, 0)).toBe(true)
    const donut = createDonutSpline({ outerRadius: 80, innerRadius: 40 })
    expect(hitTestSplineFill(donut, 0, 0)).toBe(false)
  })

  it('uses the quadratic control for filled contour selection', () => {
    const data = createRectangleSpline({ width: 100, height: 60 })
    const segment = data.segments[Object.values(data.contours)[0].segmentIds[0]]
    segment.type = 'quadratic'
    segment.control1 = { x: 0, y: -130 }
    expect(hitTestSplineContour(data, 0, -60)).not.toBeNull()
    expect(hitTestSplineFill(data, 0, -60)).toBe(true)
  })

  it('interpolates picking within a curve sample instead of jumping to its end', () => {
    const data = createRectangleSpline({ width: 100, height: 60 })
    const segment = data.segments[Object.values(data.contours)[0].segmentIds[0]]
    segment.type = 'quadratic'
    segment.control1 = { x: 0, y: -30 }
    // A collinear quadratic with a central control is exactly a straight line.
    const hit = hitTestSplineSegment(data, -13, -30, 1)!
    expect(hit.segmentId).toBe(segment.id)
    expect(hit.t).toBeCloseTo(0.37, 6)
  })
})
