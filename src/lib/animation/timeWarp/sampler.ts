/** Cubic-bezier sampler for time-warp / ease-curve / multiplier-curve
 *  (BL-48). Same math as evaluator.ts's bezierEasing but lives here so
 *  the animation/timeWarp module is self-contained (easier to bake or
 *  port to native runtime later).
 *
 *  Bezier passes through (0,0) and (1,1). For input x we Newton-Raphson
 *  to find parameter t such that bezierX(t) = x, then return bezierY(t).
 *  Clamps x to [0,1] — out-of-range inputs are not meaningful here.
 */

import type { BezierTuple } from './types'

function cubicBezierComponent(t: number, a: number, b: number): number {
  // B(t) = 3(1-t)²t·a + 3(1-t)t²·b + t³  (P0=0, P3=1)
  const it = 1 - t
  return 3 * it * it * t * a + 3 * it * t * t * b + t * t * t
}

function cubicBezierDerivative(t: number, a: number, b: number): number {
  const it = 1 - t
  return 3 * it * it * a + 6 * it * t * (b - a) + 3 * t * t * (1 - b)
}

/** Sample the bezier at normalized input x ∈ [0,1] → output y. Identity
 *  curve returns x. Newton-Raphson iterates ≤ 8 times — typical
 *  convergence after 3-4 iterations for well-shaped CSS curves. */
export function sampleBezier(b: BezierTuple, xRaw: number): number {
  const x = Math.max(0, Math.min(1, xRaw))
  // Fast paths for endpoints
  if (x === 0) return 0
  if (x === 1) return 1
  let t = x
  for (let i = 0; i < 8; i++) {
    const fx = cubicBezierComponent(t, b.cx1, b.cx2) - x
    if (Math.abs(fx) < 1e-5) break
    const dfx = cubicBezierDerivative(t, b.cx1, b.cx2)
    if (Math.abs(dfx) < 1e-6) break
    t -= fx / dfx
    if (t < 0) t = 0
    else if (t > 1) t = 1
  }
  return cubicBezierComponent(t, b.cy1, b.cy2)
}
