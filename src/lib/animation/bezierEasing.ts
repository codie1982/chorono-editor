import type { BezierTuple } from './timeWarp/types'

export function bezierComponent(t: number, a: number, b: number): number {
  const u = 1 - t
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
}

/** Monotone CSS Bezier X inversion. Newton steps stay inside a bracket;
 * near-flat derivatives fall back to bisection instead of escaping the curve. */
export function solveBezierParameter(cx1: number, cx2: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  let lo = 0, hi = 1, t = x
  for (let i = 0; i < 40; i++) {
    const value = bezierComponent(t, cx1, cx2)
    const error = value - x
    if (Math.abs(error) < 1e-12) return t
    if (error > 0) hi = t
    else lo = t
    const u = 1 - t
    const derivative = 3 * u * u * cx1 + 6 * u * t * (cx2 - cx1) + 3 * t * t * (1 - cx2)
    const candidate = Math.abs(derivative) > 1e-8 ? t - error / derivative : NaN
    t = candidate > lo && candidate < hi ? candidate : (lo + hi) / 2
  }
  return t
}

/** Y controls remain unconstrained: legitimate back/bounce overshoot survives. */
export function sampleCubicBezier(bezier: BezierTuple, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  return bezierComponent(solveBezierParameter(bezier.cx1, bezier.cx2, x), bezier.cy1, bezier.cy2)
}
