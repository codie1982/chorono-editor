import type { Vec2 } from '../CoordinateSystem'
import { bezierJet } from '../bezier/derivatives'
import { circularArcCubics, circularCubicError } from '../bezier/circularArc'
import { findOffsetRoots, type OffsetRoot } from './findOffsetRoots'
import { offsetJet } from './offsetCurve'

export interface FilletSolution extends OffsetRoot { curves: Vec2[][]; sweepRad: number; radialErrorBoundPx: number; tangentErrorRad: number }
const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y

/** Circular fillet tangent to regular incoming/outgoing line/Q/C edges.
 * World px radius, oriented local-turn side, minor arc <180°. Line–line uses
 * d=R*tan(|turn|/2); other pairs intersect the signed normal offsets with bounded
 * hull subdivision. No roots/multiple roots/singular offsets/straight or U-turn
 * corners refuse explicitly. Original edges are never flattened for solving.
 * Residual <=0.001px and oriented tangent error <=1e-4 rad are mandatory;
 * cubic arc radial bound <=0.001px, exact circles are not serializable here.
 * No mutation/IDs/resource ownership. */
export function solveFilletCorner(a: Vec2[], b: Vec2[], radius: number): FilletSolution {
  if (!Number.isFinite(radius) || radius < .1 || radius > 10000 || [...a, ...b].some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.max(Math.abs(p.x), Math.abs(p.y)) > 1e7)) throw new Error('Invalid Fillet radius or world geometry.')
  const endA = offsetJet(a, 1, 0), startB = offsetJet(b, 0, 0)
  if (Math.hypot(endA.point.x - startB.point.x, endA.point.y - startB.point.y) > .001) throw new Error('Fillet edges must share one corner.')
  const turn = Math.atan2(cross(endA.tangent, startB.tangent), dot(endA.tangent, startB.tangent)), side = Math.sign(turn), signed = side * radius
  if (Math.abs(turn) < 1e-4 || Math.abs(turn) > Math.PI - 1e-4) throw new Error('Fillet needs a sharp regular corner; already tangent or reversing edges cannot be rounded.')
  let roots: OffsetRoot[]
  if (a.length === 2 && b.length === 2) {
    const distance = radius * Math.tan(Math.abs(turn) / 2), lengthA = Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y), lengthB = Math.hypot(b[1].x - b[0].x, b[1].y - b[0].y)
    if (distance >= lengthA - .01 || distance >= lengthB - .01) throw new Error('Fillet radius does not fit the adjacent edges. Reduce the radius.')
    const incoming = 1 - distance / lengthA, outgoing = distance / lengthB
    roots = [{ incoming, outgoing, center: offsetJet(a, incoming, signed).point }]
  } else roots = findOffsetRoots(a, b, signed)
  if (!roots.length) throw new Error('Fillet radius has no tangent solution on the adjacent edges. Reduce the radius.')
  if (roots.length !== 1) throw new Error('Fillet radius has multiple tangent solutions; choose a smaller radius or simpler edges.')
  const root = roots[0]
  if (root.incoming <= 1e-9 || root.incoming >= 1 - 1e-9 || root.outgoing <= 1e-9 || root.outgoing >= 1 - 1e-9) throw new Error('Fillet radius consumes an edge or produces no cut.')
  const ja = bezierJet(a, root.incoming), jb = bezierJet(b, root.outgoing), oa = offsetJet(a, root.incoming, signed), ob = offsetJet(b, root.outgoing, signed)
  if (dot(oa.first, ja.first) <= 0 || dot(ob.first, jb.first) <= 0) throw new Error('Fillet radius reaches a singular/reversed offset. Reduce the radius.')
  const va = { x: ja.point.x - root.center.x, y: ja.point.y - root.center.y }, vb = { x: jb.point.x - root.center.x, y: jb.point.y - root.center.y }
  const sweep = Math.atan2(cross(va, vb), dot(va, vb)), start = Math.atan2(va.y, va.x)
  if (Math.sign(sweep) !== side || Math.abs(sweep) < 1e-4 || Math.abs(sweep) > Math.PI - 1e-4) throw new Error('Fillet has no local minor-arc solution for this corner.')
  const residual = Math.max(Math.hypot(oa.point.x - ob.point.x, oa.point.y - ob.point.y), Math.abs(Math.hypot(va.x, va.y) - radius), Math.abs(Math.hypot(vb.x, vb.y) - radius))
  const ta = { x: -side * va.y / Math.hypot(va.x, va.y), y: side * va.x / Math.hypot(va.x, va.y) }, tb = { x: -side * vb.y / Math.hypot(vb.x, vb.y), y: side * vb.x / Math.hypot(vb.x, vb.y) }
  const angle = (u: Vec2, v: Vec2) => Math.abs(Math.atan2(cross(u, v), dot(u, v)))
  const tangentErrorRad = Math.max(angle(ta, oa.tangent), angle(tb, ob.tangent))
  if (residual > .001 || tangentErrorRad > 1e-4) throw new Error('Fillet could not satisfy the radius/tangent tolerance.')
  const curves = circularArcCubics(root.center, radius, start, sweep, .001)
  return { ...root, curves, sweepRad: sweep, radialErrorBoundPx: radius * circularCubicError(sweep / curves.length), tangentErrorRad }
}
