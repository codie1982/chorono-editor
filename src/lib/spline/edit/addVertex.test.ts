import { describe, expect, it } from 'vitest'
import { createPolylineSpline, createDonutSpline, mergeSplineData, setSegmentType } from '..'
import { addSplineVertex } from './addVertex'
import { assertSplineTopology } from '../topology'
import { segmentControls } from '../corners/segmentGeometry'
import { evaluateBezier } from '../../geometry/bezier/curves'
import { copySplineTangents } from './tangents'

/** Exact line/Q/C source plus an unrelated Object with a hole. */
function fixture(kind: 'line' | 'quadratic' | 'cubic') {
  let line = createPolylineSpline([{ x: 0, y: 0 }, { x: 80, y: 100 }], false), edge = Object.keys(line.segments)[0]
  if (kind === 'quadratic') line.segments[edge] = { ...line.segments[edge], type: kind, control1: { x: 80, y: 0 } }
  if (kind === 'cubic') { line = setSegmentType(line, edge, 'cubic'); for (const h of Object.values(line.handles)) { h.x = h.kind === 'out' ? 100 : -20; h.y = h.kind === 'out' ? -20 : 140 } }
  const donut = createDonutSpline({ outerRadius: 30, innerRadius: 12 })
  return { data: mergeSplineData(line, donut), edge, donut }
}
describe('typed Add Vertex', () => {
  it.each(['line', 'quadratic', 'cubic'] as const)('preserves every %s curve point and unrelated Object when no type is forced', kind => {
    const { data, edge, donut } = fixture(kind), before = structuredClone(data), original = segmentControls(data, edge), t = .31, added = addSplineVertex(data, edge, t)
    assertSplineTopology(added.data); expect(added.edgeIds).toHaveLength(2)
    for (let i = 0; i <= 30; i++) for (const [id, parameter] of [[added.edgeIds[0], i / 30 * t], [added.edgeIds[1], t + i / 30 * (1 - t)]] as const) {
      const a = evaluateBezier(segmentControls(added.data, id), i / 30), b = evaluateBezier(original, parameter)
      expect(a.x).toBeCloseTo(b.x, 9); expect(a.y).toBeCloseTo(b.y, 9)
    }
    for (const id of Object.keys(donut.contours)) expect(added.data.contours[id]).toBe(data.contours[id])
    expect(data).toEqual(before)
  })
  it.each(['corner', 'smooth', 'bezier', 'bezierCorner'] as const)('uses the requested %s connection mode at the inserted point', type => {
    const { data, edge } = fixture('cubic'), point = evaluateBezier(segmentControls(data, edge), .3), added = addSplineVertex(data, edge, .3, type)
    assertSplineTopology(added.data); expect(added.data.points[added.pointId]).toMatchObject({ type, x: point.x, y: point.y })
    const tangent = copySplineTangents(added.data, added.pointId)
    if (type === 'corner') expect(Object.values(added.data.handles).filter(h => h.pointId === added.pointId)).toHaveLength(0)
    else if (type === 'bezier') { expect(tangent.in!.x).toBeCloseTo(-tangent.out!.x, 10); expect(tangent.in!.y).toBeCloseTo(-tangent.out!.y, 10) }
    for (const id of Object.keys(data.points)) expect(added.data.points[id].x).toBe(data.points[id].x)
  })
  it('promotes typed quadratic insertion exactly, and derives vertical line handles along the line', () => {
    const { data, edge } = fixture('quadratic'), original = segmentControls(data, edge), added = addSplineVertex(data, edge, .4, 'bezierCorner')
    for (const [index, id] of Array.from(added.edgeIds.entries())) {
      expect(added.data.segments[id].type).toBe('cubic')
      const actual = evaluateBezier(segmentControls(added.data, id), .5), expected = evaluateBezier(original, index ? .7 : .2)
      expect(actual.x).toBeCloseTo(expected.x, 9); expect(actual.y).toBeCloseTo(expected.y, 9)
    }
    const vertical = createPolylineSpline([{ x: 20, y: 0 }, { x: 20, y: 100 }], false), next = addSplineVertex(vertical, Object.keys(vertical.segments)[0], .4, 'smooth')
    expect(Object.values(next.data.handles).every(handle => handle.x === 20)).toBe(true)
  })
  it('rejects endpoint/invalid picks without mutating source', () => {
    const { data, edge } = fixture('line'), before = structuredClone(data)
    for (const t of [0, 1, NaN]) expect(() => addSplineVertex(data, edge, t)).toThrow('inside')
    expect(data).toEqual(before)
  })
})
