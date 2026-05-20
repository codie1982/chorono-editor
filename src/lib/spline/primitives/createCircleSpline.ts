// ── Circle Spline Primitive ───────────────────────────────────────────────────
//
// Generates a BezierPath that approximates a circle using four cubic bezier
// curves — the standard "kappa" construction (κ ≈ 0.5523).
//
// Anchors at 12, 3, 6, 9 o'clock; handles are tangent to the circle at each.
// Center is (0, 0) in layer-local coordinates.

import type { BezierPath } from '@/lib/types/path'
import type { CircleSplineParams } from '@/lib/types/spline'

const KAPPA = 0.5523

export function createCircleSpline(params: CircleSplineParams): BezierPath {
  const r = params.radius
  const k = r * KAPPA

  return {
    closed: true,
    anchors: [
      // 12 o'clock (top)
      { x:  0, y: -r, outX:  k, outY: -r, inX: -k, inY: -r, pointType: 'mirror' },
      // 3 o'clock (right)
      { x:  r, y:  0, outX:  r, outY:  k, inX:  r, inY: -k, pointType: 'mirror' },
      // 6 o'clock (bottom)
      { x:  0, y:  r, outX: -k, outY:  r, inX:  k, inY:  r, pointType: 'mirror' },
      // 9 o'clock (left)
      { x: -r, y:  0, outX: -r, outY: -k, inX: -r, inY:  k, pointType: 'mirror' },
    ],
  }
}
