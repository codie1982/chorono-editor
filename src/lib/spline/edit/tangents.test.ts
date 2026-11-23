import { describe, expect, it } from 'vitest'
import { createPolylineSpline, createCircleSpline, mergeSplineData, setSplinePointType } from '..'
import { assertSplineTopology } from '../topology'
import { copySplineTangents, pasteSplineTangents, resetSplineTangents, fuseSplinePoints } from './tangents'
import { segmentControls } from '../corners/segmentGeometry'
import { evaluateBezier } from '../../geometry/bezier/curves'
import type { SplineTangents } from './tangents'

/** Round-trip absolute handle storage incurs ordinary floating-point error. */
function expectTangents(actual: SplineTangents, expected: SplineTangents) {
  expect(actual.type).toBe(expected.type)
  for (const kind of ['in', 'out'] as const) {
    if (!expected[kind]) expect(actual[kind]).toBeUndefined()
    else { expect(actual[kind]!.x).toBeCloseTo(expected[kind]!.x, 10); expect(actual[kind]!.y).toBeCloseTo(expected[kind]!.y, 10) }
  }
}

describe('Point tangent tools and Fuse', () => {
  it('retains source identity when resetting a handle-free Corner, so no empty Undo/materialization is generated', () => {
    const data = createPolylineSpline([{ x: 0, y: 0 }, { x: 10, y: 0 }], false), id = Object.keys(data.points)[0]
    expect(resetSplineTangents(data, [id])).toBe(data)
  })
  it('Fuses to the arithmetic center while preserving every ID, connection and handle offset', () => {
    const data = createCircleSpline({ radius: 40 }), ids = Object.keys(data.points).slice(0, 3), before = structuredClone(data)
    const offsets = ids.map(id => copySplineTangents(data, id)), next = fuseSplinePoints(data, ids), x = ids.reduce((n, id) => n + data.points[id].x / 3, 0), y = ids.reduce((n, id) => n + data.points[id].y / 3, 0)
    assertSplineTopology(next); expect(next.contours).toBe(data.contours); expect(next.segments).toBe(data.segments)
    ids.forEach((id, index) => { expect(next.points[id]).toEqual({ ...data.points[id], x, y }); expectTangents(copySplineTangents(next, id), offsets[index]) })
    expect(data).toEqual(before); expect(() => fuseSplinePoints(data, ids.slice(0, 1))).toThrow('at least two')
  })
  it.each(['corner', 'smooth', 'bezier', 'bezierCorner'] as const)('resets %s from original adjacent anchors without moving anchors or unrelated geometry', type => {
    let data = createPolylineSpline([{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 90 }], false)
    const id = Object.values(data.contours)[0].pointIds[1]; data = setSplinePointType(data, id, type)
    const before = structuredClone(data), next = resetSplineTangents(data, [id]), value = copySplineTangents(next, id)
    assertSplineTopology(next); expect(next.points[id]).toEqual(data.points[id]); expect(data).toEqual(before)
    if (type === 'corner') { expect(value.in).toBeUndefined(); expect(value.out).toBeUndefined() }
    else if (type === 'bezierCorner') expect(value).toEqual({ type, in: { x: -20, y: 0 }, out: { x: 0, y: 30 } })
    else {
      expect(value.in!.x * value.out!.y - value.in!.y * value.out!.x).toBeCloseTo(0)
      expect(Math.hypot(value.in!.x, value.in!.y)).toBeCloseTo(20)
      expect(Math.hypot(value.out!.x, value.out!.y)).toBeCloseTo(type === 'bezier' ? 20 : 30)
    }
  })
  it('resets endpoints, coincident neighbors and multi-selection deterministically', () => {
    let data = createPolylineSpline([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 30, y: 0 }], false)
    const ids = Object.keys(data.points)
    for (const id of ids) data = setSplinePointType(data, id, 'smooth')
    const a = resetSplineTangents(data, ids), b = resetSplineTangents(data, [...ids].reverse())
    assertSplineTopology(a); expect(a).toEqual(b)
    expect(Object.values(a.handles).every(h => Number.isFinite(h.x) && Number.isFinite(h.y))).toBe(true)
  })
  it('copies local vectors and point type to multiple distant targets without moving anchors', () => {
    const source = createCircleSpline({ radius: 25 }), target = createPolylineSpline([{ x: 100, y: 40 }, { x: 160, y: 80 }], false)
    const data = mergeSplineData(source, target), id = Object.keys(source.points)[0], ids = Object.keys(target.points), clipboard = copySplineTangents(data, id), before = structuredClone(data)
    const next = pasteSplineTangents(data, ids, clipboard); assertSplineTopology(next)
    for (const targetId of ids) { expectTangents(copySplineTangents(next, targetId), clipboard); expect([next.points[targetId].x, next.points[targetId].y]).toEqual([data.points[targetId].x, data.points[targetId].y]) }
    expect(data).toEqual(before); expect(clipboard).not.toHaveProperty('pointId')
    expect(() => pasteSplineTangents(data, ids, { type: 'smooth', in: { x: NaN, y: 0 } })).toThrow('finite')
  })
  it('promotes quadratic neighbors exactly before replacing only the selected endpoint tangent', () => {
    const data = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false), contour = Object.values(data.contours)[0], edge = contour.segmentIds[0]
    data.segments[edge] = { ...data.segments[edge], type: 'quadratic', control1: { x: 40, y: 90 } }
    const controls = segmentControls(data, edge), value = copySplineTangents(data, contour.pointIds[0]), next = pasteSplineTangents(data, [contour.pointIds[0]], value)
    expect(next.segments[edge].type).toBe('cubic'); assertSplineTopology(next)
    for (let i = 0; i <= 10; i++) {
      const a = evaluateBezier(controls, i / 10), b = evaluateBezier(segmentControls(next, edge), i / 10)
      expect(a.x).toBeCloseTo(b.x, 10); expect(a.y).toBeCloseTo(b.y, 10)
    }
  })
})
