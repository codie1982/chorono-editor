import { describe, expect, it } from 'vitest'
import { createPolylineSpline } from '../creation/createPolylineSpline'
import { extendSplineContour, splineContinuation } from './extendSplineContour'

describe('non-destructive open spline continuation', () => {
  it('adds segments at the end, preserving old topology, handles and source records', () => {
    const source = createPolylineSpline([{ x: 0, y: 0 }, { x: 40, y: 10 }], false)
    const before = structuredClone(source), contour = Object.values(source.contours)[0]
    const next = extendSplineContour(source, contour.pointIds[1], [{ x: 70, y: 30 }, { x: 90, y: -10 }])
    const extended = next.contours[contour.id]
    expect(extended.pointIds.slice(0, 2)).toEqual(contour.pointIds)
    expect(extended.segmentIds[0]).toBe(contour.segmentIds[0])
    expect(extended.pointIds.map(id => next.points[id]).map(point => [point.x, point.y])).toEqual([[0, 0], [40, 10], [70, 30], [90, -10]])
    for (const [id, point] of Object.entries(source.points)) expect(next.points[id]).toBe(point)
    expect(source).toEqual(before)
  })
  it('extends the beginning without reversing old edges and can close the resulting contour', () => {
    const source = createPolylineSpline([{ x: 0, y: 0 }, { x: 40, y: 10 }], false)
    const contour = Object.values(source.contours)[0]
    const next = extendSplineContour(source, contour.pointIds[0], [{ x: -10, y: 20 }, { x: -30, y: 30 }], true)
    const result = next.contours[contour.id]
    expect(result.closed).toBe(true)
    expect(result.pointIds.map(id => next.points[id].x)).toEqual([-30, -10, 0, 40])
    for (let index = 0; index < result.pointIds.length; index++) {
      const segment = next.segments[result.segmentIds[index]]
      expect(segment.fromPointId).toBe(result.pointIds[index])
      expect(segment.toPointId).toBe(result.pointIds[(index + 1) % result.pointIds.length])
    }
    expect(next.segments[contour.segmentIds[0]]).toBe(source.segments[contour.segmentIds[0]])
  })
  it('refuses closed/locked/non-endpoint/non-finite input and never mutates it', () => {
    const source = createPolylineSpline([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 10 }], false)
    const contour = Object.values(source.contours)[0], endpoint = contour.pointIds[2]
    expect(splineContinuation(source, contour.pointIds[1])).toBeNull()
    expect(() => extendSplineContour(source, endpoint, [{ x: Infinity, y: 0 }])).toThrow(/finite/)
    const locked = { ...source, points: { ...source.points, [endpoint]: { ...source.points[endpoint], locked: true } } }
    expect(() => extendSplineContour(locked, endpoint, [{ x: 50, y: 10 }])).toThrow(/endpoint/)
    expect(splineContinuation(createPolylineSpline([{ x: 0, y: 0 }, { x: 40, y: 10 }], true))).toBeNull()
    expect(extendSplineContour(source, endpoint, [])).toBe(source)
  })
})
