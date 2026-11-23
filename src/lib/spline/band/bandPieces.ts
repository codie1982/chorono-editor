import type { Vec2 } from '../../geometry/CoordinateSystem'
import { ringArea } from '../../geometry/planar'
import { offsetJoin } from '../outline/offsetJoin'
import type { SplineBandSettings } from './types'

/** Build finite simple swept quads plus explicit outer join/cap wedges.
 * Inner overlap is resolved by the shared Boolean backend, so wide bands may
 * legitimately fill narrow holes instead of failing an offset-edge reversal.
 * Left/right are nonnegative distances using visual-left n=(dy,-dx).
 * No source mutation; finite work budgets reject rather than truncate. */
export function bandPieces(points: readonly Vec2[], closed: boolean, left: number, right: number, s: SplineBandSettings, dotTangent: Vec2 = { x: 1, y: 0 }) {
  const pieces: Vec2[][] = []; let bevelFallbacks = 0
  const add = (vertices: Vec2[]) => {
    const unique = vertices.filter((p, i) => !i || Math.hypot(p.x - vertices[i - 1].x, p.y - vertices[i - 1].y) > 1e-10)
    if (unique.length > 1 && Math.hypot(unique[0].x - unique.at(-1)!.x, unique[0].y - unique.at(-1)!.y) < 1e-10) unique.pop()
    if (unique.length >= 3 && Math.abs(ringArea(unique)) > 1e-12) pieces.push(unique)
    if (pieces.length > 4096) throw new Error('Outline generated piece budget exceeded.')
  }
  const circle = (center: Vec2, radius: number) => {
    const step = 2 * Math.acos(Math.max(-1, 1 - Math.min(s.tolerancePx / 4, radius) / radius))
    const count = Math.max(8, Math.ceil(2 * Math.PI / step))
    if (count > 8192) throw new Error('Outline cap vertex budget exceeded.')
    add(Array.from({ length: count }, (_, i) => ({ x: center.x + radius * Math.cos(i * 2 * Math.PI / count), y: center.y + radius * Math.sin(i * 2 * Math.PI / count) })))
  }
  const width = left + right
  if (points.length === 1) {
    if (s.cap === 'round') circle(points[0], width / 2)
    if (s.cap === 'square') { const p = points[0], r = width / 2, u = dotTangent; add([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: p.x + r * (a * u.x + b * u.y), y: p.y + r * (a * u.y - b * u.x) }))) }
    return { pieces, bevelFallbacks }
  }
  const count = points.length - (closed ? 0 : 1)
  const units = Array.from({ length: count }, (_, i) => { const p = points[i], q = points[(i + 1) % points.length], d = Math.hypot(q.x - p.x, q.y - p.y); return { x: (q.x - p.x) / d, y: (q.y - p.y) / d } })
  const shift = (p: Vec2, u: Vec2, d: number): Vec2 => ({ x: p.x + u.y * d, y: p.y - u.x * d })
  const joins = (distance: number) => points.map((p, i) => {
    if (!closed && (i === 0 || i === points.length - 1)) return [shift(p, units[i === 0 ? 0 : count - 1], distance)]
    if (distance === 0) return [p]
    const joined = offsetJoin(p, units[(i + count - 1) % count], units[i % count], distance, s)
    bevelFallbacks += joined.bevelFallbacks
    return joined.points
  })
  const l = joins(left), r = joins(-right)
  const forward = [l, r].every(side => units.every((u, i) => {
    const a = side[i].at(-1)!, b = side[(i + 1) % points.length][0]
    return (b.x - a.x) * u.x + (b.y - a.y) * u.y > 1e-9
  }))
  if (forward) {
    // Joined cross-sections share EXACT endpoints. This avoids overlapping
    // sliver quads at every sampled smooth-curve vertex in the sweep solver.
    for (let i = 0; i < count; i++) { const j = (i + 1) % points.length; add([l[i].at(-1)!, l[j][0], r[j][0], r[i].at(-1)!]) }
    for (let i = closed ? 0 : 1; i < (closed ? points.length : points.length - 1); i++) add([...l[i], ...r[i].slice().reverse()])
  } else {
    // A wide band can consume a small concavity/hole; swept convex pieces
    // retain its area instead of returning a reversed inset ring.
    bevelFallbacks = 0
    for (let i = 0; i < count; i++) { const p = points[i], q = points[(i + 1) % points.length], u = units[i]; add([shift(p, u, left), shift(q, u, left), shift(q, u, -right), shift(p, u, -right)]) }
    for (let i = closed ? 0 : 1; i < (closed ? points.length : points.length - 1); i++) {
      const p = points[i], u = units[(i + count - 1) % count], v = units[i % count], cross = u.x * v.y - u.y * v.x
      for (const distance of [left, -right]) if (Math.abs(distance) > 1e-12 && cross * distance > 1e-12) {
        const join = offsetJoin(p, u, v, distance, s); bevelFallbacks += join.bevelFallbacks
        add([p, shift(p, u, distance), ...join.points, shift(p, v, distance)])
      }
      if (Math.abs(cross) < 1e-12 && u.x * v.x + u.y * v.y < 0) throw new Error('Outline cannot resolve a reversed cusp. Split the path there first.')
    }
  }
  if (!closed) for (const end of [false, true]) {
    const p = end ? points.at(-1)! : points[0], u = end ? units.at(-1)! : units[0]
    if (s.cap === 'round') circle(shift(p, u, (left - right) / 2), width / 2)
    if (s.cap === 'square') { const a = shift(p, u, left), b = shift(p, u, -right), d = (end ? 1 : -1) * width / 2
      add([a, { x: a.x + u.x * d, y: a.y + u.y * d }, { x: b.x + u.x * d, y: b.y + u.y * d }, b]) }
  }
  return { pieces, bevelFallbacks }
}
