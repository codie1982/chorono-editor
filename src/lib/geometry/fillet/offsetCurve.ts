import type { Vec2 } from '../CoordinateSystem'
import { bezierDerivative, bezierJet } from '../bezier/derivatives'
import { add, neg, scale, multiply, absMax, type Range, type IntervalBox2D as Box } from '../math/intervals'
import { parametricRootIsUnique } from '../math/parametricRootUniqueness'

export type { Range, IntervalBox2D as Box } from '../math/intervals'
export { add, neg, scale, multiply } from '../math/intervals'
/** Division requires a strictly positive denominator interval. */
const divide = (a: Range, positive: Range): Range => multiply(a, [1 / positive[1], 1 / positive[0]])
/** Distance from an interval to zero, including a contained zero. */
const absMin = (a: Range) => a[0] <= 0 && a[1] >= 0 ? 0 : Math.min(Math.abs(a[0]), Math.abs(a[1]))
/** Control hull bounds contain every polynomial point; derivatives share this
 * property. No flattening/sampled-root assumption enters the candidate search.
 * https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/bezier-construct.html */
function hull(points: readonly Vec2[]): Box { return { x: [Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.x))], y: [Math.min(...points.map(p => p.y)), Math.max(...points.map(p => p.y))] } }

/** Offset point C=P+sR*J(P')/|P'| and derivative. Signed R selects the corner's
 * turn side. Reject singular/cusp parameters instead of inventing a normal. */
export function offsetJet(controls: readonly Vec2[], t: number, signedRadius: number) {
  const { point, first: d, second: dd } = bezierJet(controls, t), speed = Math.hypot(d.x, d.y)
  if (speed < 1e-10) throw new Error('Fillet requires regular edges without zero tangents or cusps.')
  const dot = d.x * dd.x + d.y * dd.y, k = signedRadius / speed
  return { point: { x: point.x - k * d.y, y: point.y + k * d.x },
    first: { x: d.x + signedRadius * (-dd.y / speed + d.y * dot / speed ** 3), y: d.y + signedRadius * (dd.x / speed - d.x * dot / speed ** 3) }, tangent: { x: d.x / speed, y: d.y / speed } }
}

/** Conservative floating-point enclosures of a normal-offset interval and its
 * local-parameter derivative. Velocity hulls containing zero use the complete
 * radius disk; derivative uniqueness is then unavailable and forces subdivision.
 * This bounds curved roots missed by an ordinary fixed-step line intersection.
 * Arithmetic has a small geometric padding at box comparison, not formal IEEE
 * directed rounding; accepted roots are independently checked numerically. */
export function offsetBounds(controls: readonly Vec2[], signedRadius: number): { box: Box; derivative?: Box } {
  const p = hull(controls), d = hull(bezierDerivative(controls)), dd = hull(bezierDerivative(bezierDerivative(controls)))
  const speed: Range = [Math.hypot(absMin(d.x), absMin(d.y)), Math.hypot(absMax(d.x), absMax(d.y))]
  if (speed[0] < 1e-14) { const r = Math.abs(signedRadius); return { box: { x: [p.x[0] - r, p.x[1] + r], y: [p.y[0] - r, p.y[1] + r] } } }
  const box = { x: add(p.x, scale(divide(neg(d.y), speed), signedRadius)), y: add(p.y, scale(divide(d.x, speed), signedRadius)) }
  const dot = add(multiply(d.x, dd.x), multiply(d.y, dd.y)), cube: Range = [speed[0] ** 3, speed[1] ** 3]
  const derivative = { x: add(d.x, scale(add(divide(neg(dd.y), speed), divide(multiply(d.y, dot), cube)), signedRadius)),
    y: add(d.y, scale(add(divide(dd.x, speed), neg(divide(multiply(d.x, dot), cube))), signedRadius)) }
  return { box, derivative }
}

/** Inverse-midpoint Jacobian contraction bound: ||I−Jmid⁻¹J(box)||∞ < 0.9
 * rules out two distinct roots in this small regular parameter rectangle.
 * Matrix columns correspond to the first offset and minus the second offset. */
export function uniqueOffsetRoot(a: readonly Vec2[], b: readonly Vec2[], radius: number): boolean {
  const da = offsetBounds(a, radius).derivative, db = offsetBounds(b, radius).derivative
  if (!da || !db) return false
  return parametricRootIsUnique(da, db, offsetJet(a, .5, radius).first, offsetJet(b, .5, radius).first)
}
