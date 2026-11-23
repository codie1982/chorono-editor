import { describe, expect, it } from 'vitest'
import { createCircleSpline, createDonutSpline, createPolylineSpline, mergeSplineData, setSegmentType } from '..'
import { assertSplineTopology, breakSplinePoints, splitSplineEdges } from '.'
import { segmentControls } from '../corners/segmentGeometry'
import { evaluateBezier } from '../../geometry/bezier/curves'

describe('native Break / Split ownership', () => {
  it('opens a cubic loop without moving any edge, transferring the outgoing handle to an independent endpoint', () => {
    const data = createCircleSpline({ radius: 30 }), before = structuredClone(data), contour = Object.values(data.contours)[0], id = contour.pointIds[2]
    const outgoing = Object.values(data.handles).find(handle => handle.pointId === id && handle.kind === 'out')!
    const cut = breakSplinePoints(data, [id]), duplicate = cut.pointIds[1]
    assertSplineTopology(cut.data)
    expect(cut.data.contours[contour.id].closed).toBe(false)
    expect(cut.data.contours[contour.id].pointIds[0]).toBe(duplicate)
    expect(cut.data.contours[contour.id].pointIds.at(-1)).toBe(id)
    expect(cut.data.points[duplicate]).toEqual({ ...data.points[id], id: duplicate })
    expect(cut.data.handles[outgoing.id]).toEqual({ ...outgoing, pointId: duplicate })
    for (const edge of contour.segmentIds) expect(segmentControls(cut.data, edge)).toEqual(segmentControls(data, edge))
    expect(data).toEqual(before)
  })
  it('cuts multiple adjacent points on an open path, preserving owner, holes and unrelated records', () => {
    const path = createPolylineSpline([{ x: 0, y: 0 }, { x: 30, y: 20 }, { x: 60, y: -10 }, { x: 90, y: 0 }], false), donut = createDonutSpline({ outerRadius: 15, innerRadius: 7 })
    const data = mergeSplineData(path, donut), contour = Object.values(path.contours)[0], owner = Object.values(path.subShapes)[0]
    const cut = breakSplinePoints(data, contour.pointIds.slice(1, 3)); assertSplineTopology(cut.data)
    expect(cut.data.subShapes[owner.id].contourIds).toHaveLength(3)
    expect(Object.keys(cut.data.segments)).toEqual(Object.keys(data.segments))
    for (const id of Object.keys(donut.points)) expect(cut.data.points[id]).toBe(data.points[id])
    for (const id of Object.keys(donut.contours)) expect(cut.data.contours[id]).toBe(data.contours[id])
    expect(() => breakSplinePoints(data, [contour.pointIds[1], contour.pointIds[0]])).toThrow('already separate')
  })
  it.each(['line', 'quadratic', 'cubic'] as const)('splits %s at an exact parameter into two independent curve pieces', type => {
    let data = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 40 }], false)
    const contour = Object.values(data.contours)[0], edgeId = contour.segmentIds[0]
    if (type === 'cubic') data = setSegmentType(data, edgeId, 'cubic')
    if (type === 'quadratic') data.segments[edgeId] = { ...data.segments[edgeId], type, control1: { x: 12, y: 140 } }
    const before = structuredClone(data), controls = segmentControls(data, edgeId), t = .37, cut = splitSplineEdges(data, [edgeId], t)
    assertSplineTopology(cut.data); expect(Object.keys(cut.data.contours)).toHaveLength(2)
    const [left, right] = cut.edgeIds.map(id => cut.data.segments[id])
    expect(left.toPointId).not.toBe(right.fromPointId)
    const a = cut.data.points[left.toPointId], b = cut.data.points[right.fromPointId]
    expect([a.x, a.y]).toEqual([b.x, b.y])
    for (let i = 0; i <= 20; i++) {
      const u = i / 20
      for (const [edge, originalT] of [[left, u * t], [right, t + u * (1 - t)]] as const) {
        const actual = evaluateBezier(segmentControls(cut.data, edge.id), u), expected = evaluateBezier(controls, originalT)
        expect(actual.x).toBeCloseTo(expected.x, 10); expect(actual.y).toBeCloseTo(expected.y, 10)
      }
    }
    expect(data).toEqual(before)
    expect(() => splitSplineEdges(data, [edgeId], 0)).toThrow('Split position')
  })
  it('splits a closing edge and multiple selected edges without orphaning loops or sharing anchors', () => {
    const data = createCircleSpline({ radius: 30 }), contour = Object.values(data.contours)[0]
    const cut = splitSplineEdges(data, [contour.segmentIds.at(-1)!, contour.segmentIds[1]])
    assertSplineTopology(cut.data); expect(Object.values(cut.data.contours).every(item => !item.closed)).toBe(true)
    expect(Object.keys(cut.data.contours)).toHaveLength(2); expect(cut.edgeIds).toHaveLength(4)
  })
  it('keeps opposite cubic curves untouched when shortening a mirror endpoint handle', () => {
    const data = createCircleSpline({ radius: 30 }), contour = Object.values(data.contours)[0], id = contour.segmentIds[0], edge = data.segments[id]
    const cut = splitSplineEdges(data, [id], .25)
    for (const endpoint of [edge.fromPointId, edge.toPointId]) expect(cut.data.points[endpoint].type).toBe('smooth')
    for (const other of contour.segmentIds.slice(1)) expect(segmentControls(cut.data, other)).toEqual(segmentControls(data, other))
  })
})
