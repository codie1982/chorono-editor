// Donut = two concentric circle contours (outer + inner).
// Rendered with evenodd fill rule so the inner contour becomes a hole.

import type { BezierPath }         from '@/lib/types/path'
import type { DonutSplineParams }  from '@/lib/types/spline'
import { createCircleSpline }      from './createCircleSpline'

export function createDonutSpline(params: DonutSplineParams): { outer: BezierPath; inner: BezierPath } {
  return {
    outer: createCircleSpline({ radius: params.outerRadius }),
    inner: createCircleSpline({ radius: params.innerRadius }),
  }
}
