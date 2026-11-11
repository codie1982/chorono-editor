import { inspectExpression } from '../../core/expression/expressionEvaluator'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'
import type { Layer } from '../../types'

/** A1 stores a constant numeric formula beside its committed finite source
 * value. It is an editor authoring recipe, not a per-frame driver. No AST,
 * context handle or function is serialized. A2 owns future timed/dependent
 * expressions; this version never invents an implicit time/source variable. */
export interface NumericInputExpression { formula: string; value: number }
export interface NumericInputExpressions { version: 1; fields: Record<string, NumericInputExpression> }
export interface NumericConstraints { min?: number; max?: number }
const numberLiteral = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

/** Full-string finite decimal/scientific input. Reject partial parseFloat
 * acceptance and bounds violations without changing the last authored value. */
export function inspectNumericLiteral(text: string, limits: NumericConstraints = {}): { value: number | null; error: string | null } {
  const value = numberLiteral.test(text.trim()) ? Number(text) : NaN
  return checked(value, limits, 'Enter a complete finite number.')
}
/** Reuse the bounded whitelist parser. pi/e are numeric constants, trigonometry
 * is in radians, and property units remain unchanged. No eval or JS execution. */
export function inspectNumericFormula(formula: string, limits: NumericConstraints = {}): { value: number | null; error: string | null } {
  const result = inspectExpression(formula, { pi: Math.PI, e: Math.E })
  return result.error ? result : checked(result.value!, limits, 'The formula must return a finite number.')
}
/** Validate a scalar against the owning field's inclusive bounds. */
function checked(value: number, limits: NumericConstraints, invalid: string) {
  const error = !Number.isFinite(value) ? invalid : value < (limits.min ?? -Infinity) ? `Minimum is ${limits.min}.`
    : value > (limits.max ?? Infinity) ? `Maximum is ${limits.max}.` : null
  return { value: error ? null : value, error }
}
/** Read a bounded own formula record. Changed source values are authoritative;
 * consumers report a stale recipe rather than reapplying over manual edits. */
export function numericInputExpression(layer: Layer, path: string): NumericInputExpression | undefined {
  const fields = layer.inputExpressions?.fields
  return fields && Object.prototype.hasOwnProperty.call(fields, path) ? fields[path] : undefined
}
/** Data-shape validation only: opening a project executes no saved expressions.
 * Parser/evaluation diagnostics are shown when the individual editor opens.
 * Unknown envelope versions fail atomically; source payload stays untouched. */
export function assertNumericInputExpressions(layer: Layer): void {
  const input = layer.inputExpressions
  if (input === undefined) return
  if (!input || input.version !== 1 || !input.fields || typeof input.fields !== 'object' || Array.isArray(input.fields)
    || Object.keys(input.fields).length > 128) throw new Error('Invalid numeric input expression envelope.')
  for (const [path, record] of Object.entries(input.fields)) {
    if (path.length > 256 || !path || !record || typeof record.formula !== 'string' || record.formula.length > 4096 || !Number.isFinite(record.value)) throw new Error('Invalid numeric input formula.')
    readPropertyPath(layer, path)
  }
}
