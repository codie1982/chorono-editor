import type { Vec2 } from '../CoordinateSystem'
import { evaluateBezier, splitBezier } from './curves'
import { bezierDerivative, bezierJet } from './derivatives'
import { parametricRootIsUnique } from '../math/parametricRootUniqueness'

export interface BezierIntersection { t: number; u: number; point: Vec2 }
/** Caller-owned synchronous work budget shared across a multi-edge query. */
export interface BezierIntersectionBudget { remaining: number }
export const BEZIER_INTERSECTION_EPS = 1e-7
const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x
const subtract = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
/** Borrowed-degree Bernstein scalar evaluation uses the canonical De Casteljau
 * evaluator; no power-basis conversion or sampled root assumption. */
function scalar(values: readonly number[], t: number): number { return evaluateBezier(values.map(x => ({ x, y: 0 })), t).x }

/** All isolated roots of a degree <=3 Bernstein polynomial on [0,1]. Derivative
 * roots partition monotone intervals; bisection handles crossings and critical
 * points retain double/tangent roots. Normalized value tolerance 1e-12, parameter
 * tolerance 1e-12. Identically zero means overlap, never an arbitrary root. */
function roots(values: readonly number[]): number[] {
  const magnitude = Math.max(...values.map(Math.abs))
  if (magnitude < 1e-14) throw new Error('Overlapping boundaries have no unique intersection.')
  const v = values.map(n => n / magnitude), degree = v.length - 1
  if (!degree) return []
  const derivative = v.slice(1).map((n, i) => degree * (n - v[i])), critical = Math.max(...derivative.map(Math.abs)) < 1e-14 ? [] : roots(derivative)
  const stops = [0, ...critical.filter(t => t > 1e-12 && t < 1 - 1e-12), 1], result: number[] = []
  const add = (t: number) => { if (!result.some(old => Math.abs(old - t) < 1e-10)) result.push(t) }
  for (const t of stops) if (Math.abs(scalar(v, t)) < 1e-12) add(t)
  for (let i = 1; i < stops.length; i++) {
    let lo = stops[i - 1], hi = stops[i], left = scalar(v, lo), right = scalar(v, hi)
    if (Math.abs(left) < 1e-12 || Math.abs(right) < 1e-12 || Math.sign(left) === Math.sign(right)) continue
    for (let iteration = 0; iteration < 50; iteration++) {
      const mid = (lo + hi) / 2, value = scalar(v, mid)
      if (Math.sign(value) === Math.sign(left)) { lo = mid; left = value } else hi = mid
    }
    add((lo + hi) / 2)
  }
  return result.sort((a, b) => a - b)
}

/** Analytic line/ray versus polynomial Bézier intersection. Direction need not
 * be normalized. Ray distance is measured in input-space px. Behind/origin
 * contacts are excluded; collinear forward overlap refuses explicitly. */
