import type { ChronoScene, Layer } from '../../types'
import type { NumericConstraints } from '../../core/expression/NumericResult'
import { assertExpressionTarget } from './ExpressionAuthoringGuard'
import { makeInputExpressionCommand } from './InputExpressionCommand'
export { inputExpressionBlock as numericExpressionBlock } from './ExpressionAuthoringGuard'

/** Compatibility entry point for existing numeric inspector callers. */
export function numericExpressionConstraints(layer: Layer, path: string): NumericConstraints {
  return assertExpressionTarget(layer, path, 'number')
}
/** Preserve A1's public arguments and limits through the single typed source
 * command implementation. Numeric record shape and exact source CAS stay valid. */
export function makeNumericExpressionCommand(expected: ChronoScene, layerId: string, path: string, formula: string | null, limits: NumericConstraints = {}) {
  return makeInputExpressionCommand(expected, layerId, path, formula, 'number', limits)
}
