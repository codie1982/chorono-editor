import { orient2d } from 'robust-predicates'
import type { Vec2 } from '../CoordinateSystem'

/** Signed area with a translated origin to avoid subtracting large world
 * coordinate products. Input omits its duplicate closing vertex; no mutation. */
export function ringArea(ring: readonly Vec2[]): number {
  const origin = ring[0]
  let sum = 0
  for (let i = 1; i < ring.length - 1; i++) sum += (ring[i].x - origin.x) * (ring[i + 1].y - origin.y) - (ring[i + 1].x - origin.x) * (ring[i].y - origin.y)
  return sum / 2
}

/** Robust closed-segment predicate, including collinear overlap and touching.
 * Unlike the selection domain's legacy segmentsIntersect, parallel contacts
 * must count as invalid self-contact here. Adaptive orientation signs come from
 * robust-predicates; no UI hit radius or weld tolerance is applied. */
export function closedSegmentsMeet(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const ac = orient2d(a.x, a.y, b.x, b.y, c.x, c.y), ad = orient2d(a.x, a.y, b.x, b.y, d.x, d.y)
  const ca = orient2d(c.x, c.y, d.x, d.y, a.x, a.y), cb = orient2d(c.x, c.y, d.x, d.y, b.x, b.y)
  if (ac === 0 && onSegment(c, a, b) || ad === 0 && onSegment(d, a, b) || ca === 0 && onSegment(a, c, d) || cb === 0 && onSegment(b, c, d)) return true
  return ac !== 0 && ad !== 0 && ca !== 0 && cb !== 0 && Math.sign(ac) !== Math.sign(ad) && Math.sign(ca) !== Math.sign(cb)
}
/** Exact inclusive bounding box, called only after collinearity is known. */
function onSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
}

/** Open-path companion to assertSimpleRing. Reject zero-length segments,
 * backtracking, nonadjacent contact and repeated anchors; endpoints stay open.
 * O(n²), so callers must admit bounded jobs before invoking it. */
export function assertSimplePolyline(points: readonly Vec2[]): void {
  if (points.length < 2) throw new Error('An open contour needs at least two vertices.')
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], c = points[i + 2]
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) throw new Error('Zero-length contour edge.')
    if (c && orient2d(a.x, a.y, b.x, b.y, c.x, c.y) === 0 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) throw new Error('A contour doubles back along an edge.')
    for (let j = i + 2; j < points.length - 1; j++) if (closedSegmentsMeet(a, b, points[j], points[j + 1])) throw new Error('Self-intersecting or self-touching contours are unsupported.')
  }
}

/** Reject self-crossings, repeated vertices, backtracking and negligible area.
 * Quadratic cost is admitted by the job's total 2048-vertex cap and runs only in
 * the worker. Adjacent collinear edges going forward are permitted. */
export function assertSimpleRing(ring: readonly Vec2[]): void {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[(i + 2) % ring.length]
    if (orient2d(a.x, a.y, b.x, b.y, c.x, c.y) === 0 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) throw new Error('A contour doubles back along an edge.')
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue
      if (closedSegmentsMeet(a, b, ring[j], ring[(j + 1) % ring.length])) throw new Error('Self-intersecting or self-touching contours are unsupported.')
    }
  }
  if (Math.abs(ringArea(ring)) < 1e-10) throw new Error('A closed contour has zero or negligible area.')
}

/** Strict interior query for a point already known not to touch the boundary.
 * Ray parity is sufficient for a simple ring; contour winding is separate. */
export function ringContains(ring: readonly Vec2[], p: Vec2): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Count contacts across two rings. Used to reject ambiguous winding and to
 * bound clipping expansion before invoking a third-party solver. */
export function ringContacts(a: readonly Vec2[], b: readonly Vec2[]): number {
  let count = 0
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) if (closedSegmentsMeet(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) count++
  return count
}
