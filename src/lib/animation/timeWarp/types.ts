/** Time-Warp / Multiplier / Ease Curves (BL-48).
 *
 *  Three lightweight Bezier-based remappers on the Track level — they
 *  reshape the keyframe pipeline WITHOUT touching keyframe data.
 *
 *  All three use the same shape: a single cubic-bezier defined by two
 *  control points (x1,y1) and (x2,y2) — CSS easing convention. Anchored
 *  at (0,0) → (1,1) implicitly. Easy to store, edit (existing BezierEditor
 *  works), and bake.
 *
 *  Pipeline order in evaluator (when all are set):
 *
 *      timeMs  →  resolveOutOfRange  →  localT = (t-segStart)/dur
 *               →  EASE CURVE       → warpedLocalT = ease(localT)        ← BL-48 (a)
 *               →  TIME WARP        → finalLocalT  = warp(warpedLocalT)  ← BL-48 (b)
 *               →  interpolateKeyframes(kfA, kfB, finalLocalT)
 *               →  MULTIPLIER CURVE → value *= 1 + (mult(localT) - 0.5)*amplitude  ← BL-48 (c)
 *               →  segmentModifiers (BL-46)
 *               →  trackModifiers   (BL-46)
 *               →  final
 *
 *  Why two of (a) + (b)?  In 3ds Max they're separate concepts:
 *    Ease Curve     ≈ "re-time the whole track" — a slow start curve makes
 *                     the WHOLE animation slow at the start.
 *    TimeWarp       ≈ "stretch/squeeze segments" — useful for ramping
 *                     individual sections.
 *  In v1 we treat them as two sequential warp steps; ship both, document
 *  the order, let the user decide.
 */

/** CSS cubic-bezier easing — `cubic-bezier(cx1, cy1, cx2, cy2)`. Endpoints
 *  always (0,0) and (1,1). cx1/cx2 must be in [0,1] to keep the curve
 *  monotone-in-time; cy is unconstrained (overshoot allowed). */
export interface BezierTuple {
  cx1: number
  cy1: number
  cx2: number
  cy2: number
}

/** Identity (no warp): a straight diagonal — bezier output equals input. */
export const IDENTITY_BEZIER: BezierTuple = {
  cx1: 0.33, cy1: 0.33, cx2: 0.67, cy2: 0.67,
}
