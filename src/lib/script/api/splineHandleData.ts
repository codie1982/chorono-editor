import type { SplinePathData, SplinePointType } from '@/lib/types/spline'
import { assertSplineTopology as validateSplineTopology } from '@/lib/spline/topology'
import { assertSafeScriptData } from './scriptData'

export const POINT_TYPES: readonly SplinePointType[] = ['corner', 'smooth', 'bezier', 'bezierCorner']
export const finiteCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
export function assertCoordinates(...values: unknown[]): void {
  if (!values.every(finiteCoordinate)) throw new Error('Spline coordinates must be finite numbers.')
}
export function assertPointType(type: unknown): asserts type is SplinePointType {
  if (!POINT_TYPES.includes(type as SplinePointType)) throw new Error('Unknown spline point type.')
}
export function assertBoolean(value: unknown): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error('Expected a boolean spline option.')
}

/** Script boundary additionally excludes unsafe host data, then delegates to
 * the same normalized validator used by native topology commands. */
export function assertSplineTopology(data: SplinePathData): void {
  assertSafeScriptData(data)
  validateSplineTopology(data)
}
export { assertSplineLocks, markEditedSubShapes } from '@/lib/spline/topology'
