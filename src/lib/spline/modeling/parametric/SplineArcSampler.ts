import type { SplinePathData } from '../../../types/spline'
import type { Vec2 } from '../../../geometry/CoordinateSystem'
import { bezierLengthTable, parameterAtArcLength, type BezierLengthTable } from '../../../geometry/bezier/arcLength'
import { evaluateBezier, trimBezier } from '../../../geometry/bezier/curves'
import { bezierJet } from '../../../geometry/bezier/derivatives'
import { distToSegmentSq } from '../../../geometry/segmentDistance'
import { normalConeFits } from '../../../geometry/bezier/normalConeFits'
import { segmentControls } from '../../corners'

export interface SplineSamplingBudget { vertices: number; lengthSamples: number }
interface Edge { controls: Vec2[]; table: BezierLengthTable; start: number; end: number }

/** Temporary source-local arc lookup shared by Resample and Zig Zag. Borrows
 * normalized source only at construction; owns detached controls/length tables,
 * never caches scene objects or serializes them. Length error over the contour
 * is <= tolerance/16 via existing bounded adaptive Bézier tables. Inverse lookup
 * evaluates the ORIGINAL curve, not a flattened substitute. A shared stage
 * budget caps stored length samples at 262,144; zero-length edges refuse.
 * Public positions/tangents are detached. No source, IDs or transforms change. */
export class SplineArcSampler {
  private readonly edges: Edge[] = []
  private readonly stops: { distance: number; id: string }[] = []
  private readonly total: number
  constructor(data: SplinePathData, contourId: string, tolerance: number, budget: SplineSamplingBudget) {
    const contour = data.contours[contourId]
    let length = 0
    for (const id of contour.segmentIds) {
      const controls = segmentControls(data, id)
      const table = bezierLengthTable(controls, Math.min(.0025, tolerance / (8 * contour.segmentIds.length)))
      budget.lengthSamples += table.samples.length
      if (budget.lengthSamples > 262144) throw new Error('Spline modifier arc-length budget exceeded. Increase tolerance or select fewer Objects.')
      if (table.length <= 1e-8) throw new Error('Zero-length edges cannot be resampled.')
      this.stops.push({ distance: length, id: data.segments[id].fromPointId })
      this.edges.push({ controls, table, start: length, end: length + table.length }); length += table.length
    }
    if (!contour.closed) this.stops.push({ distance: length, id: contour.pointIds.at(-1)! })
    this.total = length
  }
  get length(): number { return this.total }
  get anchors(): readonly Readonly<{ distance: number; id: string }>[] { return this.stops }
  /** Binary search in contour arc order, clamped at exact open/closed ends. */
  private locate(distance: number) {
    const d = Math.max(0, Math.min(this.total, distance)); let lo = 0, hi = this.edges.length - 1
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (d >= this.edges[mid].end) lo = mid + 1; else hi = mid }
    const edge = this.edges[lo]
    return { index: lo, edge, t: parameterAtArcLength(edge.table, d - edge.start) }
  }
  pointAt(distance: number): Vec2 { const { edge, t } = this.locate(distance); return evaluateBezier(edge.controls, t) }
  /** Left contour normal; sharp corners are pinned rather than displaced. A
   * stationary derivative uses the edge's endpoint chord, or refuses a cusp. */
  normalAt(distance: number): Vec2 {
    const { edge, t } = this.locate(distance), derivative = bezierJet(edge.controls, t).first
    const last = edge.controls.at(-1)!, first = edge.controls[0]
    const v = Math.hypot(derivative.x, derivative.y) > 1e-8 ? derivative : { x: last.x - first.x, y: last.y - first.y }
    const length = Math.hypot(v.x, v.y)
    if (length <= 1e-8) throw new Error('Zig Zag needs a regular path tangent.')
    return { x: -v.y / length, y: v.x / length }
  }
  /** Bound normal-displacement error over one source-edge interval. The band
   * sampler pins every original anchor, then subdivides until both this cone
   * and chordError pass. Same derivative-cone contract as path flattening. */
  normalFits(from: number, to: number, distance: number, tolerance: number): boolean {
    const start = this.locate(from), end = this.locate(to)
    for (let i = start.index; i <= end.index; i++) {
      const edge = this.edges[i], lo = i === start.index ? start.t : 0, hi = i === end.index ? end.t : 1
      if (hi > lo && !normalConeFits(trimBezier(edge.controls, lo, hi), distance, tolerance)) return false
    }
    return true
  }
  /** Convex-hull bound for EVERY source point between two arc positions against
   * their finite output chord. Covers multiple source edges and collinear
   * overshoot. Existing exact subcurve/finite-segment math is authoritative. */
  chordError(from: number, to: number): number {
    const a = this.pointAt(from), b = this.pointAt(to), start = this.locate(from), end = this.locate(to)
    let error = 0
    for (let i = start.index; i <= end.index; i++) {
      const edge = this.edges[i], lo = i === start.index ? start.t : 0, hi = i === end.index ? end.t : 1
      if (hi <= lo) continue
      for (const point of trimBezier(edge.controls, lo, hi)) error = Math.max(error, Math.sqrt(distToSegmentSq(point.x, point.y, a.x, a.y, b.x, b.y).dSq))
    }
    return error
  }
}
