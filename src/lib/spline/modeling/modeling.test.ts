import { describe, expect, it } from 'vitest'
import { createRectangleSpline } from '../primitives/createRectangleSpline'
import { createCircleSpline } from '../primitives/createCircleSpline'
import { createLineSpline } from '../primitives/createLineSpline'
import { computeSplineBounds } from '../geometry/computeSplineBounds'
import { createOffsetOutline } from './offsetOutline'
import { treatSplineCorners } from './cornerTreatment'

describe('spline contour modeling', () => {
  it('offsets a rectangle outward and inward at equal edge distances', () => {
    const source = createRectangleSpline({ width: 100, height: 60, cornerMode: 'sharp' })
    const contourId = Object.keys(source.contours)[0]
    const outer = createOffsetOutline(source, { contourId, distance: 10, direction: 'outward', mode: 'offset' })
    const inner = createOffsetOutline(source, { contourId, distance: 10, direction: 'inward', mode: 'offset' })
    expect(computeSplineBounds(outer)).toMatchObject({ x: -60, y: -40, width: 120, height: 80 })
    expect(computeSplineBounds(inner)).toMatchObject({ x: -40, y: -20, width: 80, height: 40 })
    expect(computeSplineBounds(source)).toMatchObject({ x: -50, y: -30, width: 100, height: 60 })
  })

  it('makes a closed even-odd outline with two contours and rejects collapse', () => {
    const source = createRectangleSpline({ width: 100, height: 60, cornerMode: 'sharp' })
    const contourId = Object.keys(source.contours)[0]
    const outline = createOffsetOutline(source, { contourId, distance: 8, direction: 'outward', mode: 'outline' })
    expect(Object.keys(outline.contours)).toHaveLength(2)
    expect(outline.fillRule).toBe('evenodd')
    expect(() => createOffsetOutline(source, { contourId, distance: 40, direction: 'inward', mode: 'offset' })).toThrow()
  })

  it('offsets an open curve on either side without mutating its source', () => {
    const source = createLineSpline({ x1: 0, y1: 0, x2: 100, y2: 0 })
    const contourId = Object.keys(source.contours)[0]
    const right = createOffsetOutline(source, { contourId, distance: 5, direction: 'right', mode: 'offset' })
    const left = createOffsetOutline(source, { contourId, distance: 5, direction: 'left', mode: 'offset' })
    expect(Object.values(right.points).map(point => point.y)).toEqual([-5, -5])
    expect(Object.values(left.points).map(point => point.y)).toEqual([5, 5])
    expect(source.points[Object.keys(source.points)[0]].y).toBe(0)
  })

  it('closes an open outline into an editable band and validates script directions', () => {
    const source = createLineSpline({ x1: 0, y1: 0, x2: 100, y2: 0 })
    const contourId = Object.keys(source.contours)[0]
    const outline = createOffsetOutline(source, { contourId, distance: 5, direction: 'right', mode: 'outline' })
    expect(Object.values(outline.contours)[0].closed).toBe(true)
    expect(computeSplineBounds(outline)).toMatchObject({ x: 0, y: -5, width: 100, height: 10 })
    expect(() => createOffsetOutline(source, { contourId, distance: 5, direction: 'invalid' as 'right', mode: 'offset' })).toThrow(/direction/)
  })

  it('chamfers selected rectangle corners while preserving the contour ID', () => {
    const source = createRectangleSpline({ width: 100, height: 60, cornerMode: 'sharp' })
    const contour = Object.values(source.contours)[0]
    const result = treatSplineCorners(source, { contourId: contour.id, pointIds: [contour.pointIds[0]], amount: 10, mode: 'chamfer' })
    expect(result.contours[contour.id]).toBeDefined()
    expect(Object.keys(result.points)).toHaveLength(5)
    expect(Object.keys(source.points)).toHaveLength(4)
    expect(result.points[contour.pointIds[0]]).toBeUndefined()
  })

  it('fillets a line-line corner with tangent cubic and rejects overlapping cuts', () => {
    const source = createRectangleSpline({ width: 100, height: 60, cornerMode: 'sharp' })
    const contour = Object.values(source.contours)[0]
    const result = treatSplineCorners(source, { contourId: contour.id, pointIds: [contour.pointIds[0]], amount: 10, mode: 'fillet' })
    const cubic = Object.values(result.segments).filter(segment => segment.type === 'cubic')
    expect(cubic).toHaveLength(1)
    expect(Object.values(result.handles)).toHaveLength(2)
    expect(() => treatSplineCorners(source, { contourId: contour.id, pointIds: contour.pointIds, amount: 40, mode: 'fillet' })).toThrow(/overlap/)
  })

  it('treats a curved contour through its sampled geometry', () => {
    const source = createCircleSpline({ radius: 50 })
    const contour = Object.values(source.contours)[0]
    const result = treatSplineCorners(source, { contourId: contour.id, pointIds: [contour.pointIds[0]], amount: 3, mode: 'chamfer' })
    expect(result.contours[contour.id].closed).toBe(true)
    expect(Object.keys(result.points).length).toBeGreaterThan(Object.keys(source.points).length)
  })
})
