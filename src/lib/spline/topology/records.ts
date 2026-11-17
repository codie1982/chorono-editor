import type { SplinePathData } from '../../types/spline'

/** Keep the supplied contour graph and derive its live records/owners. Empty
 * owners disappear; dangling points, handles and segments are not retained.
 * IDs and record identity of surviving geometry are preserved. Callers provide
 * ordered, connected contours and validate the result before committing. */
export function retainSplineContours(data: SplinePathData, contours: SplinePathData['contours']): SplinePathData {
  const pointIds = new Set(Object.values(contours).flatMap(contour => contour.pointIds))
  const segmentIds = new Set(Object.values(contours).flatMap(contour => contour.segmentIds))
  const subShapes = Object.fromEntries(Object.values(data.subShapes).flatMap(object => {
    const contourIds = object.contourIds.filter(id => contours[id])
    return contourIds.length ? [[object.id, contourIds.length === object.contourIds.length ? object : { ...object, contourIds }]] : []
  }))
  return { ...data, contours, subShapes,
    points: Object.fromEntries(Object.entries(data.points).filter(([id]) => pointIds.has(id))),
    segments: Object.fromEntries(Object.entries(data.segments).filter(([id]) => segmentIds.has(id))),
    handles: Object.fromEntries(Object.entries(data.handles).filter(([, handle]) => pointIds.has(handle.pointId))),
  }
}

/** Remove explicit contours, preserving all unrelated IDs and empty-layer
 * validity. Shared/orphan input must be rejected by the owning validator. */
export function removeSplineContours(data: SplinePathData, ids: ReadonlySet<string>): SplinePathData {
  if (!Array.from(ids).some(id => data.contours[id])) return data
  return retainSplineContours(data, Object.fromEntries(Object.entries(data.contours).filter(([id]) => !ids.has(id))))
}

/** Borrow a detached, self-contained subset of whole Objects, including holes.
 * Empty selection returns valid empty records; unknown IDs refuse explicitly. */
export function extractSplineObjects(data: SplinePathData, ids: readonly string[]): SplinePathData {
  for (const id of ids) if (!Object.hasOwn(data.subShapes, id)) throw new Error('A selected spline object no longer exists.')
  const selected = new Set(ids), contours = new Set(ids.flatMap(id => data.subShapes[id].contourIds))
  return retainSplineContours({ ...data, subShapes: Object.fromEntries(Object.entries(data.subShapes).filter(([id]) => selected.has(id))) },
    Object.fromEntries(Object.entries(data.contours).filter(([id]) => contours.has(id))))
}
