import type { SplinePathData } from '../../types/spline'
import { resetSplineTangents } from './tangents'
import { splineObjectSelection, validateSplineObjectEdit } from './objectSelection'

/** Smooth selected Objects by recomputing collinear, independent-length handles
 * from neighboring anchors. Anchors, contour connectivity, unrelated Objects,
 * layer TRS and origin never move. Corner/mirror points become Smooth; original
 * IDs are retained and quadratic/line edges promote through existing tangent
 * editing. Hole/winding changes and ambiguous boundaries refuse atomically.
 * Pure local-px source; applying an already-identical result is a no-op. */
export function smoothSplineObjects(data: SplinePathData, objectIds: readonly string[]): SplinePathData {
  const selected = splineObjectSelection(data, objectIds), points = { ...data.points }
  let changed = false
  for (const id of selected.pointIds) if (points[id].type !== 'smooth') { points[id] = { ...points[id], type: 'smooth' }; changed = true }
  const typed = changed ? { ...data, points } : data
  const next = resetSplineTangents(typed, selected.pointIds)
  if (next !== data) validateSplineObjectEdit(data, next, selected.objectIds, 'Smooth')
  return next
}
