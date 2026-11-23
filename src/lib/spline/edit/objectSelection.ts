import type { SplinePathData } from '../../types/spline'
import { validateSplineBoundaryChange } from '../geometry/validateBoundaryChange'

/** Explicit whole-Object selection, including every owned contour/hole. No
 * selection-wide fallback; bounded native work refuses before geometry writes. */
export function splineObjectSelection(data: SplinePathData, ids: readonly string[]) {
  const selected = Array.from(new Set(ids))
  if (!selected.length || selected.some(id => !data.subShapes[id])) throw new Error('Select existing spline Objects first.')
  const contourIds = selected.flatMap(id => data.subShapes[id].contourIds), pointIds = contourIds.flatMap(id => data.contours[id].pointIds)
  if (pointIds.length > 2048 || contourIds.length > 64) throw new Error('Object edit budget exceeded; select fewer contours/points.')
  return { objectIds: selected, contourIds, pointIds }
}
/** Interactive native validation policy over the shared boundary checker.
 * Geometric source remains polynomial; sampling is only a topology diagnostic. */
export function validateSplineObjectEdit(before: SplinePathData, after: SplinePathData, ids: readonly string[], label: string): void {
  validateSplineBoundaryChange(before, after, ids, { label, maxCommands: 8192, maxContours: 128, maxVertices: 4096 })
}
