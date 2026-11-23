import type { Vec2 } from '../CoordinateSystem'

/** Tangent cubic for a circular interval; same k=4/3*tan(sweep/4) convention
 * historically used by createArcSpline. Angles are radians, +Y screen-down.
 * Controls are absolute in the caller's coordinate space; no validation/clamp. */
function arcPiece(center: Vec2, radius: number, start: number, sweep: number): Vec2[] {
  const end = start + sweep, k = 4 / 3 * Math.tan(sweep / 4), ca = Math.cos(start), sa = Math.sin(start), cb = Math.cos(end), sb = Math.sin(end)
  return [{ x: center.x + radius * ca, y: center.y + radius * sa }, { x: center.x + radius * (ca - k * sa), y: center.y + radius * (sa + k * ca) },
    { x: center.x + radius * (cb + k * sb), y: center.y + radius * (sb - k * cb) }, { x: center.x + radius * cb, y: center.y + radius * sb }]
}

/** Bound radial error of a unit circular cubic via degree-six Bernstein
 * coefficients of x(t)^2+y(t)^2−1. The convex-hull bound covers every t, not
 * just samples. No exact-circle claim: polynomial cubics approximate circles.
 * Source convex-hull reference: https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/bezier-construct.html */
export function circularCubicError(sweep: number): number {
  return circularBezierRadialError(arcPiece({ x: 0, y: 0 }, 1, 0, sweep), { x: 0, y: 0 }, 1)
}

/** Conservative whole-curve radial error around a supplied circle, in the
 * caller's coordinate units. Normalized degree-six Bernstein coefficients
 * bound every parameter, including between samples. Subdivide with the shared
 * De Casteljau helper to tighten this bound. Accepts four finite cubic controls
 * and a finite positive radius; throws for invalid input, never mutates it. */
export function circularBezierRadialError(controls: readonly Vec2[], center: Vec2, radius: number): number {
  if (controls.length !== 4 || !Number.isFinite(radius) || radius <= 0 || [...controls, center].some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Circular error requires finite cubic controls and a positive radius.')
  const points = controls.map(p => ({ x: (p.x - center.x) / radius, y: (p.y - center.y) / radius })), choose3 = [1, 3, 3, 1], choose6 = [1, 6, 15, 20, 15, 6, 1]
  let bound = 0
  for (let k = 0; k <= 6; k++) {
    let coefficient = -1
    for (let i = Math.max(0, k - 3); i <= Math.min(3, k); i++) { const j = k - i; coefficient += choose3[i] * choose3[j] / choose6[k] * (points[i].x * points[j].x + points[i].y * points[j].y) }
    bound = Math.max(bound, Math.abs(coefficient))
  }
  return bound < 1 ? radius * bound / (Math.sqrt(1 - bound) + 1) : Infinity
}

/** Portable same-degree arc approximation. Legacy callers omit tolerance and
 * retain <=90° chunks; Fillet supplies an absolute world-px error, increasing
 * uniform subdivisions until the radial bound fits. Tangents stay exact.
 * At most maxPieces; refuse exhausted quality rather than degrade silently. */
export function circularArcCubics(center: Vec2, radius: number, start: number, sweep: number, tolerance = Infinity, maxPieces = 32): Vec2[][] {
  let count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)))
  while (Math.abs(radius) * circularCubicError(sweep / count) > tolerance) count *= 2
  if (count > maxPieces || !Number.isFinite(count)) throw new Error('Fillet circular-arc quality budget exceeded.')
  const step = sweep / count
  return Array.from({ length: count }, (_, i) => arcPiece(center, radius, start + i * step, step))
}
