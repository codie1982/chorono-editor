import { validateCornerBoundaries } from '../corners/validateBoundaries'
import type { SplinePathData } from '../../types/spline'
import type { Matrix2D } from '../../geometry/Matrix2D'
/** Compatibility adapter retaining Chamfer diagnostics and validation units. */
export function validateChamferBoundaries(before: SplinePathData, after: SplinePathData, selected: ReadonlySet<string>, matrix: Matrix2D): void {
  validateCornerBoundaries(before, after, selected, matrix, 'Chamfer')
}
