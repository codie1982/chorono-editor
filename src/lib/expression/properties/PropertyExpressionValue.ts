import type { Layer } from '../../types'
import { validateExpressionResult, type ExpressionValue, type ExpressionValueType } from '../../core/expression/ExpressionValue'
import { propertyExpressionConstraints } from './PropertyExpressionCapability'
import { parseAnimatableColor, animatableColorToCss } from '../../color/ColorValue'
import type { NumericConstraints } from '../../core/expression/NumericResult'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'

/** Validate a result in the target's source units and select options. Colors
 * accept RGBA or supported CSS literals and normalize to RGBA 0..255 for frames.
 * Other families never coerce. Source representation conversion is separate. */
export function validatePropertyExpressionValue(layer: Layer, path: string, kind: ExpressionValueType, output: unknown,
  mode: 'constant' | 'live' = 'live', limits: NumericConstraints = {}): ExpressionValue {
  const capability = propertyExpressionConstraints(layer, path, kind, mode)
  return validateExpressionResult(kind, output, { min: Math.max(capability.min ?? -Infinity, limits.min ?? -Infinity),
    max: Math.min(capability.max ?? Infinity, limits.max ?? Infinity), options: capability.options })
}

/** Preserve the existing portable field representation: CSS colors stay
 * strings; canonical color data stays RGBA. Vector source writes keep point
 * IDs/type/handle metadata. No source mutation or IO is performed. */
export function expressionValueToSource(layer: Layer, path: string, value: ExpressionValue, kind: ExpressionValueType): unknown {
  const current = readPropertyPath(layer, path)
  if (kind === 'color') return typeof current === 'object' && current !== null ? { ...(parseAnimatableColor(value)!) } : animatableColorToCss(value)
  if (kind === 'vec2' && current && typeof current === 'object') return { ...current, ...(value as { x: number; y: number }) }
  return value
}
