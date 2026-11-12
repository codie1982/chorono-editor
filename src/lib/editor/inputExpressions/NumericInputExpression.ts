import { inputExpression, assertInputExpressions, type InputExpressions } from './InputExpression'
import { inspectExpression } from '../../core/expression/expressionEvaluator'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'
import type { Layer } from '../../types'
import { checkNumericResult, type NumericConstraints } from '../../core/expression/NumericResult'
export type { NumericConstraints } from '../../core/expression/NumericResult'

/** A1 stores a constant numeric formula beside its committed finite source
 * value. It is an editor authoring recipe, not a per-frame driver. No AST,
 * context handle or function is serialized. A2 owns future timed/dependent
 * expressions; this version never invents an implicit time/source variable. */
export interface NumericInputExpression { formula: string; value: number }
export type NumericInputExpressions = InputExpressions
const numberLiteral = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

/** Full-string finite decimal/scientific input. Reject partial parseFloat
 * acceptance and bounds violations without changing the last authored value. */
export function inspectNumericLiteral(text: string, limits: NumericConstraints = {}): { value: number | null; error: string | null } {
  const value = numberLiteral.test(text.trim()) ? Number(text) : NaN
  return checkNumericResult(value, limits, 'Enter a complete finite number.')
}
/** Reuse the bounded whitelist parser. pi/e are numeric constants, trigonometry
 * is in radians, and property units remain unchanged. No eval or JS execution. */
export function inspectNumericFormula(formula: string, limits: NumericConstraints = {}): { value: number | null; error: string | null } {
  const result = inspectExpression(formula, { pi: Math.PI, e: Math.E })
  return result.error ? result : checkNumericResult(result.value!, limits, 'The formula must return a finite number.')
}
/** Read a bounded own formula record. Changed source values are authoritative;
 * consumers report a stale recipe rather than reapplying over manual edits. */
export function numericInputExpression(layer: Layer, path: string): NumericInputExpression | undefined {
  const record = inputExpression(layer, path)
  return record && typeof record.value === 'number' && (!record.resultType || record.resultType === 'number') ? { formula: record.formula, value: record.value } : undefined
}
/** Data-shape validation only: opening a project executes no saved expressions.
 * Parser/evaluation diagnostics are shown when the individual editor opens.
 * Unknown envelope versions fail atomically; source payload stays untouched. */
export function assertNumericInputExpressions(layer: Layer): void {
  assertInputExpressions(layer)
}
