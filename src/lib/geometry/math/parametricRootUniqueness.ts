import type { Vec2 } from '../CoordinateSystem'
import { add, neg, scale, absMax, type IntervalBox2D } from './intervals'

/** Inverse-midpoint Jacobian contraction test shared by ordinary polynomial
 * and normal-offset curve intersections. Derivative boxes enclose each curve
 * over its own normalized parameter interval; midpoint vectors use that same
 * interval. ||I−Jmid⁻¹J(box)||∞ < .9 rules out multiple roots in the rectangle.
 * Singular/uncertain boxes return false and require subdivision/refusal. Pure,
 * floating-point enclosures (not formal directed-rounding certification). */
export function parametricRootIsUnique(da: IntervalBox2D, db: IntervalBox2D, u: Vec2, v: Vec2): boolean {
  const det = u.y * v.x - u.x * v.y
  if (Math.abs(det) < 1e-18) return false
  const i00 = -v.y / det, i01 = v.x / det, i10 = -u.y / det, i11 = u.x / det
  const e11 = add([1, 1], neg(add(scale(da.x, i00), scale(da.y, i01)))), e12 = add(scale(db.x, i00), scale(db.y, i01))
  const e21 = neg(add(scale(da.x, i10), scale(da.y, i11))), e22 = add([1, 1], add(scale(db.x, i10), scale(db.y, i11)))
  return Math.max(absMax(e11) + absMax(e12), absMax(e21) + absMax(e22)) < .9
}
