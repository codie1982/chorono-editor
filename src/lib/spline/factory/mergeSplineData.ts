// ── mergeSplineData ───────────────────────────────────────────────────────────
//
// Shallow-merges all normalized records of `incoming` into `base`. All ids from
// generators are globally unique (uid), so a record spread is collision-safe.
// fillRule is promoted to evenodd when either side needs holes.

import type { SplinePathData } from '@/lib/types/spline'

export function mergeSplineData(base: SplinePathData, incoming: SplinePathData): SplinePathData {
  return {
    subShapes: { ...base.subShapes, ...incoming.subShapes },
    points:    { ...base.points,    ...incoming.points },
    handles:   { ...base.handles,   ...incoming.handles },
    segments:  { ...base.segments,  ...incoming.segments },
    contours:  { ...base.contours,  ...incoming.contours },
    fillRule:  incoming.fillRule === 'evenodd' ? 'evenodd' : base.fillRule,
  }
}
