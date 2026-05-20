// ── Append Spline Primitive ───────────────────────────────────────────────────
//
// Merges a newly-generated primitive into an existing SplinePathData, producing
// a compound spline (multiple SubShapes in one layer). The new SubShape is
// placed last in combine order.
//
// Pure: returns a fresh SplinePathData, mutates nothing.

import type {
  SplinePathData, SplinePrimitiveKind, SplineGeneratorParams,
} from '@/lib/types/spline'
import { createSplinePrimitive } from './createSplinePrimitive'

export function appendSplinePrimitiveToSplineData(
  existing: SplinePathData,
  kind:     SplinePrimitiveKind,
  params:   SplineGeneratorParams,
): SplinePathData | null {
  const orders = Object.values(existing.subShapes).map(s => s.order)
  const nextOrder = orders.length ? Math.max(...orders) + 1 : 0

  const generated = createSplinePrimitive({ kind, params, order: nextOrder })
  if (!generated) return null

  return {
    subShapes: { ...existing.subShapes, ...generated.subShapes },
    contours:  { ...existing.contours,  ...generated.contours },
    // Donut/text holes need evenodd — promote the layer if any addition wants it
    fillRule:  generated.fillRule === 'evenodd' ? 'evenodd' : existing.fillRule,
  }
}
