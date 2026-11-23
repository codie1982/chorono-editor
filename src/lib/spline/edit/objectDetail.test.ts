import { describe, expect, it } from 'vitest'
import { createCircleSpline, createDonutSpline, createPolylineSpline, mergeSplineData, setSegmentType, splineToPathDefinition } from '..'
import { setSplineObjectInterpolation, subdivideSplineObjects } from './objectDetail'
import { sampleContourEdges } from '../modeling/sampleContour'
import { evaluateBezier } from '../../geometry/bezier/curves'
import { segmentControls } from '../corners/segmentGeometry'
import { assertSplineTopology, copySplineObjects } from '../topology'
import { SplineToMeshConverter } from '../../geometry/conversion/SplineToMeshConverter'
import { splineInterpolationTolerance } from '../sampling/interpolation'
import { emptyScene, newSplineLayerFromData } from '../../defaults'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'

describe('Object Subdivide / Interpolation', () => {
  it.each(['line', 'quadratic', 'cubic'] as const)('subdivides %s into exact equal-parameter pieces, retaining original anchors and unselected Objects', type => {
    let selected = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 40 }], false)
    const edge = Object.keys(selected.segments)[0]
    if (type === 'quadratic') selected.segments[edge] = { ...selected.segments[edge], type, control1: { x: 20, y: 80 } }
    if (type === 'cubic') selected = setSegmentType(selected, edge, type)
    const unrelated = createDonutSpline({ outerRadius: 30, innerRadius: 10 }), data = mergeSplineData(selected, unrelated), before = structuredClone(data)
    const result = subdivideSplineObjects(data, Object.keys(selected.subShapes), 3), contour = Object.values(selected.contours)[0], segments = result.contours[contour.id].segmentIds
    assertSplineTopology(result); expect(segments).toHaveLength(3)
    for (let part = 0; part < 3; part++) for (const t of [0, .2, .6, 1]) {
      const original = evaluateBezier(segmentControls(data, edge), (part + t) / 3), split = evaluateBezier(segmentControls(result, segments[part]), t)
      expect(split.x).toBeCloseTo(original.x, 9); expect(split.y).toBeCloseTo(original.y, 9)
    }
    for (const point of Object.values(selected.points)) expect([result.points[point.id].x, result.points[point.id].y]).toEqual([point.x, point.y])
    for (const id of Object.keys(unrelated.contours)) expect(result.contours[id]).toBe(data.contours[id])
    expect(data).toEqual(before)
  })
  it('includes closed outer/hole contours without changing Object ownership or interpolation', () => {
    const ring = createDonutSpline({ outerRadius: 40, innerRadius: 15 }), ids = Object.keys(ring.subShapes), data = setSplineObjectInterpolation(ring, ids, .1)
    const result = subdivideSplineObjects(data, ids, 2); assertSplineTopology(result)
    expect(result.subShapes).toEqual(data.subShapes)
    for (const contour of Object.values(data.contours)) {
      expect(result.contours[contour.id].closed).toBe(true)
      expect(result.contours[contour.id].pointIds).toHaveLength(contour.pointIds.length * 2)
    }
    expect(() => subdivideSplineObjects(data, [], 2)).toThrow('Select')
    for (const parts of [1, 2.5, 65]) expect(() => subdivideSplineObjects(data, ids, parts)).toThrow('2–64')
  })
  it('stores Object precision without new geometry and restores omitted legacy policy as an exact no-op when repeated', () => {
    const curve = createCircleSpline({ radius: 90 }), other = createCircleSpline({ radius: 10 }), data = mergeSplineData(curve, other), ids = Object.keys(curve.subShapes), contour = Object.keys(curve.contours)[0]
    const fine = setSplineObjectInterpolation(data, ids, .01), coarse = setSplineObjectInterpolation(fine, ids, 2)
    expect(fine.points).toBe(data.points); expect(fine.handles).toBe(data.handles); expect(fine.segments).toBe(data.segments); expect(fine.contours).toBe(data.contours)
    expect(splineToPathDefinition(fine)).toEqual(splineToPathDefinition(data))
    const count = (source: typeof data) => sampleContourEdges(source, contour).edges.reduce((sum, edge) => sum + edge.points.length, 0)
    expect(count(fine)).toBeGreaterThan(count(coarse)); expect(splineInterpolationTolerance(fine, contour, .25)).toBe(.01)
    expect(splineInterpolationTolerance(coarse, contour, .05)).toBe(.05)
    for (const id of Object.keys(other.subShapes)) expect(fine.subShapes[id]).toBe(data.subShapes[id])
    expect(setSplineObjectInterpolation(fine, ids, .01)).toBe(fine)
    const reset = setSplineObjectInterpolation(fine, ids, null); expect(reset).toEqual(data); expect(setSplineObjectInterpolation(reset, ids, null)).toBe(reset)
  })
  it('uses authored fine precision in real Mesh conversion, retains holes and cannot weaken the conversion ceiling', () => {
    const ring = createDonutSpline({ outerRadius: 90, innerRadius: 30 }), ids = Object.keys(ring.subShapes), converter = new SplineToMeshConverter()
    const original = converter.convert('ring', ring, .25), fine = converter.convert('ring', setSplineObjectInterpolation(ring, ids, .01), .25)
    expect(fine.geometry.positions.length).toBeGreaterThan(original.geometry.positions.length)
    expect(fine.boundaryRings).toHaveLength(2); expect(fine.source).not.toEqual(original.source)
    expect(converter.convert('ring', setSplineObjectInterpolation(ring, ids, 2), .25).geometry).toEqual(original.geometry)
  })
  it('round-trips and copies precision, and rejects malformed portable metadata without changing legacy scenes', () => {
    const data = createCircleSpline({ radius: 30 }), ids = Object.keys(data.subShapes), source = setSplineObjectInterpolation(data, ids, .1)
    const copy = copySplineObjects(source, ids), scene = emptyScene(); scene.layers = [newSplineLayerFromData(copy.data)]
    expect(copy.data.subShapes[copy.objectIds[0]].interpolation).toEqual({ version: 1, tolerancePx: .1 })
    expect(parseSceneJson(JSON.stringify(scene)).layers[0].spline).toEqual(copy.data)
    const invalid = structuredClone(source); invalid.subShapes[ids[0]].interpolation = { version: 1, tolerancePx: 0 }
    expect(() => assertSplineTopology(invalid)).toThrow('interpolation')
    scene.layers[0].spline = invalid; expect(() => parseSceneJson(JSON.stringify(scene))).toThrow('interpolation')
    for (const value of [0, -.1, 11, NaN]) expect(() => setSplineObjectInterpolation(data, ids, value)).toThrow('interpolation')
  })
  it('authored sampling detects collinear overshoot rather than accepting zero chord deviation', () => {
    let data = createPolylineSpline([{ x: 0, y: 0 }, { x: 10, y: 0 }], false), edge = Object.keys(data.segments)[0]
    data = setSegmentType(data, edge, 'cubic')
    for (const handle of Object.values(data.handles)) handle.x = handle.kind === 'out' ? 100 : -80
    const result = setSplineObjectInterpolation(data, Object.keys(data.subShapes), .01), samples = sampleContourEdges(result, Object.keys(result.contours)[0]).edges[0].points
    expect(Math.max(...samples.map(p => p.x))).toBeGreaterThan(20); expect(Math.min(...samples.map(p => p.x))).toBeLessThan(-10)
  })
})
