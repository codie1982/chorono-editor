import type { SplinePathData } from '../../../types/spline'
import { SplineArcSampler } from './SplineArcSampler'
import { contourArcStops, replaceWithPolylines, samplingSelection } from './polyline'

/** Static sharp Zig Zag. Consecutive interior arc stops alternate +/- amplitude
 * along the contour's left normal. Source corners, seam and open endpoints are
 * pinned at zero displacement; each pinned span restarts positive. Peak spacing
 * is a maximum and is evenly distributed within each span. Local px, explicit
 * polyline, common arc tables/ownership/lock/boundary budgets. Amplitude zero is
 * an identity, never an implicit resample; crossings/invalid holes refuse. */
export function zigZagSplineObjects(data: SplinePathData, objectIds: readonly string[], amplitudePx: number, spacingPx: number): SplinePathData {
  if (!Number.isFinite(amplitudePx) || amplitudePx < 0 || amplitudePx > 10000 || !Number.isFinite(spacingPx) || spacingPx < .1 || spacingPx > 10000) throw new Error('Zig Zag needs amplitude 0–10,000 and spacing 0.1–10,000 local px.')
  const selection = samplingSelection(data, objectIds)
  if (!amplitudePx) return data
  const replacements = selection.contourIds.map(contourId => {
    const sampler = new SplineArcSampler(data, contourId, .25, selection.budget), stops = contourArcStops(data, contourId, sampler, spacingPx, selection.sharp, 2)
    let sign = 1
    const vertices = stops.map(stop => {
      if (++selection.budget.vertices > 8193) throw new Error('Zig Zag vertex budget exceeded. Increase peak spacing.')
      const point = sampler.pointAt(stop.distance)
      if (stop.pinned) { sign = 1; return { ...point, id: stop.id } }
      const normal = sampler.normalAt(stop.distance), offset = sign * amplitudePx; sign *= -1
      return { x: point.x + normal.x * offset, y: point.y + normal.y * offset }
    })
    if (data.contours[contourId].closed) vertices.pop()
    return { contourId, vertices }
  })
  return replaceWithPolylines(data, objectIds, replacements, 'Zig Zag')
}
