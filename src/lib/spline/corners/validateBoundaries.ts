import type { SplinePathData } from '../../types/spline'
import { validateSplineBoundaryChange } from '../geometry/validateBoundaryChange'
import type { Matrix2D } from '../../geometry/Matrix2D'
import { CORNER_LIMITS as limits } from './types'

/** Validate all boundaries of each affected Object, including unselected holes.
 * Curves are sampled only for intersection/winding validation at 0.01 world px;
 * returned source remains exact Bézier. Bounded O(vertices²) work belongs in
 * the CPU worker. Distinct Objects may intentionally overlap each other.
 * Reject unsupported self-contact and changed hole parents/winding/roles. */
export function validateCornerBoundaries(before: SplinePathData, after: SplinePathData, selected: ReadonlySet<string>, matrix: Matrix2D, label: string): void {
  const ids = Object.values(before.subShapes).filter(object => object.contourIds.some(id => before.contours[id].pointIds.some(point => selected.has(point)))).map(object => object.id)
  validateSplineBoundaryChange(before, after, ids, { label, matrix, maxCommands: limits.commands, maxContours: limits.contours * 2, maxVertices: limits.validationVertices })
}
