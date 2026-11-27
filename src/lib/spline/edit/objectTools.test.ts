import { describe, expect, it } from 'vitest'
import { createPolylineSpline, createRectangleSpline, createDonutSpline, mergeSplineData, setSegmentType, setSplinePointType, splineToPathDefinition } from '..'
import { simplifySplineObjects } from './simplifyObjects'
import { smoothSplineObjects } from './smoothObjects'
import { addSplineVertex } from './addVertex'
import { divideSplineEdges, assertSplineTopology } from '../topology'
import { segmentControls } from '../corners/segmentGeometry'
import { evaluateBezier } from '../../geometry/bezier/curves'
import { flattenPathContours } from '../../geometry/flattenPathContours'

describe('Object Simplify / Smooth geometry', () => {
  it('reduces collinear anchors, respects tolerance and leaves unselected holes/IDs untouched', () => {
    const path = createPolylineSpline(Array.from({ length: 21 }, (_, i) => ({ x: i * 5, y: Math.sin(i) * .1 })), false), donut = createDonutSpline({ outerRadius: 15, innerRadius: 6 }), data = mergeSplineData(path, donut)
    const ids = Object.keys(path.subShapes), before = structuredClone(data), small = simplifySplineObjects(data, ids, .001), large = simplifySplineObjects(data, ids, .5)
    assertSplineTopology(large); expect(Object.keys(large.points).length).toBeLessThan(Object.keys(small.points).length)
    const contour = Object.values(path.contours)[0]; expect(large.contours[contour.id].pointIds).toEqual([contour.pointIds[0], contour.pointIds.at(-1)])
    for (const id of Object.keys(donut.points)) expect(large.points[id]).toBe(data.points[id])
    for (const id of Object.keys(donut.contours)) expect(large.contours[id]).toBe(data.contours[id])
    expect(data).toEqual(before)
  })
  it('retains sharp rectangle corners and closed contour ownership even with a large tolerance', () => {
    const rectangle = createRectangleSpline({ width: 100, height: 60 }), source = divideSplineEdges(rectangle, Object.keys(rectangle.segments), 8), before = structuredClone(source)
    const result = simplifySplineObjects(source, Object.keys(source.subShapes), 100)
    assertSplineTopology(result); expect(Object.keys(result.points)).toEqual(Object.keys(rectangle.points)); expect(Object.keys(result.contours)).toEqual(Object.keys(rectangle.contours))
    expect(Object.values(result.contours)[0].closed).toBe(true); expect(source).toEqual(before)
  })
  it('coalesces exact subdivided cubic pieces without flattening or moving retained anchors', () => {
    let data = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 50 }], false), id = Object.keys(data.segments)[0]
    data = setSegmentType(data, id, 'cubic')
    for (const h of Object.values(data.handles)) { h.x = h.kind === 'out' ? 30 : 70; h.y = h.kind === 'out' ? 90 : -30 }
    const original = segmentControls(data, id), one = addSplineVertex(data, id, .3), two = addSplineVertex(one.data, one.edgeIds[1], .6)
    const next = simplifySplineObjects(two.data, Object.keys(two.data.subShapes), .001)
    assertSplineTopology(next); expect(Object.keys(next.points)).toHaveLength(2); expect(Object.keys(next.segments)).toHaveLength(1)
    const controls = segmentControls(next, Object.keys(next.segments)[0])
    controls.forEach((p, index) => { expect(p.x).toBeCloseTo(original[index].x, 7); expect(p.y).toBeCloseTo(original[index].y, 7) })
  })
  it('bounds a series of approximate curve merges against original source, not the previous approximation', () => {
    let data = createPolylineSpline(Array.from({ length: 17 }, (_, i) => ({ x: i * 8, y: 6 * Math.sin(i * 8 / 30) })), false)
    for (const id of Object.keys(data.points)) data = setSplinePointType(data, id, 'smooth')
    for (const handle of Object.values(data.handles)) { const p = data.points[handle.pointId], sign = handle.kind === 'out' ? 1 : -1; handle.x = p.x + sign * 8 / 3; handle.y = p.y + sign * .2 * Math.cos(p.x / 30) * 8 / 3 }
    const tolerance = .15, next = simplifySplineObjects(data, Object.keys(data.subShapes), tolerance)
    expect(Object.keys(next.points).length).toBeLessThan(Object.keys(data.points).length)
    const polyline = flattenPathContours(splineToPathDefinition(next), .01, 4096, 8)[0].points
    for (const edge of Object.keys(data.segments)) for (let i = 0; i <= 30; i++) {
      const p = evaluateBezier(segmentControls(data, edge), i / 30)
      const distances = polyline.slice(1).map((b, index) => { const a = polyline[index], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) })
      expect(Math.min(...distances)).toBeLessThanOrEqual(tolerance + .011)
    }
  })
  it('preserves explicit independent-handle vertices and reports no-op/minimal contours', () => {
    const data = createPolylineSpline([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], false), point = Object.values(data.contours)[0].pointIds[1]
    const source = setSplinePointType(data, point, 'bezierCorner')
    expect(simplifySplineObjects(source, Object.keys(source.subShapes), 10)).toBe(source)
    expect(() => simplifySplineObjects(source, [], 1)).toThrow('Select')
    expect(() => simplifySplineObjects(source, Object.keys(source.subShapes), -1)).toThrow('tolerance')
  })
  it('Smooth changes tangents/types while retaining every anchor, Object, contour and hole', () => {
    const selected = createDonutSpline({ outerRadius: 40, innerRadius: 15 }), untouched = createRectangleSpline({ width: 20, height: 10 }), data = mergeSplineData(selected, untouched), before = structuredClone(data)
    const next = smoothSplineObjects(data, Object.keys(selected.subShapes)); assertSplineTopology(next)
    expect(next.contours).toBe(data.contours); expect(Object.keys(next.points)).toEqual(Object.keys(data.points))
    for (const [id, p] of Object.entries(data.points)) { expect(next.points[id].x).toBe(p.x); expect(next.points[id].y).toBe(p.y); if (selected.points[id]) expect(next.points[id].type).toBe('smooth'); else expect(next.points[id]).toBe(p) }
    expect(data).toEqual(before); expect(smoothSplineObjects(next, Object.keys(selected.subShapes))).toBe(next)
  })
  it('Simplify coalesces subdivided curved outer and hole contours without changing ownership or winding', () => {
    const ring = createDonutSpline({ outerRadius: 40, innerRadius: 15 }), data = divideSplineEdges(ring, Object.keys(ring.segments), 4)
    const next = simplifySplineObjects(data, Object.keys(data.subShapes), .001)
    assertSplineTopology(next); expect(Object.keys(next.points)).toHaveLength(Object.keys(ring.points).length)
    expect(next.subShapes).toEqual(ring.subShapes)
    for (const { id, closed, pointIds } of Object.values(ring.contours)) {
      expect(next.contours[id]).toMatchObject({ id, closed, pointIds })
      expect(next.contours[id].segmentIds.every(edge => !!data.segments[edge])).toBe(true)
    }
  })
  it('Smooth preserves open endpoints without adding/subdividing anchors', () => {
    const source = createPolylineSpline([{ x: 0, y: 0 }, { x: 40, y: 10 }, { x: 80, y: 0 }], false), next = smoothSplineObjects(source, Object.keys(source.subShapes))
    assertSplineTopology(next); expect(Object.keys(next.points)).toEqual(Object.keys(source.points)); expect(Object.values(next.contours)[0].closed).toBe(false)
  })
})
