import type { SplinePathData } from '../../types/spline'
import type { Vec2 } from '../../geometry/CoordinateSystem'
import { circularBezierRadialError } from '../../geometry/bezier/circularArc'
import { splitBezier } from '../../geometry/bezier/curves'
import { segmentControls } from '../corners'

export interface RoundedSplineCorner {
  readonly contourId: string
  readonly incomingId: string
  readonly outgoingId: string
  readonly pointIds: readonly string[]
  readonly segmentIds: readonly string[]
  readonly corner: Vec2
}
const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
/** Undefined for a degenerate side; direction remains contour-oriented. */
function unit(a: Vec2): Vec2 | null { const length = Math.hypot(a.x, a.y); return length > 1e-8 ? { x: a.x / length, y: a.y / length } : null }
/** Oriented angular difference, preserving convex/concave winding. */
function angle(a: Vec2, b: Vec2): number { return Math.atan2(cross(a, b), a.x * b.x + a.y * b.y) }

/** Recognize an existing minor circular cubic run between two straight sides.
 * The intersection of their forward/backward extensions reconstructs the sharp
 * corner; circle geometry is measured from source controls, never generator
 * params or a small-radius heuristic. Standard <=90° circular cubics and their
 * exact subdivisions are admitted at 0.0003 relative radial error (the usual
 * quarter-circle cubic has max error ~0.000273). Whole-curve Bernstein bounds
 * verify the tolerance, not samples. Tangent tolerance is 0.002 rad internally,
 * 1e-5 rad between pieces and at straight sides. Non-circular, reversing,
 * semicircular/full-circle and curved-flank cases are not guessed. */
function recognize(data: SplinePathData, contourId: string, incomingId: string, outgoingId: string, segmentIds: string[], budget: { remaining: number }): RoundedSplineCorner | null {
  if (!segmentIds.length || segmentIds.length > 32 || segmentIds.some(id => data.segments[id].type !== 'cubic')) return null
  const incoming = data.segments[incomingId], outgoing = data.segments[outgoingId]
  const start = data.points[incoming.toPointId], end = data.points[outgoing.fromPointId]
  const u = unit(sub(start, data.points[incoming.fromPointId])), v = unit(sub(data.points[outgoing.toPointId], end))
  if (!u || !v) return null
  const turn = angle(u, v), det = cross(u, v)
  if (Math.abs(turn) < 1e-4 || Math.abs(turn) >= Math.PI - 1e-4) return null
  const delta = sub(end, start), forward = cross(delta, v) / det, backward = -cross(delta, u) / det
  if (forward <= 1e-8 || backward <= 1e-8) return null
  const radius = (forward + backward) / (2 * Math.tan(Math.abs(turn) / 2)), side = Math.sign(turn)
  if (!Number.isFinite(radius) || radius <= 1e-8) return null
  const tolerance = Math.max(1e-7, radius * .0003)
  if (Math.abs(forward - backward) > tolerance) return null
  const center = { x: start.x - side * u.y * radius, y: start.y + side * u.x * radius }
  let previous = u, total = 0
  for (const id of segmentIds) {
    const controls = segmentControls(data, id), a = controls[0], b = controls[3]
    const first = unit(sub(controls[1], a)), last = unit(sub(b, controls[2]))
    const ra = sub(a, center), rb = sub(b, center), sweep = angle(ra, rb)
    if (!first || !last || Math.abs(angle(previous, first)) > 1e-5 || Math.sign(sweep) !== side || Math.abs(sweep) > Math.PI / 2 + 1e-5
      || Math.abs(distance(a, center) - radius) > tolerance || Math.abs(distance(b, center) - radius) > tolerance
      || Math.abs(angle(first, { x: -side * ra.y, y: side * ra.x })) > .002 || Math.abs(angle(last, { x: -side * rb.y, y: side * rb.x })) > .002) return null
    const pieces = [{ controls, depth: 0 }]
    while (pieces.length) {
      if (--budget.remaining < 0) throw new Error('Round Corners recognition budget exceeded. Isolate fewer contours.')
      const piece = pieces.pop()!
      if (circularBezierRadialError(piece.controls, center, radius) <= tolerance) continue
      if (piece.depth >= 8) return null
      for (const controls of splitBezier(piece.controls, .5)) pieces.push({ controls, depth: piece.depth + 1 })
    }
    previous = last; total += sweep
  }
  if (Math.abs(angle(previous, v)) > 1e-5 || Math.abs(total - turn) > .001) return null
  return { contourId, incomingId, outgoingId, segmentIds,
    pointIds: [start.id, ...segmentIds.map(id => data.segments[id].toPointId)],
    corner: { x: start.x + u.x * forward, y: start.y + u.y * forward } }
}

/** Ordered, immutable query of whole rounded-corner runs, including a run over
 * a closed contour seam. Optional eligible point IDs filter runs BEFORE any
 * curve fitting; point types/selection belong to the caller's target policy.
 * Uses at most 8,192 radial hull checks across the query. Open endpoints
 * are never treated as corners; a standalone circle has no flanking side pair.
 * Borrowed source must already pass assertSplineTopology. */
export function findRoundedSplineCorners(data: SplinePathData, eligible?: ReadonlySet<string>): RoundedSplineCorner[] {
  const result: RoundedSplineCorner[] = [], budget = { remaining: 8192 }
  for (const contour of Object.values(data.contours)) {
    if (eligible && !contour.pointIds.some(id => eligible.has(id))) continue
    const ids = contour.segmentIds, lines = ids.flatMap((id, i) => data.segments[id].type === 'line' ? [i] : [])
    for (let i = 0; i < lines.length - (contour.closed ? 0 : 1); i++) {
      const a = lines[i], b = lines[(i + 1) % lines.length]
      if (a === b) continue
      const run = b > a ? ids.slice(a + 1, b) : [...ids.slice(a + 1), ...ids.slice(0, b)]
      if (eligible && ![data.segments[ids[a]].toPointId, ...run.map(id => data.segments[id].toPointId)].some(id => eligible.has(id))) continue
      const corner = recognize(data, contour.id, ids[a], ids[b], run, budget)
      if (corner) result.push(corner)
    }
  }
  return result
}
