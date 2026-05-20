// ── Polyline spline (Line tool, multi-click) ──────────────────────────────────
//
// Builds a granular SplinePathData from a sequence of corner points. Used by the
// Line creation tool — click to add points, finish open or closed.
//
// Points are passed in LAYER-LOCAL coords (already offset by the layer center).

import type { SplinePathData } from '@/lib/types/spline'
import { buildSplineData } from '../util/buildSplineData'

export function createPolylineSpline(
  localPoints: Array<{ x: number; y: number }>,
  closed: boolean,
): SplinePathData {
  return buildSplineData({
    kind: 'line',
    name: 'Line',
    combineMode: 'none',
    fillRule: 'nonzero',
    contours: [{
      closed,
      anchors: localPoints.map(p => ({ x: p.x, y: p.y, type: 'corner' as const })),
    }],
  })
}
