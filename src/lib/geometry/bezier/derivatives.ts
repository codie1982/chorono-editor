import type { Vec2 } from '../CoordinateSystem'
import { evaluateBezier } from './curves'

/** Derivative control polygon in the same coordinate space. A constant curve
 * differentiates to one zero vector; evaluation accepts that degree-zero case. */
export function bezierDerivative(controls: readonly Vec2[]): Vec2[] {
  const degree = controls.length - 1
  return degree ? controls.slice(1).map((p, i) => ({ x: degree * (p.x - controls[i].x), y: degree * (p.y - controls[i].y) })) : [{ x: 0, y: 0 }]
}

/** Position plus first/second derivatives with respect to t in [0,1]. Pure,
 * dimensionally px, px/t and px/t²; no normalization or cusp fallback. */
export function bezierJet(controls: readonly Vec2[], t: number) {
  const derivative = bezierDerivative(controls)
  return { point: evaluateBezier(controls, t), first: evaluateBezier(derivative, t), second: evaluateBezier(bezierDerivative(derivative), t) }
}
