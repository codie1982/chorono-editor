import type { SplinePathData } from '../../types/spline'
import { segmentControls } from './segmentGeometry'

/** Source-order interior anchors whose nonzero terminal control directions
 * turn by more than the historical relative cross-product threshold 1e-6.
 * Degenerate handles are skipped toward the next control; open endpoints and
 * tangent/reversing joins are excluded. Input is borrowed in local coordinates;
 * this query neither validates the complete graph nor changes any records. */
export function sharpSplineCornerIds(data: SplinePathData): string[] {
  const incoming = new Map(Object.values(data.segments).map(s => [s.toPointId, s]))
  const outgoing = new Map(Object.values(data.segments).map(s => [s.fromPointId, s]))
  return Object.keys(data.points).filter(id => {
    const a = incoming.get(id), b = outgoing.get(id)
    if (!a || !b) return false
    const ca = segmentControls(data, a.id), cb = segmentControls(data, b.id), point = data.points[id]
    const left = ca.slice(0, -1).reverse().find(p => Math.hypot(p.x - point.x, p.y - point.y) > 1e-8)
    const right = cb.slice(1).find(p => Math.hypot(p.x - point.x, p.y - point.y) > 1e-8)
    if (!left || !right) return false
    const ax = point.x - left.x, ay = point.y - left.y, bx = right.x - point.x, by = right.y - point.y
    return Math.abs(ax * by - ay * bx) > 1e-6 * Math.hypot(ax, ay) * Math.hypot(bx, by)
  })
}
