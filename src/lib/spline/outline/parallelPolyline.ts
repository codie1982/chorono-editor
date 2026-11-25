import type { Vec2 } from '../../geometry/CoordinateSystem'
import type { FlattenedContour } from '../../geometry/flattenPathContours'
import { assertSimplePolyline, assertSimpleRing } from '../../geometry/planar'
import { offsetJoin } from './offsetJoin'
import { OUTLINE_LIMITS, type OutlineSettings } from './types'

/** Offset a simple polyline without capping or closing its open ends. Positive
 * distance is visual LEFT of traversal in Chorono's Y-down composition space:
 * n=(dy,-dx)/length. Shifted edge intersections handle inner corners; convex
 * joins use the explicit miter/bevel/round policy. Miter-limit fallback is bevel
 * and is counted. Round chords use a sagitta bound, never zoom-dependent steps.
 * This works on the caller's curve approximation, not an exact analytic offset.
 * New arrays only; a collapsed/reversed edge or ambiguous result throws.
 * Join semantics: https://www.angusj.com/clipper2/Docs/Units/Clipper/Types/JoinType.htm
 * Unlike Clipper's open stroke inflation, the output here is a single open path. */
export function parallelPolyline(contour: FlattenedContour, distance: number, settings: OutlineSettings) {
  const { points, closed } = contour
  const size = points.length, edgeCount = size - (closed ? 0 : 1)
  const units = Array.from({ length: edgeCount }, (_, i) => {
    const p = points[i], q = points[(i + 1) % size], length = Math.hypot(q.x - p.x, q.y - p.y)
    if (length < 1e-9) throw new Error('Zero-length Offset edge.')
    return { x: (q.x - p.x) / length, y: (q.y - p.y) / length }
  })
  let count = 0, bevelFallbacks = 0
  const shifted = (p: Vec2, unit: Vec2) => ({ x: p.x + unit.y * distance, y: p.y - unit.x * distance })
  const checked = (vertices: Vec2[]) => {
    count += vertices.length
    if (count > OUTLINE_LIMITS.outputVertices) throw new Error('Offset output vertex budget exceeded.')
    if (vertices.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.max(Math.abs(p.x), Math.abs(p.y)) > 1e7)) throw new Error('Offset produced out-of-range coordinates.')
    return vertices
  }
  const joins = points.map((p, i) => {
    if (!closed && (i === 0 || i === size - 1)) return checked([shifted(p, units[i === 0 ? 0 : edgeCount - 1])])
    const u = units[(i + edgeCount - 1) % edgeCount], v = units[i % edgeCount]
    const join = offsetJoin(p, u, v, distance, settings)
    bevelFallbacks += join.bevelFallbacks
    return checked(join.points)
  })
  // Inner offsets beyond a narrow feature can produce another plausible ring.
  // Require every shifted edge to still advance in its source direction.
  for (let i = 0; i < edgeCount; i++) {
    const a = joins[i].at(-1)!, b = joins[(i + 1) % size][0], u = units[i]
    if ((b.x - a.x) * u.x + (b.y - a.y) * u.y <= 1e-9) throw new Error('Offset collapses or reverses a narrow feature. Reduce the distance.')
  }
  const result = { closed, points: joins.flat() }
  if (closed) assertSimpleRing(result.points); else assertSimplePolyline(result.points)
  return { contour: result, bevelFallbacks }
}
