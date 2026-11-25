import { describe, expect, it } from 'vitest'
import { createRectangleSpline, createCircleSpline, createPolylineSpline, mergeSplineData } from '../index'
import { buildSplineData } from '../util/buildSplineData'
import { assertSplineTopology, divideSplineEdges } from '../topology'
import { segmentControls } from '../corners'
import { filletSpline } from './filletSpline'
import { findRoundedSplineCorners } from './roundedCorners'
import { roundSplineCorners } from './roundSplineCorners'
import type { SplinePathData } from '../../types/spline'

/** Shape-only comparison is independent of fresh IDs and closed seam rotation. */
function geometry(data: SplinePathData) {
  return Object.keys(data.segments).map(id => segmentControls(data, id).map(p => [Number(p.x.toFixed(7)), Number(p.y.toFixed(7))])).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
/** Baked native corners carry editable Bézier Corner types, not generator hints. */
function baked(radius = 1) {
  const source = createRectangleSpline({ width: 120, height: 100 })
  return { source, data: filletSpline({ data: source, pointIds: Object.keys(source.points), matrix: [1, 0, 0, 1, 0, 0], radiusPx: radius }).data }
}

describe('absolute-radius Round Corners source operation', () => {
  it.each([.1, 1, 7, 15])('replaces a baked radius %s with larger and smaller radii, preserving source/owners/sides', radius => {
    const { source, data } = baked(radius), before = structuredClone(data)
    expect(findRoundedSplineCorners(data)).toHaveLength(4)
    for (const nextRadius of [.5, 20]) {
      const output = roundSplineCorners(data, [], nextRadius), expected = roundSplineCorners(source, [], nextRadius)
      expect(geometry(output)).toEqual(geometry(expected)); assertSplineTopology(output)
      expect(Object.keys(output.contours)).toEqual(Object.keys(data.contours))
      expect(output.subShapes).toEqual(data.subShapes)
      for (const edge of Object.values(data.segments).filter(edge => edge.type === 'line')) expect(output.segments[edge.id]).toBeDefined()
    }
    expect(data).toEqual(before)
  })
  it('recognizes standard quarter-circle cubics and their exact subdivisions without a small-radius threshold', () => {
    const data = createRectangleSpline({ width: 200, height: 180, cornerMode: 'rounded', cornerRadius: 30 })
    for (const point of Object.values(data.points)) point.type = 'bezierCorner'
    const curves = Object.values(data.segments).filter(edge => edge.type === 'cubic').map(edge => edge.id)
    for (const source of [data, divideSplineEdges(data, curves, 4)]) {
      const result = roundSplineCorners(source, [], 12)
      expect(findRoundedSplineCorners(result)).toHaveLength(4)
      const expected = roundSplineCorners(createRectangleSpline({ width: 200, height: 180 }), [], 12)
      expect(geometry(result)).toEqual(geometry(expected))
    }
  })
  it('uses Corner/Bézier Corner types, skips Smooth points, and never infers corners from primitive metadata', () => {
    const data = createRectangleSpline({ width: 100, height: 80 }), points = Object.keys(data.points)
    data.points[points[0]].type = 'smooth'
    data.points[points[1]].type = 'bezier'
    const result = roundSplineCorners(data, [], 8)
    expect(result.points[points[0]]).toBe(data.points[points[0]])
    expect(result.points[points[1]]).toBe(data.points[points[1]])
    expect(Object.keys(result.segments).filter(id => !data.segments[id])).toHaveLength(4)
    expect(() => roundSplineCorners(data, [points[0]], 8)).toThrow('Corner or Bézier Corner')
    const rounded = baked().data
    for (const point of Object.values(rounded.points)) point.type = 'smooth'
    expect(() => roundSplineCorners(rounded, [], 8)).toThrow('No sharp')
    expect(() => roundSplineCorners(createCircleSpline({ radius: 40 }), [], 8)).toThrow('No sharp')
  })
  it('targets one rounded run by any of its Corner anchors, retaining unselected geometry and source IDs', () => {
    const rounded = baked(4).data, extra = createCircleSpline({ radius: 10 }), data = mergeSplineData(rounded, extra)
    const run = findRoundedSplineCorners(rounded)[0], result = roundSplineCorners(data, [run.pointIds[1]], 15)
    expect(findRoundedSplineCorners(result)).toHaveLength(4)
    const untouched = new Set(findRoundedSplineCorners(rounded).slice(1).flatMap(run => run.pointIds))
    for (const id of Array.from(untouched)) expect(result.points[id]).toBe(data.points[id])
    for (const family of ['points', 'handles', 'segments', 'contours', 'subShapes'] as const) for (const id of Object.keys(extra[family])) expect(result[family][id]).toBe(data[family][id])
    expect(result.points[run.pointIds[0]]).toBeUndefined()
  })
  it('updates both sharp and rounded convex/concave corners on open paths while preserving open endpoints', () => {
    const source = createPolylineSpline([{ x: -100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 70 }, { x: 100, y: 70 }], false)
    const contour = Object.values(source.contours)[0], old = filletSpline({ data: source, pointIds: [contour.pointIds[1]], matrix: [1, 0, 0, 1, 0, 0], radiusPx: 5 }).data
    const result = roundSplineCorners(old, [], 15), expected = roundSplineCorners(source, [], 15)
    expect(geometry(result)).toEqual(geometry(expected))
    expect(result.points[contour.pointIds[0]]).toBe(source.points[contour.pointIds[0]])
    expect(result.points[contour.pointIds.at(-1)!]).toBe(source.points[contour.pointIds.at(-1)!])
    expect(result.contours[contour.id].closed).toBe(false)
  })
  it('retains reversed hole ownership, closed seam runs and winding', () => {
    const source = buildSplineData({ kind: 'custom', name: 'Ring', fillRule: 'evenodd', contours: [
      { closed: true, anchors: [[-100, -100], [100, -100], [100, 100], [-100, 100]].map(([x, y]) => ({ x, y, type: 'corner' })) },
      { closed: true, anchors: [[-40, -40], [-40, 40], [40, 40], [40, -40]].map(([x, y]) => ({ x, y, type: 'bezierCorner' })) },
    ] })
    const old = roundSplineCorners(source, [], 1), result = roundSplineCorners(old, [], 10)
    expect(geometry(result)).toEqual(geometry(roundSplineCorners(source, [], 10)))
    expect(result.fillRule).toBe('evenodd'); expect(result.subShapes).toEqual(old.subShapes)
  })
  it('rejects impossible radii, locked records, non-circular G1 curves and invalid targets without changing source', () => {
    const { data } = baked(), before = structuredClone(data)
    expect(() => roundSplineCorners(data, [], 60)).toThrow(/overlap|fit/i)
    expect(() => roundSplineCorners(data, ['missing'], 10)).toThrow('existing Corner')
    expect(data).toEqual(before)
    const locked = structuredClone(data); Object.values(locked.points)[0].locked = true
    expect(() => roundSplineCorners(locked, [], 10)).toThrow(/Unlock|locked/)
    const custom = structuredClone(data)
    for (const handle of Object.values(custom.handles)) handle.x += .1
    expect(findRoundedSplineCorners(custom)).toHaveLength(0)
  })
})
