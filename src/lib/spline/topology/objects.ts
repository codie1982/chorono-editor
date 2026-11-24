import { deleteSplineEdges } from './edges'
import type { SplinePathData } from '../../types/spline'
import { translateSplineData } from '../geometry/translateSplineData'
import { appendSplineObjects } from '../creation/appendSplineObjects'
import { extractSplineObjects, removeSplineContours } from './records'
import { markEditedSubShapes } from './validation'
import { remapSplineData } from './remap'

/** Delete whole selected Objects, including every hole/contour. Root layer,
 * other Objects and source IDs survive even when the layer becomes empty. */
export function deleteSplineObjects(data: SplinePathData, ids: readonly string[]): SplinePathData {
  return removeSplineContours(data, new Set(ids.flatMap(id => data.subShapes[id]?.contourIds ?? [])))
}

/** Independent copies inside the same layer. New geometry IDs are reserved and
 * names are made distinct by the existing append helper. Offset is local px.
 * Geometry animation ownership is checked by the native command before entry. */
export function copySplineObjects(data: SplinePathData, ids: readonly string[], x = 20, y = 20) {
  if (![x, y].every(Number.isFinite)) throw new Error('Copy offset must be finite local pixels.')
  const copy = remapSplineData(extractSplineObjects(data, ids), data, true)
  return appendSplineObjects(data, markEditedSubShapes(copy.data, translateSplineData(copy.data, x, y)))
}

/** Copy directed edge runs into independent Objects in the same layer.
 * Unselected edges are cut only in the detached copy. Reuse the canonical
 * record remap, control translation and unique-name allocation. */
export function copySplineEdges(data: SplinePathData, ids: readonly string[], x = 20, y = 20) {
  if (![x, y].every(Number.isFinite)) throw new Error('Copy offset must be finite local pixels.')
  if (!ids.length || ids.some((id) => !data.segments[id])) throw new Error('Select existing spline edges.')
  const selected = new Set(ids)
  const runs = deleteSplineEdges(
    data,
    Object.keys(data.segments).filter((id) => !selected.has(id)),
  )
  const copy = remapSplineData(runs, data, true)
  return appendSplineObjects(data, translateSplineData(copy.data, x, y))
}
