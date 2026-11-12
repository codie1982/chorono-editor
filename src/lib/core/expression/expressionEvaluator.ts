import { parseExpression, type ExpressionAST } from './ExpressionSyntax'
import { evaluateTypedExpression } from './ExpressionInterpreter'
export { parseExpression, type ExpressionAST } from './ExpressionSyntax'
export { evaluateTypedExpression, type ExpressionScalar, type ExpressionEvaluationOptions } from './ExpressionInterpreter'
export { expressionValueType, type ExpressionValue, type ExpressionValueType } from './ExpressionValue'

/** Backward-compatible numeric entry point. Shares the typed interpreter but
 * refuses boolean output; existing numeric callers never receive a new type.
 * Numeric context, radians, finite intermediate values and budgets are unchanged. */
export function evaluateExpression(ast: ExpressionAST, context: Record<string, number>): number {
  const value = evaluateTypedExpression(ast, context)
  if (typeof value !== 'number') throw new Error('Expression must return a finite number')
  return value
}
/** Parse and evaluate one numeric expression with explicit context. */
export function evaluate(expr: string, context: Record<string, number>): number {
  return evaluateExpression(parseExpression(expr), context)
}
/** Numeric compatibility helper: any parse/type/domain failure returns null. */
export function safeEvaluate(expr: string, context: Record<string, number>): number | null {
  try { return evaluate(expr, context) } catch { return null }
}
/** Numeric UI/runtime validation: never fabricates a fallback or coerces bool. */
export function inspectExpression(expr: string, context: Record<string, number>): { value: number | null; error: string | null } {
  try { return { value: evaluate(expr, context), error: null } }
  catch (error) { return { value: null, error: error instanceof Error ? error.message : String(error) } }
}
