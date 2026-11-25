import { describe, expect, it } from 'vitest'
import { SplineBandBackend } from './SplineBandBackend'
import { bandSelection } from './selection'
import { bandDashIntervals } from './dashes'
import { defaultBandSettings, type SplineBandSettings } from './types'
import { createPolylineSpline, createRectangleSpline, createDonutSpline, createCircleSpline, mergeSplineData } from '../index'
import { ringArea, ringContains } from '../../geometry/planar'
import type { SplinePathData } from '../../types/spline'
import { applySplineBand } from './applyBand'
import { assertSplineTopology } from '../topology'
const backend = new SplineBandBackend()
function compute(data: SplinePathData, patch: Partial<SplineBandSettings> = {}, ids = Object.keys(data.subShapes), mode: 'edge' | 'object' = 'object') {
  return backend.compute({ data, chains: bandSelection(data, mode, ids), settings: { ...defaultBandSettings, ...patch } })
}
function area(result: ReturnType<typeof compute>) { return result.objects.reduce((n, o) => n + Math.abs(o.contours.reduce((sum, c) => sum + ringArea(c.points), 0)), 0) }
function box(result: ReturnType<typeof compute>) { const ps = result.objects.flatMap(o => o.contours.flatMap(c => c.points)); return [Math.min(...ps.map(p => p.x)), Math.min(...ps.map(p => p.y)), Math.max(...ps.map(p => p.x)), Math.max(...ps.map(p => p.y))] }
const line = () => createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false)
describe('source-local real Outline bands', () => {
  it('constructs exact butt/square bounds and tolerance-bounded round cap area without source mutation', () => {
    const data = line(), before = structuredClone(data)
    expect(box(compute(data))).toEqual([0, -5, 100, 5]); expect(area(compute(data))).toBeCloseTo(1000)
    expect(box(compute(data, { cap: 'square' }))).toEqual([-5, -5, 105, 5]); expect(area(compute(data, { cap: 'square' }))).toBeCloseTo(1100)
    expect(area(compute(data, { cap: 'round', tolerancePx: .05 }))).toBeCloseTo(1000 + Math.PI * 25, 0)
    expect(data).toEqual(before)
    for (const c of compute(data).objects[0].contours) c.points.forEach((p, i) => { const q = c.points[(i + 1) % c.points.length]; expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThanOrEqual(20.000001) })
  })
  it('preserves rectangle holes and exact inside/center/outside material bounds', () => {
    const data = createRectangleSpline({ width: 100, height: 80 })
    expect(box(compute(data, { alignment: 'inside' }))).toEqual([-50, -40, 50, 40])
    expect(box(compute(data))).toEqual([-55, -45, 55, 45])
    expect(box(compute(data, { alignment: 'outside' }))).toEqual([-60, -50, 60, 50])
    expect(area(compute(data, { alignment: 'inside' }))).toBeCloseTo(8000 - 80 * 60)
    expect(area(compute(data))).toBeCloseTo(110 * 90 - 90 * 70)
    expect(area(compute(data, { alignment: 'outside' }))).toBeCloseTo(120 * 100 - 8000)
    expect(compute(data).objects[0].contours).toHaveLength(2)
  })
  it('offsets a hole toward the material on Inside, with evenodd ownership preserved', () => {
    const data = createDonutSpline({ outerRadius: 60, innerRadius: 25 })
    const result = compute(data, { alignment: 'inside' }), contours = result.objects[0].contours
    expect(contours).toHaveLength(4)
    expect(Math.max(...contours.flatMap(c => c.points.map(p => Math.hypot(p.x, p.y))))).toBeLessThan(60.1)
    expect(Math.min(...contours.flatMap(c => c.points.map(p => Math.hypot(p.x, p.y))))).toBeGreaterThan(24.9)
    expect(contours.filter(c => ringContains(c.points, { x: 0, y: 0 }))).toHaveLength(4)
  })
  it('supports wide bands consuming the inner hole instead of reversing an inset', () => {
    const data = createRectangleSpline({ width: 20, height: 20 }), result = compute(data, { widthPx: 50 })
    expect(result.objects[0].contours).toHaveLength(1); expect(area(result)).toBeCloseTo(70 * 70)
  })
  it('resolves concave area bands consistently under reversed source winding', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 }]
    for (const p of [points, [...points].reverse()]) {
      const data = createPolylineSpline(p, true)
      expect(area(compute(data))).toBeCloseTo(4000)
      expect(area(compute(data, { alignment: 'inside' }))).toBeCloseTo(3600)
      expect(area(compute(data, { alignment: 'outside' }))).toBeCloseTo(4400)
    }
  })
  it('uses explicit miter/bevel/round joins and reports miter-limit fallback', () => {
    const data = createRectangleSpline({ width: 100, height: 80 })
    const bevel = compute(data, { join: 'bevel' }), fallback = compute(data, { miterLimit: 1 })
    expect(fallback.objects).toEqual(bevel.objects); expect(fallback.bevelFallbacks).toBe(4)
    expect(area(bevel)).toBeLessThan(area(compute(data)))
    expect(area(compute(data, { join: 'round' }))).toBeGreaterThan(area(bevel))
  })
  it('uses arc-distance dashes, odd repetition and signed offsets; zero gaps stay continuous', () => {
    expect(bandDashIntervals(30, false, true, [5], 0).map(i => [i.from, i.to])).toEqual([[0, 5], [10, 15], [20, 25], [30, 30]])
    expect(bandDashIntervals(30, false, true, [5, 5], -3)).toEqual(bandDashIntervals(30, false, true, [5, 5], 7))
    expect(bandDashIntervals(30, false, true, [5, 0], 0)).toEqual([{ from: 0, to: 30, closed: false }])
    expect(area(compute(line(), { dashEnabled: true, dashArray: [10, 10] }))).toBeCloseTo(500)
  })
  it('stitches a visible closed seam and supports round dots as real closed contours', () => {
    const intervals = bandDashIntervals(100, true, true, [30, 10], 10)
    expect(intervals[0]).toEqual({ from: -30, to: 20, closed: false })
    const result = compute(line(), { dashEnabled: true, dashArray: [0, 20], cap: 'round' })
    expect(result.objects[0].contours).toHaveLength(6)
    expect(result.objects[0].contours.every(c => c.closed)).toBe(true)
  })
  it('pins Bézier geometry and samples more densely as width/accuracy demand grows', () => {
    const data = createCircleSpline({ radius: 100 }), result = compute(data, { widthPx: 20 })
    for (const c of result.objects[0].contours) for (const p of c.points) expect(Math.min(Math.abs(Math.hypot(p.x, p.y) - 90), Math.abs(Math.hypot(p.x, p.y) - 110))).toBeLessThan(.25)
    expect(result.inputVertices).toBeGreaterThan(20)
    expect(compute(data, { widthPx: 20, tolerancePx: .05 }).inputVertices).toBeGreaterThan(result.inputVertices)
  })
  it('extracts only selected chains, including a wrapped seam, without promoting other edges', () => {
    const data = createRectangleSpline({ width: 100, height: 80 }), edges = Object.keys(data.segments)
    const chains = bandSelection(data, 'edge', [edges[3], edges[0]])
    expect(chains).toHaveLength(1); expect(chains[0].edgeIds).toEqual([edges[3], edges[0]]); expect(chains[0].closed).toBe(false)
    const result = compute(data, {}, [edges[0]], 'edge')
    expect(area(result)).toBeCloseTo(1000)
    expect(() => compute(data, { alignment: 'inside' }, [edges[0]], 'edge')).toThrow(/complete closed/)
    const applied = applySplineBand(data, bandSelection(data, 'edge', [edges[0]]), result, false)
    assertSplineTopology(applied.data); expect(applied.data.segments[edges[0]]).toBeUndefined()
    expect(applied.data.segments[edges[1]]).toEqual(data.segments[edges[1]])
  })
  it('keeps unrelated Objects and offers same-spline Keep source without changing paint', () => {
    const a = line(), b = createRectangleSpline({ width: 20, height: 20 }), data = mergeSplineData(a, b), ids = Object.keys(a.subShapes)
    const result = compute(data, {}, ids), chains = bandSelection(data, 'object', ids)
    for (const keep of [true, false]) {
      const applied = applySplineBand(data, chains, result, keep)
      assertSplineTopology(applied.data)
      expect(applied.data.subShapes[Object.keys(b.subShapes)[0]]).toEqual(Object.values(b.subShapes)[0])
      expect(applied.data.subShapes[applied.ids[0]].paint).toEqual({ version: 1, source: 'stroke' })
      expect(Object.keys(applied.data.subShapes)).toHaveLength(keep ? 3 : 2)
    }
  })
  it('rejects no selection, bad parameters, reversed cusp and over-budget dashes', () => {
    expect(() => bandSelection(line(), 'object', [])).toThrow(/Select/)
    expect(() => compute(line(), { widthPx: NaN })).toThrow(/width/)
    expect(() => compute(line(), { dashEnabled: true, dashArray: [.001, .001] })).toThrow(/budget|many/)
    const cusp = createPolylineSpline([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 0 }], false)
    expect(() => compute(cusp)).toThrow(/cusp/)
  })
})
