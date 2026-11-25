import { describe, expect, it } from 'vitest'
import { createPolylineSpline, createRectangleSpline, createDonutSpline, createCircleSpline, mergeSplineData, reverseContour, setSegmentType } from '../index'
import { Matrix2D } from '../../geometry/Matrix2D'
import { assertSplineTopology, connectSplineEndpoints, copySplineObjects, deleteSplineObjects, deleteSplineEdges, deleteSplinePoints, divideSplineEdges, extractSplineObjects, remapSplineData } from './index'

/** Two independently owned open contours; first/last endpoints are deliberate. */
function pair() {
  const a = createPolylineSpline([{ x: 0, y: 0 }, { x: 20, y: 0 }], false)
  const b = createPolylineSpline([{ x: 22, y: 0 }, { x: 40, y: 10 }], false)
  const data = mergeSplineData(a, b), left = Object.values(a.contours)[0], right = Object.values(b.contours)[0]
  return { data, a, b, left, right }
}
describe('S2D-2 normalized topology', () => {
  it('connects every endpoint orientation, retaining source curves, IDs and first ownership', () => {
    for (const reverseA of [false, true]) for (const reverseB of [false, true]) {
      const { data, left, right } = pair()
      let input = reverseA ? reverseContour(data, left.id) : data
      if (reverseB) input = reverseContour(input, right.id)
      const before = structuredClone(input), first = left.pointIds[1], second = right.pointIds[0]
      const result = connectSplineEndpoints(input, first, second)
      assertSplineTopology(result)
      expect(Object.keys(result.subShapes)).toHaveLength(1); expect(result.contours[left.id].pointIds).toEqual([...left.pointIds, ...right.pointIds])
      expect(Object.keys(result.segments)).toHaveLength(3); expect(input).toEqual(before)
    }
  })
  it('welds in composition pixels, preserving the first ID and rejecting far/interior/closed inputs', () => {
    const { data, left, right } = pair(), first = left.pointIds[1], second = right.pointIds[0]
    const result = connectSplineEndpoints(data, first, second, { weld: true, tolerancePx: 4, localToComposition: Matrix2D.scale(2) })
    assertSplineTopology(result); expect(result.points[second]).toBeUndefined(); expect(result.points[first].x).toBe(20)
    expect(() => connectSplineEndpoints(data, first, second, { weld: true, tolerancePx: 3, localToComposition: Matrix2D.scale(2) })).toThrow('tolerance')
    const closed = createRectangleSpline({ width: 30, height: 30 }), ids = Object.keys(closed.points)
    expect(() => connectSplineEndpoints(closed, ids[0], ids[1])).toThrow('endpoints')
    expect(() => connectSplineEndpoints(data, first, first)).toThrow('different')
  })
  it('transfers cubic tangents during Weld without mirroring the original incoming handle', () => {
    const { data, left, right } = pair()
    const curved = setSegmentType(setSegmentType(data, left.segmentIds[0], 'cubic'), right.segmentIds[0], 'cubic')
    const first = left.pointIds[1], second = right.pointIds[0]
    const incoming = Object.values(curved.handles).find(handle => handle.pointId === first && handle.kind === 'in')!
    const outgoing = Object.values(curved.handles).find(handle => handle.pointId === second && handle.kind === 'out')!
    const result = connectSplineEndpoints(curved, first, second, { weld: true, tolerancePx: 5 })
    assertSplineTopology(result)
    expect(result.handles[incoming.id]).toEqual(incoming)
    expect(result.handles[outgoing.id]).toEqual({ ...outgoing, pointId: first, x: outgoing.x - 2 })
    expect(result.points[first].type).toBe('bezierCorner')
  })
  it('closes one contour with connect or weld without duplicated anchors', () => {
    const data = createPolylineSpline([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 1, y: 0 }], false), contour = Object.values(data.contours)[0]
    for (const first of [contour.pointIds[0], contour.pointIds.at(-1)!]) {
      const second = first === contour.pointIds[0] ? contour.pointIds.at(-1)! : contour.pointIds[0]
      const connect = connectSplineEndpoints(data, first, second), weld = connectSplineEndpoints(data, first, second, { weld: true, tolerancePx: 2 })
      assertSplineTopology(connect); assertSplineTopology(weld)
      expect(connect.contours[contour.id].pointIds).toHaveLength(4); expect(weld.contours[contour.id].pointIds).toHaveLength(3)
      expect(weld.contours[contour.id].closed).toBe(true); expect(weld.points[first]).toBeDefined()
    }
  })
  it('copies donut contours with fresh connectivity IDs and deletes only the requested Object', () => {
    const rectangle = createRectangleSpline({ width: 30, height: 20 }), donut = createDonutSpline({ outerRadius: 20, innerRadius: 8 })
    const data = mergeSplineData(rectangle, donut), ids = Object.keys(donut.subShapes), before = structuredClone(data)
    const copy = copySplineObjects(data, ids, 40, 0); assertSplineTopology(copy.data)
    expect(copy.objectIds).toHaveLength(1); expect(copy.data.subShapes[copy.objectIds[0]].contourIds).toHaveLength(2)
    expect(Object.keys(extractSplineObjects(copy.data, copy.objectIds).points).some(id => data.points[id])).toBe(false)
    const removed = deleteSplineObjects(copy.data, copy.objectIds); assertSplineTopology(removed); expect(removed).toEqual(data)
    expect(data).toEqual(before)
    expect(deleteSplineObjects(data, Object.keys(data.subShapes)).points).toEqual({})
  })
  it('remaps imported collisions and every point/handle/edge/contour ownership reference', () => {
    const data = createCircleSpline({ radius: 30 }), output = remapSplineData(data, data)
    assertSplineTopology(output.data)
    for (const family of ['points', 'handles', 'segments', 'contours', 'subShapes'] as const) for (const id of Object.keys(data[family])) {
      expect(output.maps[family][id]).not.toBe(id); expect(output.data[family][output.maps[family][id]]).toBeDefined()
    }
  })
  it('divides quadratic edges at original equal-parameter locations without flattening', () => {
    const data = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false), contour = Object.values(data.contours)[0], edge = contour.segmentIds[0]
    data.segments[edge] = { ...data.segments[edge], type: 'quadratic', control1: { x: 50, y: 100 } }
    const result = divideSplineEdges(data, [edge], 4); assertSplineTopology(result)
    expect(result.contours[contour.id].pointIds.map(id => [result.points[id].x, result.points[id].y])).toEqual([[0, 0], [25, 37.5], [50, 50], [75, 37.5], [100, 0]])
    expect(Object.values(result.segments).every(edge => edge.type === 'quadratic')).toBe(true)
    expect(() => divideSplineEdges(data, [edge], 100)).toThrow('2–64')
  })
  it('cuts closed and open contours into unbridged ordered runs and removes orphan geometry', () => {
    const closed = createRectangleSpline({ width: 100, height: 60 }), contour = Object.values(closed.contours)[0]
    const opened = deleteSplineEdges(closed, [contour.segmentIds[0]]); assertSplineTopology(opened)
    expect(opened.contours[contour.id].closed).toBe(false); expect(Object.keys(opened.segments)).toHaveLength(3)
    const cut = deleteSplineEdges(closed, [contour.segmentIds[0], contour.segmentIds[2]]); assertSplineTopology(cut)
    expect(Object.keys(cut.contours)).toHaveLength(2); expect(Object.keys(cut.subShapes)).toHaveLength(1)
    expect(Object.keys(cut.segments).sort()).toEqual([contour.segmentIds[1], contour.segmentIds[3]].sort())
    const empty = deleteSplineEdges(closed, contour.segmentIds); assertSplineTopology(empty); expect(empty.subShapes).toEqual({})
  })
  it('batch point deletion cleans final contours/handles while preserving other Objects', () => {
    const { data, a, b } = pair(), result = deleteSplinePoints(data, Object.keys(a.points))
    assertSplineTopology(result); expect(result).toEqual(b)
  })
})
