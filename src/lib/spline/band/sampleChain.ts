import type { SplinePathData } from '../../types/spline'
import type { Vec2 } from '../../geometry/CoordinateSystem'
import { SplineArcSampler, type SplineSamplingBudget } from '../modeling/parametric/SplineArcSampler'
import type { BandChain, SplineBandSettings } from './types'

/** Isolated arc lookup over precisely the selected directed edges. This
 * ephemeral contour view borrows source records, never writes persistent IDs. */
export function chainSampler(data: SplinePathData, chain: BandChain, settings: SplineBandSettings, budget: SplineSamplingBudget) {
  const view = chainContourView(data, chain)
  return new SplineArcSampler(view, chain.contourId, settings.tolerancePx, budget)
}

/** Read-only single-contour view of the selected directed run for sampling
 * and Offset. Retains the original controls and segment order across seams. */
export function chainContourView(data: SplinePathData, chain: BandChain): SplinePathData {
  const pointIds = chain.edgeIds.map(id => data.segments[id].fromPointId)
  if (!chain.closed) pointIds.push(data.segments[chain.edgeIds.at(-1)!].toPointId)
  return { ...data, contours: { ...data.contours, [chain.contourId]: { id: chain.contourId, closed: chain.closed, pointIds, segmentIds: chain.edgeIds } } }
}

/** Exact source-curve positions at arc-distance dash cuts and pinned anchors.
 * Adaptive chord and offset-normal bounds share the existing Bézier sampler;
 * maximum spacing adds uniform detail, with extra stops near original corners.
 * Output is a tolerance-bounded polyline, NOT an exact offset Bézier. Each
 * stage owns a 4096-point budget and recursive depth limit 24. */
export function sampleBandChain(sampler: SplineArcSampler, from: number, to: number, closed: boolean, settings: SplineBandSettings, budget: SplineSamplingBudget): Vec2[] {
  const length = sampler.length, wrap = (d: number) => d < 0 ? d + length : d > length ? d - length : d
  const point = (d: number) => sampler.pointAt(wrap(d))
  const stops = [from, to]
  for (const shift of [-length, 0, length]) for (const anchor of [...sampler.anchors, { distance: length, id: '' }]) {
    const d = anchor.distance + shift
    if (d > from && d < to) stops.push(d)
    for (const extra of [-settings.spacingPx / 4, settings.spacingPx / 4]) if (d + extra > from && d + extra < to) stops.push(d + extra)
  }
  stops.sort((a, b) => a - b)
  const points: Vec2[] = []
  const add = (d: number) => {
    const p = point(d), last = points.at(-1)
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1e-10) return
    if (++budget.vertices > 4096) throw new Error('Outline sampling budget exceeded. Increase spacing/tolerance or select fewer edges.')
    points.push(p)
  }
  const sample = (a: number, b: number, depth = 0): void => {
    // Seam is explicitly pinned, so each interval lies inside one contour lap.
    const shift = a < 0 && b <= 0 ? length : a >= length ? -length : 0
    const lo = a + shift, hi = b + shift
    if (b - a <= settings.spacingPx && sampler.chordError(lo, hi) <= settings.tolerancePx / 4
      && sampler.normalFits(lo, hi, settings.alignment === 'center' ? settings.widthPx / 2 : settings.widthPx, settings.tolerancePx / 2)) { add(b); return }
    if (depth >= 24) throw new Error('Outline curve subdivision limit exceeded; regularize cusp geometry.')
    const mid = (a + b) / 2; sample(a, mid, depth + 1); sample(mid, b, depth + 1)
  }
  add(from)
  for (let i = 1; i < stops.length; i++) if (stops[i] - stops[i - 1] > 1e-10) sample(stops[i - 1], stops[i])
  if (closed && points.length > 1) points.pop()
  return points
}
