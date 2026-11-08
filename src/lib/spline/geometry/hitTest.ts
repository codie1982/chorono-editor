// ── Spline hit-testing (BL-73 Sprint 3) ──────────────────────────────────────
//
// All tests take LAYER-LOCAL coords (caller subtracts layer.transform) and a
// tolerance already converted to local px (caller divides screen px by zoom).
// Cubic segments are flattened before distance testing so curves hit accurately.

import type { SplinePathData, SplineHandle } from '@/lib/types/spline'

export interface SegmentHit { segmentId: string; t: number }
export interface HandleHit  { pointId: string; kind: 'in' | 'out' }

function handleMap(data: SplinePathData): Map<string, SplineHandle> {
  const m = new Map<string, SplineHandle>()
  for (const h of Object.values(data.handles)) m.set(`${h.pointId}:${h.kind}`, h)
  return m
}

/** Nearest on-curve point within tolerance, else null. */
export function hitTestSplinePoint(data: SplinePathData, x: number, y: number, tol: number): string | null {
  let best: string | null = null
  let bestD = tol * tol
  for (const p of Object.values(data.points)) {
    const dx = p.x - x, dy = p.y - y
    const d = dx * dx + dy * dy
    if (d <= bestD) { bestD = d; best = p.id }
  }
  return best
}

/** Nearest bezier handle within tolerance, else null. */
export function hitTestSplineHandle(data: SplinePathData, x: number, y: number, tol: number): HandleHit | null {
  let best: HandleHit | null = null
  let bestD = tol * tol
  for (const h of Object.values(data.handles)) {
    const dx = h.x - x, dy = h.y - y
    const d = dx * dx + dy * dy
    if (d <= bestD) { bestD = d; best = { pointId: h.pointId, kind: h.kind } }
  }
  return best
}

function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): { dSq: number; t: number } {
  const vx = bx - ax, vy = by - ay
  const len2 = vx * vx + vy * vy
  let t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * vx, cy = ay + t * vy
  const dx = px - cx, dy = py - cy
  return { dSq: dx * dx + dy * dy, t }
}

function cubicAt(p0: number, c1: number, c2: number, p1: number, t: number): number {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1
}

const CUBIC_STEPS = 16

/** Nearest segment within tolerance; t is the approximate parameter along it. */
export function hitTestSplineSegment(data: SplinePathData, x: number, y: number, tol: number): SegmentHit | null {
  const handles = handleMap(data)
  let best: SegmentHit | null = null
  let bestD = tol * tol

  for (const seg of Object.values(data.segments)) {
    const from = data.points[seg.fromPointId]
    const to   = data.points[seg.toPointId]
    if (!from || !to) continue

    if (seg.type === 'line') {
      const { dSq, t } = distToSegmentSq(x, y, from.x, from.y, to.x, to.y)
      if (dSq <= bestD) { bestD = dSq; best = { segmentId: seg.id, t } }
      continue
    }

    if (seg.type === 'quadratic' && seg.control1) {
      // Treat as polyline through the control point — close enough for picking.
      let px = from.x, py = from.y
      for (let i = 1; i <= CUBIC_STEPS; i++) {
        const t = i / CUBIC_STEPS
        const u = 1 - t
        const qx = u * u * from.x + 2 * u * t * seg.control1.x + t * t * to.x
        const qy = u * u * from.y + 2 * u * t * seg.control1.y + t * t * to.y
        const { dSq, t: fraction } = distToSegmentSq(x, y, px, py, qx, qy)
        if (dSq <= bestD) { bestD = dSq; best = { segmentId: seg.id, t: (i - 1 + fraction) / CUBIC_STEPS } }
        px = qx; py = qy
      }
      continue
    }

    // cubic — derive controls from handles
    const out = handles.get(`${from.id}:out`)
    const inn = handles.get(`${to.id}:in`)
    const c1x = out ? out.x : from.x, c1y = out ? out.y : from.y
    const c2x = inn ? inn.x : to.x,   c2y = inn ? inn.y : to.y
    let px = from.x, py = from.y
    for (let i = 1; i <= CUBIC_STEPS; i++) {
      const t = i / CUBIC_STEPS
      const qx = cubicAt(from.x, c1x, c2x, to.x, t)
      const qy = cubicAt(from.y, c1y, c2y, to.y, t)
      const { dSq, t: fraction } = distToSegmentSq(x, y, px, py, qx, qy)
      if (dSq <= bestD) { bestD = dSq; best = { segmentId: seg.id, t: (i - 1 + fraction) / CUBIC_STEPS } }
      px = qx; py = qy
    }
  }
  return best
}

/** First contour whose flattened polygon contains the point, else null. */
export function hitTestSplineContour(data: SplinePathData, x: number, y: number): string | null {
  for (const { id, poly } of closedContourPolygons(data)) {
    if (pointInPolygon(x, y, poly)) return id
  }
  return null
}

/** Test the actual compound fill, preserving even-odd holes and winding. */
export function hitTestSplineFill(data: SplinePathData, x: number, y: number): boolean {
  let winding = 0
  for (const { poly } of closedContourPolygons(data)) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      const side = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y)
      if (a.y <= y && b.y > y && side > 0) winding++
      else if (a.y > y && b.y <= y && side < 0) winding--
    }
  }
  return data.fillRule === 'evenodd' ? Math.abs(winding) % 2 === 1 : winding !== 0
}

function closedContourPolygons(data: SplinePathData): Array<{ id: string; poly: Array<{ x: number; y: number }> }> {
  const handles = handleMap(data)
  const result: ReturnType<typeof closedContourPolygons> = []
  const contourIds = new Set(Object.values(data.subShapes).flatMap(sub => sub.contourIds))
  for (const id of Array.from(contourIds)) {
    const contour = data.contours[id]
    if (!contour) continue
    if (!contour.closed) continue
    const poly: Array<{ x: number; y: number }> = []
    const first = data.points[contour.pointIds[0]]
    if (first) poly.push({ x: first.x, y: first.y })
    for (const segId of contour.segmentIds) {
      const seg = data.segments[segId]
      if (!seg) continue
      const from = data.points[seg.fromPointId]
      const to   = data.points[seg.toPointId]
      if (!from || !to) continue
      if (seg.type === 'line') {
        poly.push({ x: to.x, y: to.y })
      } else if (seg.type === 'quadratic') {
        const control = seg.control1 ?? from
        for (let i = 1; i <= CUBIC_STEPS; i++) {
          const t = i / CUBIC_STEPS, u = 1 - t
          poly.push({ x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
                      y: u * u * from.y + 2 * u * t * control.y + t * t * to.y })
        }
      } else {
        const out = handles.get(`${from.id}:out`)
        const inn = handles.get(`${to.id}:in`)
        const c1x = out ? out.x : from.x, c1y = out ? out.y : from.y
        const c2x = inn ? inn.x : to.x,   c2y = inn ? inn.y : to.y
        for (let i = 1; i <= CUBIC_STEPS; i++) {
          const t = i / CUBIC_STEPS
          poly.push({ x: cubicAt(from.x, c1x, c2x, to.x, t), y: cubicAt(from.y, c1y, c2y, to.y, t) })
        }
      }
    }
    result.push({ id: contour.id, poly })
  }
  return result
}

function pointInPolygon(px: number, py: number, poly: Array<{ x: number; y: number }>): boolean {
  if (poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect = ((yi > py) !== (yj > py))
      && (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi)
    if (intersect) inside = !inside
  }
  return inside
}
