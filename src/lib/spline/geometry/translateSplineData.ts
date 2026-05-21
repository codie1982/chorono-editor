// ── translateSplineData ───────────────────────────────────────────────────────
//
// Returns a copy of the spline with all points + handles (and any quadratic
// control points) shifted by (dx, dy). Used when appending a drawn primitive
// into an existing layer so it lands where the user dragged.

import type { SplinePathData } from '@/lib/types/spline'

export function translateSplineData(data: SplinePathData, dx: number, dy: number): SplinePathData {
  const points = Object.fromEntries(
    Object.entries(data.points).map(([id, p]) => [id, { ...p, x: p.x + dx, y: p.y + dy }]),
  )
  const handles = Object.fromEntries(
    Object.entries(data.handles).map(([id, h]) => [id, { ...h, x: h.x + dx, y: h.y + dy }]),
  )
  const segments = Object.fromEntries(
    Object.entries(data.segments).map(([id, s]) => [id, {
      ...s,
      control1: s.control1 ? { x: s.control1.x + dx, y: s.control1.y + dy } : undefined,
      control2: s.control2 ? { x: s.control2.x + dx, y: s.control2.y + dy } : undefined,
    }]),
  )
  return { ...data, points, handles, segments }
}
