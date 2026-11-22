import { describe, expect, it } from 'vitest'
import { createCircleSpline, createRectangleSpline, createDonutSpline, appendSplineObjects } from '../index'
import { buildSplineData } from '../util/buildSplineData'
import { deleteSplineEdges, assertSplineTopology } from '../topology'
import { Matrix2D } from '../../geometry/Matrix2D'
import { evaluateBezier, trimBezier } from '../../geometry/bezier/curves'
import { bezierLengthTable, parameterAtArcLength } from '../../geometry/bezier/arcLength'
import { segmentControls } from './segmentGeometry'
import { chamferSpline } from './chamferSpline'
import type { SplinePathData } from '../../types/spline'

const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0]
/** Independent dense Bernstein sampling for numerical regression assertions. */
function length(points: { x: number; y: number }[]) {
  let result = 0, previous = points[0]
  const n = points.length - 1, coefficients = n === 3 ? [1, 3, 3, 1] : n === 2 ? [1, 2, 1] : [1, 1]
  for (let i = 1; i <= 20000; i++) {
    const t = i / 20000, p = { x: 0, y: 0 }
    for (let j = 0; j <= n; j++) { const w = coefficients[j] * t ** j * (1 - t) ** (n - j); p.x += points[j].x * w; p.y += points[j].y * w }
    result += Math.hypot(p.x - previous.x, p.y - previous.y); previous = p
  }
  return result
}
function apply(data: SplinePathData, pointIds: string[], distancePx = 10, matrix = identity) { return chamferSpline({ data, pointIds, distancePx, matrix }) }

