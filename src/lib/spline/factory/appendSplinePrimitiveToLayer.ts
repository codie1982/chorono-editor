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

export function appendSplinePrimitiveToSplineData(
  existing: SplinePathData,
  kind:     SplinePrimitiveKind,
  params:   SplineGeneratorParams,
): SplinePathData | null {
  const gen = createSplinePrimitive({ kind, params })
  if (!gen) return null

  return {
    subShapes: { ...existing.subShapes, ...gen.subShapes },
    points:    { ...existing.points,    ...gen.points },
    handles:   { ...existing.handles,   ...gen.handles },
    segments:  { ...existing.segments,  ...gen.segments },
    contours:  { ...existing.contours,  ...gen.contours },
    fillRule:  gen.fillRule === 'evenodd' ? 'evenodd' : existing.fillRule,
  }
}
