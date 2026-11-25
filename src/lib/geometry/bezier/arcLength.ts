import type { Vec2 } from '../CoordinateSystem'
import { splitBezier } from './curves'

export interface BezierLengthTable { length: number; samples: { t: number; length: number }[] }
/** Adaptive length bounds: chord <= true arc <= control polygon. Distribute
 * tolerance across children so accumulated length error stays <= tolerance/2.
 * Also bound deviation from a linearly parameterized chord by tolerance: even
 * collinear controls with uneven velocity then get a valid inverse lookup.
 * Input/output lengths use the controls' units (Chamfer supplies world px).
 * Reject nonfinite, exhausted depth/node budgets instead of lowering quality.
 * No retained cache; O(leaves) space, depth <= 24, at most maxNodes visits. */
export function bezierLengthTable(points: readonly Vec2[], tolerance = .0025, maxNodes = 32768): BezierLengthTable {
  if (points.length < 2 || points.length > 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.max(Math.abs(p.x), Math.abs(p.y)) > 1e7)
    || !Number.isFinite(tolerance) || tolerance <= 0 || !Number.isSafeInteger(maxNodes) || maxNodes < 1) throw new Error('Invalid Bézier length input or budget.')
  const samples = [{ t: 0, length: 0 }]; let length = 0, nodes = 0
  const visit = (controls: readonly Vec2[], lo: number, hi: number, error: number, depth: number) => {
    if (++nodes > maxNodes || depth > 24) throw new Error('Bézier length quality budget exceeded. Use smaller geometry or fewer points.')
    const a = controls[0], b = controls[controls.length - 1], chord = Math.hypot(b.x - a.x, b.y - a.y)
    let polygon = 0, deviation = 0
    for (let i = 1; i < controls.length; i++) {
      polygon += Math.hypot(controls[i].x - controls[i - 1].x, controls[i].y - controls[i - 1].y)
      const t = i / (controls.length - 1)
      deviation = Math.max(deviation, Math.hypot(controls[i].x - a.x - (b.x - a.x) * t, controls[i].y - a.y - (b.y - a.y) * t))
    }
    if (polygon - chord <= error && deviation <= tolerance) { length += (polygon + chord) / 2; samples.push({ t: hi, length }); return }
    const [left, right] = splitBezier(controls, .5), mid = (lo + hi) / 2
    visit(left, lo, mid, error / 2, depth + 1); visit(right, mid, hi, error / 2, depth + 1)
  }
  visit(points, 0, 1, tolerance, 0)
  return { length, samples }
}

/** Monotone bounded inverse; endpoints clamp to 0/1, duplicate zero-length
 * samples cannot divide by zero. Returned t evaluates on the original curve. */
export function parameterAtArcLength(table: BezierLengthTable, distance: number): number {
  if (distance <= 0) return 0
  if (distance >= table.length) return 1
  let lo = 0, hi = table.samples.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >>> 1; if (table.samples[mid].length < distance) lo = mid; else hi = mid }
  const a = table.samples[lo], b = table.samples[hi]
  return a.t + (b.t - a.t) * (distance - a.length) / Math.max(Number.EPSILON, b.length - a.length)
}
