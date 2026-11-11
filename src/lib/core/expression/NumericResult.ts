/** Inclusive source-unit numeric bounds. Undefined means unbounded. */
export interface NumericConstraints { min?: number; max?: number }

/** Reject finite/bounds errors without clamping or mutating source. Shared by
 * literal inputs, constant formulas and live numeric drivers. */
export function checkNumericResult(value: number, limits: NumericConstraints = {}, invalid = 'The formula must return a finite number.'): { value: number | null; error: string | null } {
  const error = !Number.isFinite(value) ? invalid : value < (limits.min ?? -Infinity) ? 'Minimum is ' + limits.min + '.'
    : value > (limits.max ?? Infinity) ? 'Maximum is ' + limits.max + '.' : null
  return { value: error ? null : value, error }
}
