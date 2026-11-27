import { describe, expect, it } from 'vitest'
import { createPolylineSpline, createRectangleSpline, createCircleSpline, createDonutSpline, mergeSplineData, setSegmentType } from '..'
import { assertSplineTopology, trimSplineAt, extendSplineToBoundary } from '.'
import { segmentControls } from '../corners/segmentGeometry'
import { evaluateBezier } from '../../geometry/bezier/curves'

/** Unconnected crossing boundaries remain owned by their original Objects. */
function crossing() {
  const line = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false)
  const cutterA = createPolylineSpline([{ x: 20, y: -20 }, { x: 20, y: 20 }], false), cutterB = createPolylineSpline([{ x: 80, y: -20 }, { x: 80, y: 20 }], false)
  return { data: mergeSplineData(mergeSplineData(line, cutterA), cutterB), contour: Object.values(line.contours)[0], cutterA, cutterB }
}
describe('native contour Trim and tangent Extend', () => {
  it('removes only the clicked interval and retains exact independent runs and cutters', () => {
    const { data, contour, cutterA, cutterB } = crossing(), before = structuredClone(data), result = trimSplineAt(data, contour.segmentIds[0], .5)
    assertSplineTopology(result.data)
    const owner = Object.values(data.subShapes).find(item => item.contourIds.includes(contour.id))!
    expect(result.data.subShapes[owner.id].contourIds).toHaveLength(2)
    const runs = result.data.subShapes[owner.id].contourIds.map(id => result.data.contours[id].pointIds.map(id => result.data.points[id].x))
    expect(runs[0][0]).toBe(0); expect(runs[0][1]).toBeCloseTo(20); expect(runs[1][0]).toBeCloseTo(80); expect(runs[1][1]).toBe(100)
    for (const source of [cutterA, cutterB]) for (const id of Object.keys(source.points)) expect(result.data.points[id]).toBe(data.points[id])
    expect(data).toEqual(before)
  })
  it('uses open endpoints as terminal limits and refuses a click on an intersection', () => {
    const { data, contour } = crossing(), result = trimSplineAt(data, contour.segmentIds[0], .1)
    assertSplineTopology(result.data); expect(result.data.points[contour.pointIds[0]]).toBeUndefined()
    expect(() => trimSplineAt(data, contour.segmentIds[0], .2)).toThrow('between intersections')
    const only = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false)
    expect(trimSplineAt(only, Object.keys(only.segments)[0], .5).data).toBe(only)
  })
  it('trims a multi-edge interval through a closed seam, retaining unrelated holes and Bézier source', () => {
    const ring = createRectangleSpline({ width: 100, height: 80 }), cut = createPolylineSpline([{ x: -80, y: 0 }, { x: 80, y: 0 }], false), donut = createDonutSpline({ outerRadius: 12, innerRadius: 5 })
    const data = mergeSplineData(mergeSplineData(ring, cut), donut), contour = Object.values(ring.contours)[0]
    const result = trimSplineAt(data, contour.segmentIds[0], .5); assertSplineTopology(result.data)
    expect(result.data.contours[contour.id].closed).toBe(false)
    expect(result.data.contours[contour.id].segmentIds).toHaveLength(3)
    for (const id of Object.keys(donut.contours)) expect(result.data.contours[id]).toBe(data.contours[id])
  })
  it('preserves polynomial curves on each retained piece', () => {
    const { data, contour } = crossing(), id = contour.segmentIds[0], curved = setSegmentType(data, id, 'cubic'), controls = segmentControls(curved, id)
    const result = trimSplineAt(curved, id, .5); assertSplineTopology(result.data)
    for (const edgeId of result.edgeIds) {
      const edge = result.data.segments[edgeId], from = result.data.points[edge.fromPointId].x / 100, to = result.data.points[edge.toPointId].x / 100
      for (let i = 0; i <= 10; i++) {
        const actual = evaluateBezier(segmentControls(result.data, edgeId), i / 10), expected = evaluateBezier(controls, from + (to - from) * i / 10)
        expect(actual.x).toBeCloseTo(expected.x, 6); expect(actual.y).toBeCloseTo(expected.y, 6)
      }
    }
  })
  it('handles smooth circle neighbor joins while finding cuts on other contours', () => {
    const circle = createCircleSpline({ radius: 30 }), cut = createPolylineSpline([{ x: -40, y: 0 }, { x: 40, y: 0 }], false), data = mergeSplineData(circle, cut), contour = Object.values(circle.contours)[0]
    const result = trimSplineAt(data, contour.segmentIds[0], .5); assertSplineTopology(result.data)
    expect(result.data.contours[contour.id].closed).toBe(false)
  })
  it('trims a self-crossing cubic loop without needing another boundary object', () => {
    let data = createPolylineSpline([{ x: .1875, y: 0 }, { x: .1875, y: .1875 }], false)
    const edge = Object.keys(data.segments)[0]; data = setSegmentType(data, edge, 'cubic')
    for (const handle of Object.values(data.handles)) {
      handle.x = .1875 - 1 / 3; handle.y = handle.kind === 'out' ? .0625 : -.20833333333333333
    }
    const before = structuredClone(data), result = trimSplineAt(data, edge, .5)
    assertSplineTopology(result.data); expect(Object.keys(result.data.contours)).toHaveLength(2)
    expect(Object.keys(result.data.subShapes)).toHaveLength(1); expect(data).toEqual(before)
  })
  it('extends either open end to the nearest forward hit; farther/behind cutters and original geometry stay intact', () => {
    const { data, contour } = crossing(), source = createPolylineSpline([{ x: 30, y: 0 }, { x: 50, y: 0 }], false), owner = Object.values(source.contours)[0]
    // Exclude the overlapping original horizontal line; retain only the two vertical cutters.
    const cutters = Object.values(data.segments).filter(edge => edge.id !== contour.segmentIds[0]).map(edge => ({ key: edge.id, controls: segmentControls(data, edge.id) }))
    for (const t of [0, 1]) {
      const result = extendSplineToBoundary(source, owner.segmentIds[0], t, cutters); assertSplineTopology(result.data)
      const point = result.data.points[Object.keys(result.data.points).find(id => !source.points[id])!]
      expect(point.x).toBeCloseTo(t ? 80 : 20); expect(point.y).toBeCloseTo(0)
      for (const id of Object.keys(source.points)) expect(result.data.points[id]).toBe(source.points[id])
      expect(segmentControls(result.data, owner.segmentIds[0])).toEqual(segmentControls(source, owner.segmentIds[0]))
    }
    expect(extendSplineToBoundary(source, owner.segmentIds[0], 1, []).data).toBe(source)
    expect(() => extendSplineToBoundary(createRectangleSpline({ width: 20, height: 20 }), 'missing')).toThrow('open contour')
  })
})
