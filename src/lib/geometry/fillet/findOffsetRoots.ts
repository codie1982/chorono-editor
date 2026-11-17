import type { Vec2 } from '../CoordinateSystem'
import { splitBezier } from '../bezier/curves'
import { offsetBounds, offsetJet, uniqueOffsetRoot, type Box } from './offsetCurve'

export interface OffsetRoot { incoming: number; outgoing: number; center: Vec2 }
interface Interval { controls: Vec2[]; lo: number; hi: number }
const diameter = (box: Box) => Math.hypot(box.x[1] - box.x[0], box.y[1] - box.y[0])
/** Padded closed hulls; near contacts must survive until verified or refused. */
function overlaps(a: Box, b: Box): boolean { return a.x[0] <= b.x[1] + 1e-8 && b.x[0] <= a.x[1] + 1e-8 && a.y[0] <= b.y[1] + 1e-8 && b.y[0] <= a.y[1] + 1e-8 }
/** Binary subdivision retains original parameter intervals and exact controls. */
function halves(interval: Interval): Interval[] { const [left, right] = splitBezier(interval.controls, .5), mid = (interval.lo + interval.hi) / 2; return [{ controls: left, lo: interval.lo, hi: mid }, { controls: right, lo: mid, hi: interval.hi }] }

/** Newton refines a candidate inside its original parameter rectangle; bounded
 * steps and residual prevent a far-away root from authorizing a local cell.
 * Offset hull subdivision, rather than Newton seeds, discovers all candidates.
 * Singular or nonconvergent cells continue subdividing; none are silently lost. */
function refine(a: Vec2[], b: Vec2[], radius: number, ia: Interval, ib: Interval): OffsetRoot | null {
  let t = (ia.lo + ia.hi) / 2, u = (ib.lo + ib.hi) / 2
  for (let i = 0; i < 20; i++) {
    const ca = offsetJet(a, t, radius), cb = offsetJet(b, u, radius), fx = ca.point.x - cb.point.x, fy = ca.point.y - cb.point.y
    if (Math.hypot(fx, fy) < 1e-7) return { incoming: t, outgoing: u, center: { x: (ca.point.x + cb.point.x) / 2, y: (ca.point.y + cb.point.y) / 2 } }
    const det = ca.first.y * cb.first.x - ca.first.x * cb.first.y
    if (Math.abs(det) < 1e-16) return null
    const dt = (-cb.first.y * fx + cb.first.x * fy) / det, du = (-ca.first.y * fx + ca.first.x * fy) / det
    const nextT = t - dt, nextU = u - du
    if (nextT < ia.lo - 1e-10 || nextT > ia.hi + 1e-10 || nextU < ib.lo - 1e-10 || nextU > ib.hi + 1e-10) return null
    t = Math.max(ia.lo, Math.min(ia.hi, nextT)); u = Math.max(ib.lo, Math.min(ib.hi, nextU))
  }
  return null
}

/** Intersect the two signed normal-offset loci with bounded 2D subdivision.
 * All parameter boxes whose hulls overlap are either pruned, uniquely refined,
 * or cause an explicit uncertainty/budget diagnostic. Multiple roots are
 * returned for the caller to reject, never resolved by nearest-seed heuristics.
 * Max 24,000 cells / depth 44; pure world-space computation in a CPU worker. */
export function findOffsetRoots(a: Vec2[], b: Vec2[], signedRadius: number): OffsetRoot[] {
  const roots: OffsetRoot[] = [], stack = [{ a: { controls: a, lo: 0, hi: 1 }, b: { controls: b, lo: 0, hi: 1 }, depth: 0 }]
  let cells = 0
  while (stack.length) {
    if (++cells > 24000) throw new Error('Fillet solver budget exceeded; the radius/curves are ambiguous. Use a smaller radius or simpler edges.')
    const cell = stack.pop()!, aa = offsetBounds(cell.a.controls, signedRadius).box, bb = offsetBounds(cell.b.controls, signedRadius).box
    if (!overlaps(aa, bb)) continue
    const sizeA = diameter(aa), sizeB = diameter(bb)
    if (Math.max(sizeA, sizeB) < .01 && uniqueOffsetRoot(cell.a.controls, cell.b.controls, signedRadius)) {
      const root = refine(a, b, signedRadius, cell.a, cell.b)
      if (root) {
        if (!roots.some(r => Math.abs(r.incoming - root.incoming) < 1e-7 && Math.abs(r.outgoing - root.outgoing) < 1e-7 && Math.hypot(r.center.x - root.center.x, r.center.y - root.center.y) < 1e-5)) roots.push(root)
        continue
      }
    }
    if (cell.depth >= 44) throw new Error('Fillet has a singular, tangent or unresolved offset intersection; choose another radius.')
    if (sizeA >= sizeB) for (const part of halves(cell.a)) stack.push({ a: part, b: cell.b, depth: cell.depth + 1 })
    else for (const part of halves(cell.b)) stack.push({ a: cell.a, b: part, depth: cell.depth + 1 })
  }
  return roots
}
