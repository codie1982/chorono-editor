// ── computeSplineBounds ───────────────────────────────────────────────────────
//
// Tight axis-aligned bounding box of the rendered spline in layer-local coords,
// or in the optional matrix's output space. Solves actual quadratic/cubic curve
// extrema; control handles themselves are editor controls, not visible geometry.
//
// Returns a zero box for empty splines.

import type { SplinePathData } from '@/lib/types/spline'
import type { Matrix2D } from '@/lib/geometry/Matrix2D'
import { computePathBounds } from '@/lib/geometry/computePathBounds'
import { splineToPathDefinition } from '../splineToPath'

export interface SplineBounds {
  x: number
  y: number
  width: number
  height: number
}

export function computeSplineBounds(data: SplinePathData, matrix?: Matrix2D): SplineBounds {
  return computePathBounds(splineToPathDefinition(data), matrix)
}
