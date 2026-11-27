import type { SplinePathData } from '../../types/spline'
import type { Matrix2D } from '../../geometry/Matrix2D'
import { splineContinuation } from '../edit/extendSplineContour'
import { moveSplinePoint, reverseContour, setContourClosed } from '../edit/mutations'
import { uid } from '../util/uid'

/** Join two explicitly selected open endpoints. Connect adds a straight bridge;
 * Weld keeps the FIRST selected anchor ID/position and merges the second only
 * within tolerancePx measured in composition space (never zoom/FPS-dependent).
 * Existing curves retain their edge IDs and tangents. Weld transfers the
 * outgoing handle from the second endpoint, making the joint bezierCorner.
 * Same-contour endpoints close it. Different Objects merge under the first
 * selected endpoint's owner; cross-Object multi-contour/holes are rejected
 * because changing their fill ownership is ambiguous. No branching graphs.
 * Source locks/drivers/references are validated by the owning native command. */
export function connectSplineEndpoints(data: SplinePathData, firstId: string, secondId: string,
  options: { weld?: boolean; tolerancePx?: number; localToComposition?: Matrix2D } = {}): SplinePathData {
  if (firstId === secondId) throw new Error('Select two different open endpoints.')
  const a = splineContinuation(data, firstId), b = splineContinuation(data, secondId)
  if (!a || !b) throw new Error('Select exactly two unlocked endpoints of open contours.')
  const tolerance = options.tolerancePx ?? 5
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('Weld tolerance must be nonnegative composition pixels.')
  const worldA = options.localToComposition?.applyToPoint(a.point) ?? a.point, worldB = options.localToComposition?.applyToPoint(b.point) ?? b.point
  if (options.weld && Math.hypot(worldA.x - worldB.x, worldA.y - worldB.y) > tolerance) throw new Error('Selected endpoints are outside the Weld tolerance. Increase it or use Connect.')
  if (a.contourId === b.contourId && !options.weld) return setContourClosed(data, a.contourId, true)
  if (a.contourId === b.contourId && data.contours[a.contourId].pointIds.length < 3) throw new Error('Weld would leave fewer than two anchors.')
  const ownerA = Object.values(data.subShapes).find(object => object.contourIds.includes(a.contourId))!
  const ownerB = Object.values(data.subShapes).find(object => object.contourIds.includes(b.contourId))!
  if (!ownerA || !ownerB) throw new Error('Spline endpoints need valid Object ownership.')
  if (ownerA.id !== ownerB.id && (ownerA.contourIds.length !== 1 || ownerB.contourIds.length !== 1)) throw new Error('Connect/Weld across Objects requires single-contour Objects. Keep hole ownership explicit.')
  let next = a.prepend ? reverseContour(data, a.contourId) : data
  if (a.contourId !== b.contourId && !b.prepend) next = reverseContour(next, b.contourId)
  const left = next.contours[a.contourId], right = next.contours[b.contourId]
  const points = { ...next.points }, handles = { ...next.handles }, segments = { ...next.segments }, contours = { ...next.contours }, subShapes = { ...next.subShapes }
  const same = left.id === right.id
  if (options.weld) {
    next = moveSplinePoint(next, secondId, a.point.x, a.point.y)
    for (const handle of Object.values(next.handles)) {
      if (handle.pointId === firstId && handle.kind === 'out' || handle.pointId === secondId) delete handles[handle.id]
      if (handle.pointId === secondId && handle.kind === 'out') handles[handle.id] = { ...handle, pointId: firstId }
    }
    points[firstId] = { ...points[firstId], type: 'bezierCorner' }; delete points[secondId]
    for (const edge of Object.values(segments)) if (edge.fromPointId === secondId || edge.toPointId === secondId) segments[edge.id] = {
      ...edge, fromPointId: edge.fromPointId === secondId ? firstId : edge.fromPointId, toPointId: edge.toPointId === secondId ? firstId : edge.toPointId,
    }
    // Quadratic controls stay explicit; moving an endpoint does not translate
    // its edge control, matching the existing point-move contract.
    contours[left.id] = { ...left, closed: same, pointIds: same ? [firstId, ...left.pointIds.slice(1, -1)] : [...left.pointIds, ...right.pointIds.slice(1)],
      segmentIds: same ? left.segmentIds : [...left.segmentIds, ...right.segmentIds] }
  } else {
    const id = uid('seg'); segments[id] = { id, type: 'line', fromPointId: firstId, toPointId: secondId }
    contours[left.id] = { ...left, pointIds: [...left.pointIds, ...right.pointIds], segmentIds: [...left.segmentIds, id, ...right.segmentIds] }
  }
  if (!same) {
    delete contours[right.id]
    subShapes[ownerA.id] = { ...ownerA, contourIds: ownerA.contourIds.filter(id => id !== right.id) }
    if (ownerA.id !== ownerB.id) delete subShapes[ownerB.id]
  }
  return { ...next, points, handles, segments, contours, subShapes }
}
