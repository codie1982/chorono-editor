import type { SplineInterpolation, SplinePathData } from '../../types/spline'

export const SPLINE_INTERPOLATION_LIMITS = { min: .01, max: 10, defaultTolerancePx: .25 } as const

/** Validate the versioned portable Object preference without coercion. Missing
 * settings are handled by callers; malformed supplied records always refuse. */
export function assertSplineInterpolation(value: unknown): asserts value is SplineInterpolation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid spline interpolation settings.')
  const record = value as Record<string, unknown>
  if (record.version !== 1 || typeof record.tolerancePx !== 'number' || !Number.isFinite(record.tolerancePx)
    || record.tolerancePx < SPLINE_INTERPOLATION_LIMITS.min || record.tolerancePx > SPLINE_INTERPOLATION_LIMITS.max
    || Object.keys(record).some(key => !['version', 'tolerancePx'].includes(key))) throw new Error('Spline interpolation requires version 1 and tolerance 0.01–10 local px.')
}

/** Resolve one owned contour's optional preference. Coordinates/tolerance stay
 * in source-local px; this is not a picking radius or viewport-zoom setting. */
export function splineContourInterpolation(data: SplinePathData, contourId: string): SplineInterpolation | undefined {
  const value = Object.values(data.subShapes).find(object => object.contourIds.includes(contourId))?.interpolation
  if (value !== undefined) assertSplineInterpolation(value)
  return value
}

/** Resolve adaptive precision. A caller's maximum deviation is a ceiling:
 * Objects may request finer sampling, never weaken a conversion/solver bound.
 * With no authored value, preserve the supplied legacy ceiling or .25 local px.
 * Exact render paths and explicit solver tolerances need no sampling override. */
export function splineInterpolationTolerance(data: SplinePathData, contourId: string, ceilingPx?: number): number {
  if (ceilingPx !== undefined && (!Number.isFinite(ceilingPx) || ceilingPx <= 0)) throw new Error('Spline sampling tolerance must be finite positive local px.')
  const configured = splineContourInterpolation(data, contourId)?.tolerancePx
  return Math.min(configured ?? ceilingPx ?? SPLINE_INTERPOLATION_LIMITS.defaultTolerancePx, ceilingPx ?? Infinity)
}
