import { describe, expect, it } from 'vitest'
import { createRectangleSpline, createCircleSpline, createDonutSpline, createPolylineSpline, mergeSplineData, translateSplineData, computeSplineBounds } from '../../index'
import { divideSplineEdges, assertSplineTopology } from '../../topology'
import { segmentControls } from '../../corners'
import { evaluateBezier } from '../../../geometry/bezier/curves'
import { distToSegmentSq } from '../../../geometry/segmentDistance'
import { resampleSplineObjects, zigZagSplineObjects, puckerBloatSplineObjects, repeatSplineObjects, type SplineRepeatOptions } from './index'
import { subShapeData } from '../../geometry/elementPaths'

const ids = (data: Parameters<typeof resampleSplineObjects>[0]) => Object.keys(data.subShapes)
const repeatOptions: SplineRepeatOptions = { count: 3, mode: 'linear', stepX: 120, stepY: 0, rotationStep: 0, scaleStep: 1, radius: 100, startAngle: 0, sweepAngle: 360, orientToAngle: false }
const puckerOptions = { amountPct: 30, centerMode: 'object' as const, centerX: 0, centerY: 0 }

describe('Phase 1 shared source-local geometry', () => {
  it('resamples by length, redistributes smooth subdivisions and pins sharp corners/open endpoints', () => {
    const line = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false), contour = Object.values(line.contours)[0]
    const result = resampleSplineObjects(line, ids(line), 7, .25), points = result.contours[contour.id].pointIds.map(id => result.points[id])
    expect(points).toHaveLength(16); expect(points[0]).toBe(line.points[contour.pointIds[0]]); expect(points.at(-1)).toBe(line.points[contour.pointIds[1]])
    for (let i = 1; i < points.length; i++) expect(points[i].x - points[i - 1].x).toBeCloseTo(100 / 15)
    const bent = createPolylineSpline([{ x: 0, y: 0 }, { x: 43, y: 0 }, { x: 43, y: 40 }], false), corner = Object.values(bent.contours)[0].pointIds[1]
    expect(resampleSplineObjects(bent, ids(bent), 20, .25).points[corner]).toBe(bent.points[corner])
    const circle = createCircleSpline({ radius: 40 }), dense = divideSplineEdges(circle, Object.keys(circle.segments), 32), sampled = resampleSplineObjects(dense, ids(dense), 20, .25)
    expect(Object.keys(sampled.points).length).toBeLessThan(Object.keys(dense.points).length)
    expect(Object.values(sampled.segments).every(edge => edge.type === 'line')).toBe(true); expect(sampled.handles).toEqual({})
  })
  it('bounds the complete curved output error independently of coarse spacing', () => {
    const source = createCircleSpline({ radius: 40 }), result = resampleSplineObjects(source, ids(source), 10000, .1), lines = Object.keys(result.segments).map(id => segmentControls(result, id))
    for (const id of Object.keys(source.segments)) for (let k = 0; k <= 200; k++) {
      const point = evaluateBezier(segmentControls(source, id), k / 200)
      const error = Math.sqrt(Math.min(...lines.map(([a, b]) => distToSegmentSq(point.x, point.y, a.x, a.y, b.x, b.y).dSq)))
      expect(error).toBeLessThanOrEqual(.100001)
    }
  })
  it('retains selected hole ownership, closed flags, unselected geometry and source snapshots', () => {
    const ring = createDonutSpline({ outerRadius: 50, innerRadius: 20 }), other = translateSplineData(createRectangleSpline({ width: 20, height: 10 }), 200, 0), source = mergeSplineData(ring, other), before = structuredClone(source)
    const result = resampleSplineObjects(source, ids(ring), 12, .2)
    expect(Object.keys(result.contours)).toEqual(Object.keys(source.contours)); expect(result.subShapes[ids(ring)[0]].contourIds).toEqual(Object.keys(ring.contours))
    expect(Object.values(result.contours).every(contour => contour.closed)).toBe(true)
    for (const family of ['points', 'handles', 'segments', 'contours', 'subShapes'] as const) for (const id of Object.keys(other[family])) expect(result[family][id]).toBe(source[family][id])
    expect(source).toEqual(before)
  })
  it('makes sharp alternating Zig Zag peaks with pinned endpoints/corners and a true zero identity', () => {
    const line = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false), before = structuredClone(line)
    const result = zigZagSplineObjects(line, ids(line), 5, 20), contour = Object.values(result.contours)[0]
    expect(contour.pointIds.map(id => result.points[id].y)).toEqual([0, 5, -5, 5, -5, 0])
    expect(zigZagSplineObjects(line, ids(line), 0, 20)).toBe(line); expect(line).toEqual(before)
    const rect = createRectangleSpline({ width: 100, height: 80 }), zig = zigZagSplineObjects(rect, ids(rect), 5, 20)
    for (const id of Object.keys(rect.points)) expect(zig.points[id]).toBe(rect.points[id])
  })
  it('bloats/puckers about each Object center and maps curve controls without changing connectivity', () => {
    const source = createDonutSpline({ outerRadius: 40, innerRadius: 15 }), before = structuredClone(source)
    const bigger = puckerBloatSplineObjects(source, ids(source), puckerOptions), smaller = puckerBloatSplineObjects(source, ids(source), { ...puckerOptions, amountPct: -30 })
    expect(computeSplineBounds(bigger).width).toBeGreaterThan(computeSplineBounds(source).width)
    expect(computeSplineBounds(smaller).width).toBeLessThan(computeSplineBounds(source).width)
    expect(bigger.contours).toEqual(source.contours); expect(Object.keys(bigger.points)).toEqual(Object.keys(source.points))
    expect(Object.keys(bigger.handles)).toEqual(Object.keys(source.handles)); expect(Object.values(bigger.handles).some(handle => handle.x !== source.handles[handle.id].x || handle.y !== source.handles[handle.id].y)).toBe(true)
    expect(bigger.fillRule).toBe(source.fillRule); expect(puckerBloatSplineObjects(source, ids(source), { ...puckerOptions, amountPct: 0 })).toBe(source)
    expect(source).toEqual(before); assertSplineTopology(bigger)
    const other = translateSplineData(createRectangleSpline({ width: 20, height: 10 }), 250, 0), combined = mergeSplineData(source, other)
    const scoped = puckerBloatSplineObjects(combined, ids(source), puckerOptions)
    for (const id of Object.keys(other.points)) expect(scoped.points[id]).toBe(combined.points[id])
  })
  it('uses the explicit custom center and keeps a point located on it fixed', () => {
    const source = createPolylineSpline([{ x: 10, y: 20 }, { x: 60, y: 20 }, { x: 90, y: 30 }], false), first = Object.values(source.points)[0]
    const result = puckerBloatSplineObjects(source, ids(source), { amountPct: 50, centerMode: 'custom', centerX: 10, centerY: 20 })
    expect(result.points[first.id].x).toBe(first.x); expect(result.points[first.id].y).toBe(first.y)
    expect(Object.values(result.points).at(-1)!.x).toBeGreaterThan(90)
  })
  it('copies one motif linearly with independent Object/contour/point IDs and holes', () => {
    const source = createDonutSpline({ outerRadius: 40, innerRadius: 15 }), before = structuredClone(source), result = repeatSplineObjects(source, ids(source), repeatOptions)
    expect(Object.keys(result.subShapes)).toHaveLength(3); expect(Object.keys(result.contours)).toHaveLength(6)
    expect(new Set(Object.values(result.subShapes).flatMap(object => object.contourIds)).size).toBe(6)
    const centers = Object.keys(result.subShapes).map(id => { const bounds = computeSplineBounds(subShapeData(result, id)); return bounds.x + bounds.width / 2 })
    expect(centers).toEqual([0, 120, 240])
    for (const id of Object.keys(source.points)) expect(result.points[id]).toBe(source.points[id])
    expect(repeatSplineObjects(source, ids(source), { ...repeatOptions, count: 1 })).toBe(source); expect(source).toEqual(before)
  })
  it('distributes a full polar sweep without duplicating its first instance', () => {
    const source = createRectangleSpline({ width: 20, height: 10 }), result = repeatSplineObjects(source, ids(source), { ...repeatOptions, mode: 'polar', count: 4 })
    const centers = Object.keys(result.subShapes).map(id => { const b = computeSplineBounds(subShapeData(result, id)); return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)].map(n => n || 0) })
    expect(centers).toEqual([[0, -100], [100, 0], [0, 100], [-100, 0]])
  })
  it('refuses unsafe/oversized/locked changes without changing source', () => {
    const source = createRectangleSpline({ width: 100, height: 80 }), before = structuredClone(source)
    expect(() => resampleSplineObjects(source, ids(source), .001, .25)).toThrow('spacing')
    const large = createRectangleSpline({ width: 500, height: 500 })
    expect(() => resampleSplineObjects(large, ids(large), .1, .25)).toThrow(/budget|complex/i)
    expect(() => repeatSplineObjects(source, ids(source), { ...repeatOptions, count: 2.5 })).toThrow('Invalid')
    expect(() => repeatSplineObjects(source, ids(source), { ...repeatOptions, count: 32, scaleStep: .1 })).toThrow(/degenerate/)
    expect(source).toEqual(before)
    const locked = structuredClone(source); Object.values(locked.points)[0].locked = true
    expect(() => puckerBloatSplineObjects(locked, ids(locked), puckerOptions)).toThrow('locked')
    expect(() => repeatSplineObjects(locked, ids(locked), { ...repeatOptions, mode: 'polar' })).toThrow('locked')
  })
})
