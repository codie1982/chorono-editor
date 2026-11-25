import type { Vec2 } from '../../geometry/CoordinateSystem'

/** Shared polyline join geometry in Y-down local/calculation px. Positive
 * distance shifts visual left. Inner joins intersect; outer joins honor the
 * SVG miter/round/bevel rule. No source mutation. A reversed cusp refuses.
 * Circular chords have <= tolerance/4 sagitta; miter fallback is explicit.
 * https://www.w3.org/TR/SVG/painting.html#StrokeLinejoinProperty */
export function offsetJoin(p: Vec2, u: Vec2, v: Vec2, distance: number,
  settings: { join: 'miter' | 'round' | 'bevel'; miterLimit: number; tolerancePx: number }) {
  const a = { x: p.x + u.y * distance, y: p.y - u.x * distance }
  const b = { x: p.x + v.y * distance, y: p.y - v.x * distance }
  const cross = u.x * v.y - u.y * v.x, dot = u.x * v.x + u.y * v.y
  if (Math.abs(cross) < 1e-12) {
    if (dot <= 0) throw new Error('Cannot resolve a cusp or reversed tangent.')
    return { points: [a], bevelFallbacks: 0 }
  }
  const t = ((b.x - a.x) * v.y - (b.y - a.y) * v.x) / cross
  const intersection = { x: a.x + u.x * t, y: a.y + u.y * t }
  if (cross * distance < 0 || settings.join === 'miter' && Math.hypot(intersection.x - p.x, intersection.y - p.y) <= Math.abs(distance) * settings.miterLimit)
    return { points: [intersection], bevelFallbacks: 0 }
  if (settings.join !== 'round') return { points: [a, b], bevelFallbacks: settings.join === 'miter' ? 1 : 0 }
  const sweep = Math.atan2(cross, dot), angle = Math.atan2(a.y - p.y, a.x - p.x), radius = Math.abs(distance)
  const step = 2 * Math.acos(Math.max(-1, 1 - Math.min(settings.tolerancePx / 4, radius) / radius))
  const parts = Math.max(1, Math.ceil(Math.abs(sweep) / step))
  if (!Number.isFinite(parts) || parts > 8192) throw new Error('Round join exceeds the vertex budget.')
  return { points: Array.from({ length: parts + 1 }, (_, j) => ({ x: p.x + radius * Math.cos(angle + sweep * j / parts), y: p.y + radius * Math.sin(angle + sweep * j / parts) })), bevelFallbacks: 0 }
}