describe('selected-corner Chamfer', () => {
  it('cuts a rectangle, retains ordered edge IDs and unrelated Objects, with no source mutation', () => {
    const rect = createRectangleSpline({ width: 100, height: 80 }), extra = createCircleSpline({ radius: 20 })
    const data = appendSplineObjects(rect, extra).data, contour = Object.values(rect.contours)[0], before = structuredClone(data)
    const result = apply(data, [contour.pointIds[0], contour.pointIds[1]])
    expect(data).toEqual(before); assertSplineTopology(result.data)
    expect(Object.keys(result.data.points)).toHaveLength(Object.keys(data.points).length + 2)
    for (const id of contour.segmentIds) expect(result.data.segments[id]).toBeDefined()
    const shared = contour.segmentIds[0]
    expect(length(segmentControls(result.data, shared))).toBeCloseTo(80, 6)
    for (const cut of result.cuts) {
      expect(result.data.points[cut.removedId]).toBeUndefined()
      expect(length(segmentControls(result.data, cut.bevelId))).toBeCloseTo(Math.sqrt(200), 6)
    }
    for (const family of ['points', 'handles', 'segments', 'contours', 'subShapes'] as const) for (const id of Object.keys(extra[family])) expect(result.data[family][id]).toBe(data[family][id])
    expect(result.data.fillRule).toBe(data.fillRule)
  })
  it.each(['cubic', 'quadratic'] as const)('preserves exact %s subcurves at mixed curve/line corners', type => {
    const data = buildSplineData({ kind: 'custom', name: 'Mixed', contours: [{ closed: false, anchors: [
      { x: 0, y: 0, type: 'corner', out: { x: 60, y: -60 } }, { x: 100, y: 0, type: 'bezierCorner', in: { x: 90, y: -50 } }, { x: 100, y: 100, type: 'corner' },
    ] }] }), c = Object.values(data.contours)[0], edge = c.segmentIds[0]
    if (type === 'quadratic') data.segments[edge] = { ...data.segments[edge], type, control1: { x: 70, y: -80 } }
    const result = apply(data, [c.pointIds[1]], 13), controls = segmentControls(data, edge), trimmed = segmentControls(result.data, edge)
    expect(result.data.segments[edge].type).toBe(type)
    expect(length(controls) - length(trimmed)).toBeCloseTo(13, 2)
    const table = bezierLengthTable(controls), end = parameterAtArcLength(table, table.length - 13)
    for (const t of [0, .1, .5, 1]) {
      const a = evaluateBezier(trimmed, t), b = evaluateBezier(controls, t * end)
      expect(a.x).toBeCloseTo(b.x, 8); expect(a.y).toBeCloseTo(b.y, 8)
    }
    expect(result.data.points[c.pointIds[0]].x).toBe(data.points[c.pointIds[0]].x)
  })
  it('cuts both ends of shared cubic edges in world px under rotated, reflected and nonuniform parents', () => {
    for (const reflected of [false, true]) {
      const data = createCircleSpline({ radius: 100 }), c = Object.values(data.contours)[0]
      const matrix = Matrix2D.translation(200, 80).rotate(27).scale(reflected ? -1.4 : 1.4, .7), result = apply(data, c.pointIds.slice(0, 2), 9, matrix.toArray())
      for (const id of c.segmentIds) {
        const edge = data.segments[id], count = [edge.fromPointId, edge.toPointId].filter(p => c.pointIds.slice(0, 2).includes(p)).length
        const original = segmentControls(data, id).map(p => matrix.applyToPoint(p)), actual = segmentControls(result.data, id).map(p => matrix.applyToPoint(p))
        expect(length(original) - length(actual)).toBeCloseTo(count * 9, 2)
        expect(result.data.segments[id].type).toBe('cubic')
      }
    }
  })
  it('supports open interiors and holes without changing closure, contour ownership or winding', () => {
    const circle = createCircleSpline({ radius: 70 }), open = deleteSplineEdges(circle, [Object.keys(circle.segments)[0]]), c = Object.values(open.contours)[0]
    expect(Object.values(apply(open, [c.pointIds[1]]).data.contours)[0].closed).toBe(false)
    expect(() => apply(open, [c.pointIds[0]])).toThrow('open endpoints')
    const donut = createDonutSpline({ outerRadius: 100, innerRadius: 40 }), inner = Object.values(donut.contours)[1]
    const result = apply(donut, [inner.pointIds[0]])
    expect(Object.values(result.data.subShapes)[0].contourIds).toEqual(Object.values(donut.subShapes)[0].contourIds)
    expect(Object.values(result.data.contours).every(c => c.closed)).toBe(true)
  })
  it('rejects overlapping cuts, degeneracy, invalid settings/selection, locks, singular transforms and quality exhaustion atomically', () => {
    const data = createRectangleSpline({ width: 100, height: 80 }), ids = Object.values(data.contours)[0].pointIds, before = structuredClone(data)
    expect(() => apply(data, ids.slice(0, 2), 50)).toThrow('overlap')
    for (const amount of [NaN, Infinity, 0, -.1, 10001]) expect(() => apply(data, [ids[0]], amount)).toThrow('distance')
    expect(() => apply(data, [])).toThrow('Select')
    expect(() => apply(data, ['unknown'])).toThrow('existing')
    expect(() => apply(data, [ids[0]], 10, [0, 0, 0, 0, 0, 0])).toThrow('singular')
    expect(data).toEqual(before)
    data.points[ids[2]] = { ...data.points[ids[2]], locked: true }; expect(() => apply(data, [ids[0]])).toThrow('Unlock')
    expect(() => bezierLengthTable([{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }], .0025, 2)).toThrow('budget')
  })
  it('rejects self-crossing input rather than creating a guessed topology', () => {
    const data = buildSplineData({ kind: 'custom', name: 'Cross', contours: [{ closed: true, anchors: [[0, 0], [100, 100], [100, 0], [0, 100]].map(([x, y]) => ({ x, y, type: 'corner' })) }] })
    expect(() => apply(data, [Object.keys(data.points)[0]])).toThrow(/intersect|contact|area/i)
  })
})

describe('shared exact Bézier and bounded inverse length', () => {
  it('handles collinear but nonuniform parameter velocity and a curved polynomial', () => {
    for (const controls of [[{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 80, y: 150 }, { x: -50, y: -20 }, { x: 100, y: 40 }]]) {
      const table = bezierLengthTable(controls)
      expect(Math.abs(table.length - length(controls))).toBeLessThan(.003)
      for (const fraction of [.1, .5, .9]) {
        const t = parameterAtArcLength(table, table.length * fraction)
        expect(Math.abs(length(trimBezier(controls, 0, t)) - table.length * fraction)).toBeLessThan(.006)
      }
    }
  })
})
