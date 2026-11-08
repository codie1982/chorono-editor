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
import { sampleCubicBezier } from '../bezierEasing'

/** Share the bounded easing solver with keyframes, preserving Y overshoot. */
export function sampleBezier(b: BezierTuple, xRaw: number): number {
  return sampleCubicBezier(b, xRaw)
}
