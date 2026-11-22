import { describe, expect, it } from 'vitest'
import { createCircleSpline, createDonutSpline, createPolylineSpline, createRectangleSpline, splineToPathDefinition } from '../index'
import { deleteSplineEdges } from '../topology'
import { PlanarOutlineBackend } from './PlanarOutlineBackend'
import type { OutlineRequest, OutlineSettings } from './types'
import type { SplinePathData } from '../../types/spline'
import { ringArea } from '../../geometry/planar'

const settings: OutlineSettings = { distancePx: 20, side: 'right', join: 'miter', miterLimit: 4, tolerancePx: .25 }
/** Exact source adapters, with no UI or renderer dependency. */
function request(data: SplinePathData, patch: Partial<OutlineSettings> = {}): OutlineRequest {
  return { ...settings, ...patch, inputs: [{ name: 'Source', path: splineToPathDefinition(data), fillRule: data.fillRule, indices: Object.values(data.contours).map((_, i) => i) }] }
}
const solver = new PlanarOutlineBackend()

describe('bounded planar Offset / Outline', () => {
  it('creates open left/right/both parallels at a fixed normal distance without moving/capping the source', () => {
    const data = createPolylineSpline([{ x: 10, y: 20 }, { x: 210, y: 20 }], false), before = structuredClone(data)
    const result = solver.compute(request(data, { side: 'both' }))
    expect(result.objects).toHaveLength(2)
    expect(result.objects[0].contours[0]).toEqual({ closed: false, points: [{ x: 10, y: 0 }, { x: 210, y: 0 }] })
    expect(result.objects[1].contours[0]).toEqual({ closed: false, points: [{ x: 10, y: 40 }, { x: 210, y: 40 }] })
    expect(data).toEqual(before)
  })
  it('offsets the cut circle to a parallel open arc within the declared approximation', () => {
    const circle = createCircleSpline({ radius: 100 }), arc = deleteSplineEdges(circle, [Object.keys(circle.segments)[0]])
    const result = solver.compute(request(arc)), output = result.objects[0].contours[0]
    expect(output.closed).toBe(false); expect(output.points.length).toBeGreaterThan(20)
    expect(Math.max(...output.points.map(p => Math.abs(Math.hypot(p.x, p.y) - 80)))).toBeLessThan(.25)
    expect(result.outputVertices).toBeLessThanOrEqual(8192)
  })
  it('produces exact rectangle miters, bevels and bounded round joins; miter fallback is explicit', () => {
    const data = createRectangleSpline({ width: 100, height: 80 })
    const inside = solver.compute(request(data, { side: 'inside' })).objects[0].contours[0]
    expect(inside.closed).toBe(true); expect(Math.abs(ringArea(inside.points))).toBeCloseTo(60 * 40)
    const bevel = solver.compute(request(data, { side: 'outside', join: 'bevel' })).objects[0].contours[0]
    expect(bevel.points).toHaveLength(8)
    const round = solver.compute(request(data, { side: 'outside', join: 'round' })).objects[0].contours[0]
    expect(round.points.length).toBeGreaterThan(8)
    for (const p of round.points) {
      const corner = { x: p.x < 0 ? -50 : 50, y: p.y < 0 ? -40 : 40 }
      expect(Math.hypot(p.x - corner.x, p.y - corner.y)).toBeCloseTo(20, 6)
    }
    expect(solver.compute(request(data, { side: 'outside', miterLimit: 1 })).bevelFallbacks).toBe(4)
  })
  it('preserves hole ownership and winding while inside shrinks the outer boundary and grows its hole', () => {
    const data = createDonutSpline({ outerRadius: 100, innerRadius: 40 })
    const result = solver.compute(request(data, { side: 'inside' })).objects[0].contours
    expect(result).toHaveLength(2)
    ;[80, 60].forEach((radius, i) => expect(Math.max(...result[i].points.map(p => Math.abs(Math.hypot(p.x, p.y) - radius)))).toBeLessThan(.25))
    expect(() => solver.compute(request(data, { side: 'inside', distancePx: 40, tolerancePx: 1 }))).toThrow(/ownership|boundary|nested|collaps/i)
  })
  it('rejects collapsed offsets, self contact, wrong directions, invalid values and exhausted budgets instead of returning a partial path', () => {
    const rect = createRectangleSpline({ width: 100, height: 80 })
    expect(() => solver.compute(request(rect, { side: 'inside', distancePx: 60 }))).toThrow(/collaps|revers/i)
    expect(() => solver.compute(request(rect, { side: 'left' }))).toThrow('Inside or Outside')
    expect(() => solver.compute(request(rect, { distancePx: NaN }))).toThrow('distance')
    const cross = createPolylineSpline([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }, { x: 50, y: 0 }], false)
    expect(() => solver.compute(request(cross))).toThrow(/Self-intersecting/)
    const budget = request(createCircleSpline({ radius: 100 }), { side: 'outside', distancePx: 10000, tolerancePx: .05 })
    expect(() => solver.compute(budget)).toThrow(/budget|subdivision/i)
  })
})
