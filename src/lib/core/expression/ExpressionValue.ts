import { isColorValue, parseAnimatableColor, type ColorValue } from '../../color/ColorValue'
import { isVec2, type Vec2 } from '../../geometry/CoordinateSystem'
import { checkNumericResult, type NumericConstraints } from './NumericResult'

export type ExpressionValue = number | boolean | string | ColorValue | Vec2
export type ExpressionValueType = 'number' | 'boolean' | 'string' | 'color' | 'vec2'
export const MAX_EXPRESSION_STRING = 4096

/** Classify bounded data-only expression values. Vector/color values have
 * exact canonical keys; functions, native objects, arrays, nonfinite numbers
 * and arbitrary object payloads are never a valid output. Units belong to the
 * typed field: vectors are explicit x/y; RGBA channels are unpremultiplied 0..255. */
export function expressionValueType(value: unknown): ExpressionValueType | null {
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : null
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string') return value.length <= MAX_EXPRESSION_STRING ? 'string' : null
  if (isColorValue(value) && Object.keys(value).length === 4 && Object.values(value).every(number => number >= 0 && number <= 255)) return 'color'
  if (isVec2(value) && Object.keys(value).length === 2) return 'vec2'
  return null
}

/** Validate field/config results through one strict typed contract. Valid CSS
 * colors normalize to RGBA; other families never coerce. Limits/options are
 * caller-owned source units, never inferred from UI step/presentation. */
export function validateExpressionResult(kind: ExpressionValueType, output: unknown, limits: NumericConstraints & { options?: readonly string[] } = {}): ExpressionValue {
  const normalized = kind === 'color' ? parseAnimatableColor(output) : output
  if (expressionValueType(normalized) !== kind) throw new Error('Expression must return ' + kind + '; scalar coercion is disabled.')
  if (kind === 'number') { const result = checkNumericResult(normalized as number, limits); if (result.error) throw new Error(result.error) }
  if (limits.options && !limits.options.includes(normalized as string)) throw new Error('Expression must return one of: ' + limits.options.join(', '))
  return normalized as ExpressionValue
}