export function intersectBezierRay(origin: Vec2, direction: Vec2, curve: readonly Vec2[]): { t: number; distance: number; point: Vec2 }[] {
  const length = Math.hypot(direction.x, direction.y)
  if (length < 1e-12) throw new Error('The open endpoint has no usable terminal tangent.')
  const axis = { x: direction.x / length, y: direction.y / length }, values = curve.map(p => cross(subtract(p, origin), axis))
  if (values.every(n => Math.abs(n) < BEZIER_INTERSECTION_EPS)) {
    if (curve.every(p => (p.x - origin.x) * axis.x + (p.y - origin.y) * axis.y <= BEZIER_INTERSECTION_EPS)) return []
    throw new Error('The extension overlaps a boundary; choose a non-overlapping target.')
  }
  return roots(values).flatMap(t => {
    const point = evaluateBezier(curve, t), distance = (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y
    return distance > BEZIER_INTERSECTION_EPS ? [{ t, distance, point }] : []
  }).sort((a, b) => a.distance - b.distance || a.t - b.t)
}

/** Conservative control hull, shared by pair pruning and recursive search. */
function box(controls: readonly Vec2[]) { return { minX: Math.min(...controls.map(p => p.x)), minY: Math.min(...controls.map(p => p.y)), maxX: Math.max(...controls.map(p => p.x)), maxY: Math.max(...controls.map(p => p.y)) } }
/** Cheap broad phase; closed contacts survive. No geometry mutation. */
export function bezierHullsOverlap(a: readonly Vec2[], b: readonly Vec2[], paddingPx = BEZIER_INTERSECTION_EPS): boolean {
  const x = box(a), y = box(b), e = paddingPx
  return x.minX <= y.maxX + e && y.minX <= x.maxX + e && x.minY <= y.maxY + e && y.minY <= x.maxY + e
}
/** Finite straight segment against a line/Q/C curve. Collinear endpoint-only
 * contact is valid; positive-length overlapping domains refuse to trim safely. */
function lineIntersections(line: readonly Vec2[], curve: readonly Vec2[]): BezierIntersection[] {
  const direction = subtract(line[1], line[0]), length = Math.hypot(direction.x, direction.y)
  if (length < 1e-12) return []
  const values = curve.map(p => cross(subtract(p, line[0]), direction) / length)
  if (values.every(n => Math.abs(n) < BEZIER_INTERSECTION_EPS)) {
    const projections = curve.map(p => ((p.x - line[0].x) * direction.x + (p.y - line[0].y) * direction.y) / length ** 2)
    if (Math.min(1, Math.max(...projections)) - Math.max(0, Math.min(...projections)) > 1e-9) throw new Error('Overlapping boundaries cannot define a unique Trim interval.')
    return [0, 1].flatMap(t => [0, 1].flatMap(u => Math.hypot(line[t].x - curve[u * (curve.length - 1)].x, line[t].y - curve[u * (curve.length - 1)].y) <= BEZIER_INTERSECTION_EPS ? [{ t, u, point: { ...line[t] } }] : []))
  }
  return roots(values).flatMap(u => {
    const point = evaluateBezier(curve, u), t = ((point.x - line[0].x) * direction.x + (point.y - line[0].y) * direction.y) / length ** 2
    return t >= -1e-10 && t <= 1 + 1e-10 ? [{ t: Math.max(0, Math.min(1, t)), u, point }] : []
  })
}

/** Refine a regular curve/curve crossing from a bounded hull candidate. A
 * singular/tangent candidate stays unresolved and must subdivide or refuse. */
function refine(a: readonly Vec2[], b: readonly Vec2[], t: number, u: number): BezierIntersection | null {
  for (let i = 0; i < 25; i++) {
    const x = bezierJet(a, t), y = bezierJet(b, u), delta = subtract(x.point, y.point), det = cross(x.first, y.first)
    if (Math.abs(det) < 1e-14) return null
    const dt = cross(delta, y.first) / det, du = cross(delta, x.first) / det
    // Residual alone is insufficient near a shallow crossing: its parameter
    // error can span several neighboring root cells and create duplicate cuts.
    if (Math.hypot(delta.x, delta.y) <= BEZIER_INTERSECTION_EPS && Math.max(Math.abs(dt), Math.abs(du)) < 1e-11) return { t, u, point: x.point }
    t -= dt; u -= du
    if (t < -1e-10 || t > 1 + 1e-10 || u < -1e-10 || u > 1 + 1e-10) return null
    t = Math.max(0, Math.min(1, t)); u = Math.max(0, Math.min(1, u))
  }
  return null
}

/** Polynomial derivative hulls use the same uniqueness test as Fillet offsets;
 * close crossings must subdivide until each accepted cell has only one root. */
function unique(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  const aa = box(bezierDerivative(a)), bb = box(bezierDerivative(b))
  return parametricRootIsUnique({ x: [aa.minX, aa.maxX], y: [aa.minY, aa.maxY] }, { x: [bb.minX, bb.maxX], y: [bb.minY, bb.maxY] }, bezierJet(a, .5).first, bezierJet(b, .5).first)
}

/** One cubic's isolated self-crossing. Factoring P(t)−P(u) by t−u gives
 * a*(s²−p)+b*s+c=0 for s=t+u, p=t*u. Cross with a solves s; the remaining
 * quadratic gives the two parameters. Lines/quadratics, cusps and collinear
 * retracing have no isolated pair here. Pure; accepted residual <=1e-7 px. */
export function bezierSelfIntersections(curve: readonly Vec2[]): BezierIntersection[] {
  if (curve.length !== 4) return []
  const [p0, p1, p2, p3] = curve
  const a = { x: -p0.x + 3 * p1.x - 3 * p2.x + p3.x, y: -p0.y + 3 * p1.y - 3 * p2.y + p3.y }
  const b = { x: 3 * p0.x - 6 * p1.x + 3 * p2.x, y: 3 * p0.y - 6 * p1.y + 3 * p2.y }, c = { x: 3 * (p1.x - p0.x), y: 3 * (p1.y - p0.y) }
  const denominator = cross(a, b)
  if (Math.abs(denominator) <= 1e-12 * Math.max(1, Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y))) return []
  const sum = -cross(a, c) / denominator, q = Math.abs(a.x) >= Math.abs(a.y) ? -(b.x * sum + c.x) / a.x : -(b.y * sum + c.y) / a.y
  const product = sum * sum - q, discriminant = sum * sum - 4 * product
  if (discriminant <= 1e-14) return []
  const t = (sum - Math.sqrt(discriminant)) / 2, u = (sum + Math.sqrt(discriminant)) / 2
  if (t < 0 || u > 1 || u - t < 1e-7) return []
  const point = evaluateBezier(curve, t), other = evaluateBezier(curve, u)
  if (Math.hypot(point.x - other.x, point.y - other.y) > BEZIER_INTERSECTION_EPS) throw new Error('The cubic self-intersection could not be resolved safely.')
  return [{ t, u, point }]
}

