import type { ExpressionAST } from './ExpressionSyntax'
import { callExpressionFunction } from './ExpressionFunctions'

export type ExpressionScalar = number | boolean
export interface ExpressionEvaluationOptions {
  /** Compatibility for legacy Wire ?: predicates only. New property formulas
   * require actual booleans; no general arithmetic/logical coercion is enabled. */
  legacyNumericConditions?: boolean
}

/** Require a finite number without JS truthiness/string/boolean coercion. */
function number(value: ExpressionScalar): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Expression requires a finite number')
  return value
}
/** Require an actual boolean, optionally adapting old Wire ternary predicates. */
function boolean(value: ExpressionScalar, legacy = false): boolean {
  if (typeof value === 'boolean') return value
  if (legacy) return number(value) !== 0
  throw new Error('Expression condition requires a boolean')
}

/** Interpret whitelist syntax against own typed context values. Arithmetic
 * and functions require finite numbers, relations compare numbers, equality
 * requires matching scalar types. &&/||/!/?: and if(test,a,b) require booleans;
 * logical and conditional branches short circuit and never run skipped errors.
 * One 1024-node/64-depth budget covers every executed path, including malformed
 * cyclic external ASTs. No mutation, host property access, IO or user code. */
export function evaluateTypedExpression(ast: ExpressionAST, context: Readonly<Record<string, ExpressionScalar>>, options: ExpressionEvaluationOptions = {}): ExpressionScalar {
  let remaining = 1024
  const condition = (value: ExpressionScalar) => boolean(value, options.legacyNumericConditions)
  const visit = (node: ExpressionAST | undefined, depth = 0): ExpressionScalar => {
    if (!node || --remaining < 0 || depth > 64) throw new Error('Expression evaluation limit exceeded')
    const value = run(node, depth)
    if (typeof value !== 'boolean' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Expression result must be a finite number or boolean')
    return value
  }
  const run = (node: ExpressionAST, depth: number): ExpressionScalar => {
    const child = (value: ExpressionAST | undefined) => visit(value, depth + 1)
    switch (node.type) {
      case 'Literal': return node.value ?? 0
      case 'Identifier':
        if (node.name && Object.prototype.hasOwnProperty.call(context, node.name)) return context[node.name]
        // V1 numeric source identifiers could be called true/false. Preserve
        // an explicitly bound own ref; otherwise these names are boolean constants.
        if (node.name === 'true' || node.name === 'false') return node.name === 'true'
        throw new Error('Undefined variable: ' + node.name)
      case 'ConditionalExpression': return child(condition(child(node.test)) ? node.consequent : node.alternate)
      case 'CallExpression': {
        const args = node.arguments ?? []
        if (node.name === 'if') {
          if (args.length !== 3) throw new Error('if expects 3 arguments')
          return child(condition(child(args[0])) ? args[1] : args[2])
        }
        return callExpressionFunction(node.name ?? '', args.map(arg => number(child(arg))))
      }
      case 'UnaryExpression': {
        const value = child(node.argument)
        if (node.operator === '!') return !boolean(value)
        if (node.operator === '+') return number(value)
        if (node.operator === '-') return -number(value)
        throw new Error('Unknown unary operator: ' + node.operator)
      }
      case 'BinaryExpression': {
        const left = child(node.left), op = node.operator
        if (op === '&&') return boolean(left) && boolean(child(node.right))
        if (op === '||') return boolean(left) || boolean(child(node.right))
        const right = child(node.right)
        if (['==', '===', '!=', '!=='].includes(op ?? '')) {
          if (typeof left !== typeof right) throw new Error('Equality requires matching scalar types')
          return op === '==' || op === '===' ? left === right : left !== right
        }
        const a = number(left), b = number(right)
        switch (op) {
          case '+': return a + b
          case '-': return a - b
          case '*': return a * b
          case '/': if (b === 0) throw new Error('Division by zero'); return a / b
          case '%': return a % b
          case '^': return Math.pow(a, b)
          case '<': return a < b
          case '>': return a > b
          case '<=': return a <= b
          case '>=': return a >= b
          default: throw new Error('Unknown operator: ' + op)
        }
      }
      default: throw new Error('Unknown AST node type')
    }
  }
  return visit(ast)
}
