// ── Spline Primitive Factory ──────────────────────────────────────────────────
//
// Dispatches a (kind, params) request to the matching granular generator and
// returns a complete SplinePathData (one SubShape). Returns null for
// not-yet-implemented kinds (spiral/helix/egg/textOutline/freehand).

import type {
  SplinePathData, SplinePrimitiveKind, SplineGeneratorParams,
  CircleSplineParams, LineSplineParams, RectSplineParams, EllipseSplineParams,
  ArcSplineParams, DonutSplineParams, NGonSplineParams, StarSplineParams,
} from '@/lib/types/spline'
import {
  createCircleSpline, createLineSpline, createRectangleSpline, createEllipseSpline,
  createArcSpline, createDonutSpline, createNGonSpline, createStarSpline,
} from '../primitives'

export interface CreateSplinePrimitiveInput {
  kind:   SplinePrimitiveKind
  params: SplineGeneratorParams
}

export function createSplinePrimitive(input: CreateSplinePrimitiveInput): SplinePathData | null {
  switch (input.kind) {
    case 'circle':    return createCircleSpline(input.params as CircleSplineParams)
    case 'line':      return createLineSpline(input.params as LineSplineParams)
    case 'rectangle': return createRectangleSpline(input.params as RectSplineParams)
    case 'ellipse':   return createEllipseSpline(input.params as EllipseSplineParams)
    case 'arc':       return createArcSpline(input.params as ArcSplineParams)
    case 'donut':     return createDonutSpline(input.params as DonutSplineParams)
    case 'ngon':      return createNGonSpline(input.params as NGonSplineParams)
    case 'star':      return createStarSpline(input.params as StarSplineParams)
    default:          return null
  }
}
