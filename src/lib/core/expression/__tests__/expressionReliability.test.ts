import { describe, expect, it } from 'vitest'
import { evaluate, safeEvaluate, inspectExpression, evaluateExpression, type ExpressionAST } from '../expressionEvaluator'

describe('expression arithmetic and bounded failures', () => {
  it.each([
    ['2+3', 5], ['2-3', -1], ['2+-3', -1], ['2--3', 5], ['1e-3+2E+2', 200.001],
    ['.5+.25', .75], ['2^3^2', 512], ['-2^2', -4], ['(-2)^2', 4], ['2^-2', .25],
    ['1+2*3^2', 19], ['sin(2*source)', Math.sin(1)], ['max(1,2,3)', 3], ['min(7)', 7],
  ])('evaluates %s consistently without whitespace', (expression, expected) => {
    expect(evaluate(expression, { source: .5 })).toBeCloseTo(expected, 10)
  })
  it.each(['.', '1e-', '1e+3.4', 'sin()', 'sin(1,2)', 'map(1,2)', 'min()', 'unknown(1)', 'x+1',
    '1/0', '1%0', 'sqrt(-1)', 'acos(2)', '1e309', '1e308*1e308', 'toString(1)', 'constructor(1)', 'sin(2x)'])
  ('rejects %s with a reason and no non-finite fallback', expression => {
    expect(inspectExpression(expression, { source: 1 }).error).toBeTruthy()
    expect(safeEvaluate(expression, { source: 1 })).toBeNull()
  })
  it('rejects inherited context identifiers and non-finite input', () => {
    expect(safeEvaluate('source', Object.create({ source: 1 }))).toBeNull()
    expect(safeEvaluate('source', { source: Infinity })).toBeNull()
  })
  it('bounds text, nested input and cyclic externally supplied ASTs', () => {
    for (const expression of ['1'.repeat(4097), '('.repeat(100) + '1' + ')'.repeat(100), '-'.repeat(100) + '1']) {
      expect(safeEvaluate(expression, {})).toBeNull()
    }
    const ast: ExpressionAST = { type: 'UnaryExpression', operator: '-' }; ast.argument = ast
    expect(() => evaluateExpression(ast, {})).toThrow(/limit/)
  })
})
