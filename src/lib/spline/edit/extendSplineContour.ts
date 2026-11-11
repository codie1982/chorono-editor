import type { SplinePathData } from '@/lib/types/spline'
import { uid } from '../util/uid'

/** Find an editable open endpoint. Explicit points must be endpoints; without
 * a point, the last open contour's end is used. IDs/order are read, never
 * changed. Closed contours and locked endpoints cannot be continued. */
export function splineContinuation(data: SplinePathData, pointId?: string | null) {
  const contours = Object.values(data.contours)
  const contour = pointId ? contours.find(item => !item.closed && (item.pointIds[0] === pointId || item.pointIds.at(-1) === pointId))
    : contours.filter(item => !item.closed && item.pointIds.length).at(-1)
  const endpointId = pointId ?? contour?.pointIds.at(-1)
  const point = endpointId ? data.points[endpointId] : undefined
  if (!contour || !point || point.locked) return null
  return { contourId: contour.id, pointId: point.id, prepend: contour.pointIds[0] === point.id, point }
}

/** Extend one open contour with finite layer-local corner points. Existing
 * point/handle/segment IDs and all unrelated source records are preserved.
 * At the start, clicked points are prepended in reverse order so the existing
 * contour direction stays unchanged. New edges are straight lines. Optional
 * closure joins the resulting last/first points; no other contour is welded.
 * Pure conversion except allocating fresh IDs; callers own one undo command.
 */
export function extendSplineContour(data: SplinePathData, endpointId: string,
  positions: readonly { x: number; y: number }[], closed = false): SplinePathData {
  const endpoint = splineContinuation(data, endpointId)
  if (!endpoint) throw new Error('Choose an unlocked endpoint of an open spline.')
  if (!positions.length) return data
  if (positions.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Spline points must be finite local coordinates.')
  const contour = data.contours[endpoint.contourId]
  const points = { ...data.points }, segments = { ...data.segments }
  const added = positions.map(position => {
    const id = uid('pt'); points[id] = { ...position, id, type: 'corner' }; return id
  })
  const chain = endpoint.prepend ? [...added].reverse().concat(endpointId) : [endpointId, ...added]
  const edges = chain.slice(1).map((toPointId, index) => {
    const id = uid('seg'); segments[id] = { id, type: 'line', fromPointId: chain[index], toPointId }; return id
  })
  const pointIds = endpoint.prepend ? [...added].reverse().concat(contour.pointIds) : [...contour.pointIds, ...added]
  const segmentIds = endpoint.prepend ? [...edges, ...contour.segmentIds] : [...contour.segmentIds, ...edges]
  if (closed) {
    const id = uid('seg'); segments[id] = { id, type: 'line', fromPointId: pointIds.at(-1)!, toPointId: pointIds[0] }; segmentIds.push(id)
  }
  const subShapes = { ...data.subShapes }
  for (const shape of Object.values(subShapes)) if (shape.contourIds.includes(contour.id)) subShapes[shape.id] = { ...shape, source: 'edited', editable: true }
  return { ...data, points, segments, subShapes, contours: { ...data.contours, [contour.id]: { ...contour, pointIds, segmentIds, closed } } }
}
