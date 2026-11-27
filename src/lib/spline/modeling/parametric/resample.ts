import type { SplinePathData } from '../../../types/spline'
import { splineInterpolationTolerance } from '../../sampling/interpolation'
import { SplineArcSampler } from './SplineArcSampler'
import { contourArcStops, replaceWithPolylines, samplingSelection, type PolylineVertex } from './polyline'

/** Source-local arc-length resampling into an EXPLICIT polyline. Spacing is the
 * maximum nominal arc interval; corners/endpoints/seam are pinned and adaptive
 * chord-error refinement may add vertices. Every output point is evaluated on
 * the original Bézier. The finite-chord control-hull bound is <= tolerance (or
 * a tighter authored Object preference). Refuse depth 16 / 8,192 stage vertices
 * / existing boundary budgets rather than silently loosening precision. Pure;
 * source curves/paint/TRS are retained by the owning modifier stack. */
export function resampleSplineObjects(data: SplinePathData, objectIds: readonly string[], spacingPx: number, tolerancePx: number): SplinePathData {
  if (!Number.isFinite(spacingPx) || spacingPx < .1 || spacingPx > 10000 || !Number.isFinite(tolerancePx) || tolerancePx < .01 || tolerancePx > 10) throw new Error('Resample needs spacing 0.1–10,000 and tolerance 0.01–10 local px.')
  const selection = samplingSelection(data, objectIds)
  const replacements = selection.contourIds.map(contourId => {
    const tolerance = splineInterpolationTolerance(data, contourId, tolerancePx), sampler = new SplineArcSampler(data, contourId, tolerance, selection.budget)
    const stops = contourArcStops(data, contourId, sampler, spacingPx, selection.sharp), vertices: PolylineVertex[] = []
    const append = (stop: typeof stops[number]) => {
      if (++selection.budget.vertices > 8193) throw new Error('Resample vertex budget exceeded. Increase spacing/tolerance.')
      vertices.push({ ...sampler.pointAt(stop.distance), ...(stop.id ? { id: stop.id } : {}) })
    }
    const interval = (a: typeof stops[number], b: typeof stops[number], depth: number) => {
      if (sampler.chordError(a.distance, b.distance) <= tolerance) { append(b); return }
      if (depth >= 16) throw new Error('Resample tolerance exceeds the refinement depth budget.')
      const mid = { distance: (a.distance + b.distance) / 2, pinned: false }
      interval(a, mid, depth + 1); interval(mid, b, depth + 1)
    }
    append(stops[0]); for (let i = 1; i < stops.length; i++) interval(stops[i - 1], stops[i], 0)
    if (data.contours[contourId].closed) vertices.pop()
    return { contourId, vertices }
  })
  return replaceWithPolylines(data, objectIds, replacements, 'Path Resample')
}
