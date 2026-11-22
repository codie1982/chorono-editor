import type { Vec2 } from '../../geometry/CoordinateSystem'
import type { FlattenedContour } from '../../geometry/flattenPathContours'
import { assertSimplePolyline, assertSimpleRing } from '../../geometry/planar'
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
    const a = shifted(p, u), b = shifted(p, v), cross = u.x * v.y - u.y * v.x, dot = u.x * v.x + u.y * v.y
    if (Math.abs(cross) < 1e-12) {
      if (dot <= 0) throw new Error('Offset cannot resolve a cusp or reversed tangent.')
      return checked([a])
    }
    const t = ((b.x - a.x) * v.y - (b.y - a.y) * v.x) / cross
    const intersection = { x: a.x + u.x * t, y: a.y + u.y * t }
    if (cross * distance < 0) return checked([intersection])
    if (settings.join === 'miter' && Math.hypot(intersection.x - p.x, intersection.y - p.y) <= Math.abs(distance) * settings.miterLimit) return checked([intersection])
    if (settings.join !== 'round') { if (settings.join === 'miter') bevelFallbacks++; return checked([a, b]) }
    const sweep = Math.atan2(cross, dot), angle = Math.atan2(a.y - p.y, a.x - p.x), radius = Math.abs(distance)
    const step = 2 * Math.acos(Math.max(-1, 1 - Math.min(settings.tolerancePx / 4, radius) / radius))
    const parts = Math.max(1, Math.ceil(Math.abs(sweep) / step))
    if (parts + count > OUTLINE_LIMITS.outputVertices) throw new Error('Round join exceeds the Offset vertex budget.')
    return checked(Array.from({ length: parts + 1 }, (_, j) => ({ x: p.x + radius * Math.cos(angle + sweep * j / parts), y: p.y + radius * Math.sin(angle + sweep * j / parts) })))
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
