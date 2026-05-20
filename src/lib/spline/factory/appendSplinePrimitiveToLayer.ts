// ── Append Spline Primitive ───────────────────────────────────────────────────
//
// Merges a newly-generated primitive into an existing SplinePathData, producing
// a compound spline (multiple SubShapes / contours in one layer). All ids from
// the generator are globally unique (uid), so a shallow record merge is safe.
//
// Pure: returns a fresh SplinePathData, mutates nothing.

import type {
  SplinePathData, SplinePrimitiveKind, SplineGeneratorParams,
} from '@/lib/types/spline'
import { createSplinePrimitive } from './createSplinePrimitive'
import { mergeSplineData } from './mergeSplineData'

export function appendSplinePrimitiveToSplineData(
  existing: SplinePathData,
  kind:     SplinePrimitiveKind,
  params:   SplineGeneratorParams,
): SplinePathData | null {
  const gen = createSplinePrimitive({ kind, params })
  if (!gen) return null
  return mergeSplineData(existing, gen)
}
