import { describe, expect, it } from 'vitest'
import { createRectangleSpline, createCircleSpline, createDonutSpline, appendSplineObjects } from '../index'
import { buildSplineData } from '../util/buildSplineData'
import { assertSplineTopology, deleteSplineEdges } from '../topology'
import { Matrix2D } from '../../geometry/Matrix2D'
import { evaluateBezier } from '../../geometry/bezier/curves'
import { segmentControls } from '../corners'
import { filletSpline } from './filletSpline'
import type { SplinePathData } from '../../types/spline'
const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0]
const apply = (data: SplinePathData, pointIds: string[], radiusPx = 10, matrix = identity) => filletSpline({ data, pointIds, radiusPx, matrix })

describe('atomic selected-corner Fillet', () => {
  it('rounds adjacent rectangle corners, retaining source edges and unrelated Object identity', () => {
    const rect = createRectangleSpline({ width: 100, height: 80 }), circle = createCircleSpline({ radius: 20 }), data = appendSplineObjects(rect, circle).data
    const before = structuredClone(data), contour = Object.values(rect.contours)[0], result = apply(data, contour.pointIds.slice(0, 2), 12)
    expect(data).toEqual(before); assertSplineTopology(result.data); expect(result.cuts).toHaveLength(2)
    for (const edge of contour.segmentIds) expect(result.data.segments[edge]).toBeDefined()
    for (const cut of result.cuts) {
      expect(result.data.points[cut.removedId]).toBeUndefined()
      expect(cut.segmentIds.length).toBeGreaterThan(0)
      for (const id of cut.segmentIds) expect(result.data.segments[id].type).toBe('cubic')
    }
    for (const family of ['points', 'handles', 'segments', 'contours', 'subShapes'] as const) for (const id of Object.keys(circle[family])) expect(result.data[family][id]).toBe(data[family][id])
    const shared = segmentControls(result.data, contour.segmentIds[0])
    expect(Math.hypot(shared.at(-1)!.x - shared[0].x, shared.at(-1)!.y - shared[0].y)).toBeCloseTo(76, 6)
  })
  it('preserves world circular radius under reflected/nonuniform rotated parents', () => {
    for (const sign of [-1, 1]) {
      const data = createRectangleSpline({ width: 120, height: 100 }), matrix = Matrix2D.translation(250, 140).rotate(23).scale(sign * 1.4, .7)
      const result = apply(data, [Object.keys(data.points)[0]], 8, matrix.toArray()), arc = result.arcs[0]
      for (const id of result.cuts[0].segmentIds) for (const t of [0, .25, .5, .75, 1]) {
        const p = matrix.applyToPoint(evaluateBezier(segmentControls(result.data, id), t))
        expect(Math.abs(Math.hypot(p.x - arc.center.x, p.y - arc.center.y) - 8)).toBeLessThan(.0011)
      }
    }
  })
  it('retains exact-degree line–quadratic/cubic and cubic–cubic pieces on open contours', () => {
    const data = buildSplineData({ kind: 'custom', name: 'Mixed curve corner', contours: [{ closed: false, anchors: [
      { x: -100, y: -30, type: 'bezierCorner', out: { x: -70, y: -20 } }, { x: 0, y: 0, type: 'bezierCorner', in: { x: -30, y: 0 }, out: { x: 0, y: 30 } }, { x: 30, y: 100, type: 'bezierCorner', in: { x: 20, y: 70 } },
    ] }] }), contour = Object.values(data.contours)[0]
    const result = apply(data, [contour.pointIds[1]], 10)
    expect(result.data.contours[contour.id].closed).toBe(false)
    for (const id of contour.segmentIds) expect(result.data.segments[id].type).toBe('cubic')
    expect(() => apply(data, [contour.pointIds[0]])).toThrow('open endpoints')
  })
  it('rounds a hole boundary without losing ownership or winding', () => {
    const data = buildSplineData({ kind: 'custom', name: 'Holed square', fillRule: 'evenodd', contours: [
      { closed: true, anchors: [[-100, -100], [100, -100], [100, 100], [-100, 100]].map(([x, y]) => ({ x, y, type: 'corner' })) },
      { closed: true, anchors: [[-30, -30], [-30, 30], [30, 30], [30, -30]].map(([x, y]) => ({ x, y, type: 'corner' })) },
    ] }), inner = Object.values(data.contours)[1], result = apply(data, [inner.pointIds[0]], 6)
    expect(result.data.subShapes).toEqual({ ...data.subShapes, [Object.keys(data.subShapes)[0]]: { ...Object.values(data.subShapes)[0], source: 'edited', editable: true } })
    expect(result.data.fillRule).toBe('evenodd'); expect(result.data.contours[inner.id].closed).toBe(true)
  })
  it('refuses adjacent overlap, invalid radii, locks, straight/smooth points and singular transforms atomically', () => {
    const data = createRectangleSpline({ width: 100, height: 80 }), ids = Object.values(data.contours)[0].pointIds, before = structuredClone(data)
    expect(() => apply(data, ids.slice(0, 2), 51)).toThrow(/overlap/i)
    for (const radius of [0, -.1, NaN, Infinity, 10001]) expect(() => apply(data, [ids[0]], radius)).toThrow('radius')
    expect(() => apply(data, [ids[0]], 10, [0, 0, 0, 0, 0, 0])).toThrow('singular')
    expect(data).toEqual(before)
    data.points[ids[2]].locked = true; expect(() => apply(data, [ids[0]])).toThrow('Unlock')
    const circle = createCircleSpline({ radius: 100 }); expect(() => apply(circle, [Object.keys(circle.points)[0]])).toThrow('already tangent')
  })
})
