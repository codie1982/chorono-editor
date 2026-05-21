// ── computeSplineBounds ───────────────────────────────────────────────────────
//
// Axis-aligned bounding box of a spline in LAYER-LOCAL coords. Includes both
// on-curve points and bezier handles — since a cubic curve is contained within
// the convex hull of its control points, this guarantees the box contains the
// rendered curve (a safe, slightly conservative estimate).
//
// Returns a zero box for empty splines.

import type { SplinePathData } from '@/lib/types/spline'

export interface SplineBounds {
  x: number
  y: number
  width: number
  height: number
}

export function computeSplineBounds(data: SplinePathData): SplineBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const p of Object.values(data.points)) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  for (const h of Object.values(data.handles)) {
    if (h.x < minX) minX = h.x
    if (h.y < minY) minY = h.y
    if (h.x > maxX) maxX = h.x
    if (h.y > maxY) maxY = h.y
  }

  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
