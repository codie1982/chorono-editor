import type { ParameterWire } from '../types'
import { expressionPrograms } from '../core/expression/ExpressionProgramCache'
import { evaluateExpression } from '../core/expression/expressionEvaluator'
import { clampWireValue } from './WireValidation'

/** Evaluate one legacy scalar Wire's already-resolved source using the canonical
 * cached whitelist program and clamp policy. No source lookup, scheduling,
 * mutation or fallback: callers own graph order and diagnostic attribution. */
export function evaluateWireExpression(wire: ParameterWire, source: number): number {
  const program = expressionPrograms.get(wire.expression)
  if (!program.ast) throw new Error(program.error ?? 'Invalid expression')
  return clampWireValue(evaluateExpression(program.ast, { source, s: source }), wire.clamp)
}
