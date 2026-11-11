import type { ParameterWire } from '../types'
import { expressionPrograms } from '../core/expression/ExpressionProgramCache'
import { evaluateTypedExpression, type ExpressionScalar } from '../core/expression/expressionEvaluator'
import { clampWireValue } from './WireValidation'

/** Evaluate one Wire's already-resolved legacy numeric source using the canonical
 * typed whitelist program and clamp policy. Declared boolean targets receive
 * actual booleans (numeric outputs adapt 0/nonzero); numeric targets stay strict.
 * Saved numeric ?: predicates use an explicit Wire-only compatibility option.
 * No source lookup, scheduling,
 * mutation or fallback: callers own graph order and diagnostic attribution. */
export function evaluateWireExpression(wire: ParameterWire, source: number): ExpressionScalar {
  const program = expressionPrograms.get(wire.expression)
  if (!program.ast) throw new Error(program.error ?? 'Invalid expression')
  const value = evaluateTypedExpression(program.ast, { source, s: source }, { legacyNumericConditions: true })
  if (wire.target.valueType === 'boolean') return typeof value === 'boolean' ? value : clampWireValue(value, wire.clamp) !== 0
  if (typeof value !== 'number') throw new Error('Numeric Wire target requires a finite number; select numeric branches explicitly.')
  return clampWireValue(value, wire.clamp)
}
