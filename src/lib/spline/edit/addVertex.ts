import type { SplinePathData, SplinePointType } from '../../types/spline'
import { insertPointOnSegment } from './mutations'
import { copySplineTangents, pasteSplineTangents } from './tangents'
import { segmentControls } from '../corners/segmentGeometry'

export type SplineVertexType = 'preserve' | SplinePointType
/** Insert one interior anchor with a chosen tangent mode. Preserve (default)
 * reuses exact De Casteljau insertion without refitting. Smooth/Bezier Corner
 * retain the split handles, elevating quadratic neighbors exactly when needed.
 * Corner removes the new handles; mirrored Bezier uses the shorter handle on
 * both sides and may reshape the split edge. Existing anchors, unrelated curves
 * and layer transforms never move. Pure local-px records, fresh IDs only once.
 * Endpoint clicks, missing edges and invalid modes throw before source commit. */
export function addSplineVertex(data: SplinePathData, edgeId: string, t: number, pointType: SplineVertexType = 'preserve') {
  if (!data.segments[edgeId] || !Number.isFinite(t) || t <= 0 || t >= 1) throw new Error('Click inside an existing edge, away from its endpoints, to Add Vertex.')
  if (!['preserve', 'corner', 'smooth', 'bezier', 'bezierCorner'].includes(pointType)) throw new Error('Choose a valid new vertex type.')
  let next = insertPointOnSegment(data, edgeId, t)
  const pointId = Object.keys(next.points).find(id => !data.points[id])!, point = next.points[pointId]
  const edges = Object.values(next.segments).filter(edge => !data.segments[edge.id])
  if (pointType === 'corner') next = pasteSplineTangents(next, [pointId], { type: 'corner' })
  else if (pointType !== 'preserve') {
    const tangents = copySplineTangents(next, pointId)
    // Straight edges have no stored handles. Use their one-third chord controls
    // rather than the legacy point-type tool's arbitrary horizontal handles.
    for (const edge of edges) {
      const kind = edge.fromPointId === pointId ? 'out' : 'in'
      if (tangents[kind]) continue
      const controls = segmentControls(next, edge.id), neighbor = kind === 'out' ? controls.at(-1)! : controls[0]
      tangents[kind] = { x: (neighbor.x - point.x) / 3, y: (neighbor.y - point.y) / 3 }
    }
    tangents.type = pointType
    if (pointType === 'bezier') {
      const incoming = tangents.in!, outgoing = tangents.out!, inLength = Math.hypot(incoming.x, incoming.y), outLength = Math.hypot(outgoing.x, outgoing.y)
      const axis = outLength ? { x: outgoing.x / outLength, y: outgoing.y / outLength } : inLength ? { x: -incoming.x / inLength, y: -incoming.y / inLength } : { x: 0, y: 0 }
      const length = Math.min(inLength, outLength)
      tangents.in = { x: -axis.x * length, y: -axis.y * length }; tangents.out = { x: axis.x * length, y: axis.y * length }
    }
    next = pasteSplineTangents(next, [pointId], tangents)
  }
  return { data: next, pointId, edgeIds: edges.map(edge => edge.id) }
}