/** Isolated line/Q/C crossings, preserving original parameters and controls.
 * Lines use Bernstein scalar root isolation (including tangencies); two curved
 * boundaries use exact hull subdivision plus residual-checked Newton. Unlike
 * Fillet's normal-offset solver, this query admits ordinary degenerate endpoint
 * handles. Curve/curve tangencies, coincident curves and unresolved near contacts
 * refuse; they never authorize destructive guessed cuts. Budget 12,000 cells,
 * depth 48, residual 1e-7 input-space px; caller-owned optional budget is consumed
 * across pairs. Geometry is never mutated and no source IDs are allocated.
 * Method: https://pomax.github.io/bezierinfo/#curveintersection */
export function intersectBezierCurves(a: readonly Vec2[], b: readonly Vec2[], budget: BezierIntersectionBudget = { remaining: 12000 }): BezierIntersection[] {
  if (--budget.remaining < 0) throw new Error('Curve intersection budget exceeded; isolate fewer boundaries.')
  if (!bezierHullsOverlap(a, b)) return []
  if (a.length === 2) return lineIntersections(a, b)
  if (b.length === 2) return lineIntersections(b, a).map(hit => ({ ...hit, t: hit.u, u: hit.t }))
  const result: BezierIntersection[] = [], stack = [{ a, b, t0: 0, t1: 1, u0: 0, u1: 1, depth: 0 }]
  const roundingPad = Number.EPSILON * 32 * Math.max(1, ...[...a, ...b].flatMap(p => [Math.abs(p.x), Math.abs(p.y)]))
  for (const t of [0, 1]) for (const u of [0, 1]) {
    const point = a[t * (a.length - 1)], other = b[u * (b.length - 1)]
    if (Math.hypot(point.x - other.x, point.y - other.y) <= BEZIER_INTERSECTION_EPS) result.push({ t, u, point: { ...point } })
  }
  let visited = 0
  while (stack.length) {
    if (++visited > 12000 || --budget.remaining < 0) throw new Error('Curve intersection budget exceeded; simplify overlapping boundaries.')
    const part = stack.pop()!
    // Source-wide broad phase may be padded by the residual tolerance. Root
    // subdivision must use only rounding padding, or empty near-root cells
    // survive forever despite an already-resolved, separate intersection.
    if (!bezierHullsOverlap(part.a, part.b, roundingPad)) continue
    // Adjacent smooth edges share an endpoint with a singular pair Jacobian.
    // Isolate that already-known contact to the parameter dedup tolerance.
    if (result.some(hit => (hit.t === 0 || hit.t === 1) && (hit.u === 0 || hit.u === 1)
      && Math.max(Math.abs(part.t0 - hit.t), Math.abs(part.t1 - hit.t), Math.abs(part.u0 - hit.u), Math.abs(part.u1 - hit.u)) < 1e-7)) continue
    const ba = box(part.a), bb = box(part.b), sa = Math.hypot(ba.maxX - ba.minX, ba.maxY - ba.minY), sb = Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY)
    if (Math.max(sa, sb) < .01 && unique(part.a, part.b)) {
      const hit = refine(a, b, (part.t0 + part.t1) / 2, (part.u0 + part.u1) / 2)
      if (hit && hit.t >= part.t0 - 1e-9 && hit.t <= part.t1 + 1e-9 && hit.u >= part.u0 - 1e-9 && hit.u <= part.u1 + 1e-9) {
        if (!result.some(old => Math.abs(old.t - hit.t) < 1e-7 && Math.abs(old.u - hit.u) < 1e-7)) result.push(hit)
        continue
      }
    }
    if (part.depth >= 48) throw new Error('Tangent, overlapping or unresolved curved boundaries cannot define a safe Trim interval.')
    const splitA = sa >= sb, [left, right] = splitBezier(splitA ? part.a : part.b, .5), mid = splitA ? (part.t0 + part.t1) / 2 : (part.u0 + part.u1) / 2
    stack.push(splitA ? { ...part, a: left, t1: mid, depth: part.depth + 1 } : { ...part, b: left, u1: mid, depth: part.depth + 1 },
      splitA ? { ...part, a: right, t0: mid, depth: part.depth + 1 } : { ...part, b: right, u0: mid, depth: part.depth + 1 })
  }
  return result.sort((a, b) => a.t - b.t || a.u - b.u)
}
