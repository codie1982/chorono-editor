import type { SplinePathData } from '../../types/spline'
import type { Vec2 } from '../../geometry/CoordinateSystem'
import { segmentControls } from '../corners/segmentGeometry'

/** Boundary controls in the edited layer's local px. sourceEdgeId is set only
 * for this spline's own edges, so imported ID collisions cannot skip cutters. */
export interface SplineEdgeBoundary { key: string; sourceEdgeId?: string; controls: readonly Vec2[] }
/** Borrow normalized source controls without touching IDs or allocating source
 * records. Other layers' transformed boundaries may be appended by an adapter. */
export function splineEdgeBoundaries(data: SplinePathData): SplineEdgeBoundary[] {
  return Object.keys(data.segments).map(id => ({ key: id, sourceEdgeId: id, controls: segmentControls(data, id) }))
}
/** Validate bounded synchronous interaction workloads before pair searches.
 * Refuse a large edit instead of freezing the UI or silently omitting cutters. */
export function assertEdgeBoundaryBudget(boundaries: readonly SplineEdgeBoundary[], edges = 1): void {
  if (edges > 256 || boundaries.length > 2048 || edges * boundaries.length > 65536) throw new Error('Trim/Extend boundary budget exceeded; isolate a smaller set of visible splines.')
}

/** Select the terminal endpoint represented by an Edge pick. A one-edge open
 * contour uses the nearer parameter end; on longer contours only a terminal
 * edge is valid. Closed/interior edges refuse without changing geometry. */
export function splineExtendEndpoint(data: SplinePathData, edgeId: string, t = .5): string {
  const edge = data.segments[edgeId], contour = Object.values(data.contours).find(item => item.segmentIds.includes(edgeId))
  if (!edge || !contour || contour.closed) throw new Error('Extend needs a terminal edge of an open contour.')
  const start = contour.segmentIds[0] === edgeId, end = contour.segmentIds.at(-1) === edgeId
  if (!start && !end) throw new Error('Select a terminal edge near an open endpoint to Extend.')
  return start && (!end || t < .5) ? edge.fromPointId : edge.toPointId
}
