import type { Layer } from '../../types'
import { expressionValueType, type ExpressionValue, type ExpressionValueType } from '../../core/expression/ExpressionValue'
import { parseAnimatableColor } from '../../color/ColorValue'
import { isVec2 } from '../../geometry/CoordinateSystem'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'

/** Version-1 constant authoring recipe. Missing resultType retains the original
 * A1 finite-number meaning. Typed records store canonical applied values, not
 * AST/runtime frames. Manual source changes never cause automatic reapplication. */
export interface InputExpression { formula: string; value: ExpressionValue; resultType?: ExpressionValueType }
export interface InputExpressions { version: 1; fields: Record<string, InputExpression> }

/** Read an own record without guessing field identity from its displayed value. */
export function inputExpression(layer: Layer, path: string): InputExpression | undefined {
  const fields = layer.inputExpressions?.fields
  return fields && Object.hasOwn(fields, path) ? fields[path] : undefined
}
/** Normalize an authored representation only for recipe staleness comparisons.
 * Vector metadata is excluded; CSS/canonical color equivalents compare by RGBA. */
export function inputExpressionValue(value: unknown, kind: ExpressionValueType): unknown {
  if (kind === 'color') return parseAnimatableColor(value)
  if (kind === 'vec2' && isVec2(value)) return { x: value.x, y: value.y }
  return value
}
/** Constant data equality without source mutation or serialized frame caches. */
export function sameInputExpressionValue(a: unknown, b: unknown, kind: ExpressionValueType): boolean {
  const x = inputExpressionValue(a, kind), y = inputExpressionValue(b, kind)
  return Object.is(x, y) || !!x && !!y && typeof x === 'object' && typeof y === 'object'
    && Object.keys(x).length === Object.keys(y).length && Object.entries(x).every(([key, value]) => Object.hasOwn(y, key) && Object.is(value, (y as Record<string, unknown>)[key]))
}
/** Validate bounded metadata without evaluating saved programs during load or
 * Undo recovery. Unsupported versions/types/unsafe paths fail atomically. */
export function assertInputExpressions(layer: Layer): void {
  const input = layer.inputExpressions
  if (input === undefined) return
  if (!input || input.version !== 1 || !input.fields || typeof input.fields !== 'object' || Array.isArray(input.fields) || Object.keys(input.fields).length > 128) throw new Error('Invalid input expression envelope.')
  for (const [path, record] of Object.entries(input.fields)) {
    if (!path || path.length > 256 || !record || typeof record.formula !== 'string' || record.formula.length > 4096
      || expressionValueType(record.value) !== (record.resultType ?? 'number')) throw new Error('Invalid typed input formula.')
    readPropertyPath(layer, path)
  }
}
