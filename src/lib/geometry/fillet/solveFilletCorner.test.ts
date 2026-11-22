import { describe, expect, it } from 'vitest'
import { solveFilletCorner } from './solveFilletCorner'
import { evaluateBezier } from '../bezier/curves'
import { bezierJet } from '../bezier/derivatives'
import { findOffsetRoots } from './findOffsetRoots'
import { circularCubicError } from '../bezier/circularArc'
import type { Vec2 } from '../CoordinateSystem'

/** Independent dense radius and oriented G1 assertions over emitted cubics. */
function verify(a: Vec2[], b: Vec2[], radius: number) {
  const result = solveFilletCorner(a, b, radius), start = evaluateBezier(a, result.incoming), end = evaluateBezier(b, result.outgoing)
  expect(Math.hypot(start.x - result.center.x, start.y - result.center.y)).toBeCloseTo(radius, 4)
  expect(Math.hypot(end.x - result.center.x, end.y - result.center.y)).toBeCloseTo(radius, 4)
  for (const curve of result.curves) for (let i = 0; i <= 100; i++) {
    const p = evaluateBezier(curve, i / 100)
    expect(Math.abs(Math.hypot(p.x - result.center.x, p.y - result.center.y) - radius)).toBeLessThan(.0011)
  }
  for (const [source, t, arc, arcT] of [[a, result.incoming, result.curves[0], 0], [b, result.outgoing, result.curves.at(-1)!, 1]] as const) {
    const u = bezierJet(source, t).first, v = bezierJet(arc, arcT).first
    expect(u.x * v.x + u.y * v.y).toBeGreaterThan(0)
    expect(Math.abs(u.x * v.y - u.y * v.x) / Math.hypot(u.x, u.y) / Math.hypot(v.x, v.y)).toBeLessThan(1e-4)
  }
  expect(result.radialErrorBoundPx).toBeLessThanOrEqual(.001); return result
}

describe('radius/tangent Fillet solver', () => {
  it.each([1, -1])('solves both oriented 90° line corners analytically (%s)', side => {
    const r = verify([{ x: -100, y: 0 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: side * 100 }], 12)
    expect(r.incoming).toBeCloseTo(.88, 8); expect(r.outgoing).toBeCloseTo(.12, 8)
    expect(r.center.x).toBeCloseTo(-12, 8); expect(r.center.y).toBeCloseTo(side * 12, 8)
  })
  it('solves line–cubic and cubic–cubic normal offsets without flattening source curves', () => {
    const a = [{ x: -100, y: -30 }, { x: -70, y: -20 }, { x: -30, y: 0 }, { x: 0, y: 0 }]
    const b = [{ x: 0, y: 0 }, { x: 0, y: 30 }, { x: 20, y: 70 }, { x: 30, y: 100 }]
    verify([a[0], a[3]], b, 10); verify(a, b, 10)
    verify([{ x: -100, y: 0 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 30, y: 100 }], 9)
  })
  it('rejects already-smooth, reversing, degenerate and oversized-radius corners', () => {
    const a = [{ x: -100, y: 0 }, { x: 0, y: 0 }]
    expect(() => solveFilletCorner(a, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 10)).toThrow('already tangent')
    expect(() => solveFilletCorner(a, [{ x: 0, y: 0 }, { x: -100, y: 0 }], 10)).toThrow('reversing')
    expect(() => solveFilletCorner(a, [{ x: 0, y: 0 }, { x: 0, y: 100 }], 101)).toThrow('does not fit')
    expect(() => solveFilletCorner(a, [{ x: 0, y: 0 }, { x: 0, y: 0 }], 10)).toThrow('zero tangents')
  })
  it('refuses multiple positive-radius solutions instead of choosing a Newton seed', () => {
    expect(() => solveFilletCorner([{ x: -300, y: 0 }, { x: 0, y: 0 }],
      [{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: -250, y: -200 }, { x: -150, y: 100 }], 8)).toThrow(/multiple|ambiguous|singular/)
  })
  it('bounds circle approximation even at large radii', () => {
    verify([{ x: -100000, y: 0 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 100000 }], 10000)
    expect(circularCubicError(Math.PI / 2)).toBeGreaterThan(circularCubicError(Math.PI / 4))
  })
  it('returns every distinct intersection for an explicitly ambiguous offset pair', () => {
    // At radius zero these curves intersect twice: y(t)=3t(1−t) against y=.5.
    const roots = findOffsetRoots([{ x: 0, y: .5 }, { x: 1, y: .5 }], [{ x: 0, y: 0 }, { x: 1 / 3, y: 1 }, { x: 2 / 3, y: 1 }, { x: 1, y: 0 }], 0)
    expect(roots).toHaveLength(2)
  })
})
