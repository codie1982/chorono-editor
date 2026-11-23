import type { SplinePathData } from '../../types/spline'
import { intersectBezierRay } from '../../geometry/bezier/intersections'
import { segmentControls } from '../corners/segmentGeometry'
import { extendSplineContour } from '../edit/extendSplineContour'
import { assertEdgeBoundaryBudget, splineEdgeBoundaries, splineExtendEndpoint } from './edgeBoundaries'

/** Extend the picked open endpoint along its terminal tangent to the nearest
 * strictly forward boundary. First non-coincident control gives the limiting
 * tangent even when the endpoint derivative is zero. Existing curve/anchors
 * stay intact; the existing continuation helper appends/prepends one straight
 * tangent edge. Never welds or changes the target boundary. Local-px ordering is
 * invariant under the layer's nonsingular affine transform. No hit returns source
 * identity/no Undo; closed/interior/zero tangent/overlap cases refuse explicitly. */
export function extendSplineToBoundary(data: SplinePathData, edgeId: string, t = .5, boundaries = splineEdgeBoundaries(data)): { data: SplinePathData; edgeIds: string[]; reason?: string } {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error('Extend pick parameter must be between 0 and 1.')
  const endpointId = splineExtendEndpoint(data, edgeId, t), controls = segmentControls(data, edgeId), start = data.segments[edgeId].fromPointId === endpointId
  const ordered = start ? controls : [...controls].reverse(), origin = ordered[0], neighbor = ordered.slice(1).find(p => Math.hypot(p.x - origin.x, p.y - origin.y) > 1e-10)
  if (!neighbor) throw new Error('The open endpoint has no usable terminal tangent.')
  assertEdgeBoundaryBudget(boundaries)
  const direction = { x: origin.x - neighbor.x, y: origin.y - neighbor.y }
  const hits = boundaries.filter(item => item.sourceEdgeId !== edgeId).flatMap(boundary => intersectBezierRay(origin, direction, boundary.controls))
  hits.sort((a, b) => a.distance - b.distance || a.t - b.t)
  if (!hits.length) return { data, edgeIds: [edgeId], reason: 'No forward intersection. The open endpoint was left unchanged.' }
  const next = extendSplineContour(data, endpointId, [hits[0].point])
  return { data: next, edgeIds: Object.keys(next.segments).filter(id => !data.segments[id]) }
}
