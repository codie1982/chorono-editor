import { describe, expect, it } from 'vitest'
import { parseExpression, evaluateTypedExpression, evaluate } from '../expressionEvaluator'
const run = (source: string) => evaluateTypedExpression(parseExpression(source), {})

describe('strict scalar expression syntax and short circuit', () => {
  it.each([
    ['1+2*3==7', true], ['2<3&&4>=4', true], ['false || true && false', false],
    ['!false', true], ['2!=3', true], ['false===false', true], ['true!==false', true],
    ['true ? 1 : 2', 1], ['false ? 1 : true ? 2 : 3', 2], ['if(2>1, 4, 5)', 4],
    ['false&&1/0>0', false], ['true||missing', true], ['true ? 5 : sqrt(-1)', 5],
    ['if(false,unknown(1),6)', 6], ['-2^2', -4], ['2^-2', .25], ['true ? false : 4', false],
  ])('evaluates %s to %s', (formula, expected) => { expect(run(formula)).toBe(expected) })
  it.each(['true+1', 'sin(true)', '1&&true', '!0', '1?2:3', 'true==1', 'false>1', 'if(1,2,3)', 'if(true,1)', 'true&&missing', 'false||1/0>0', 'false ? 1 : sqrt(-1)', 's.x', 'true=1', '1&2'])
  ('rejects %s without coercion or host access', formula => { expect(() => run(formula)).toThrow() })
  it('preserves numeric API type and confines numeric predicates to the explicit legacy Wire option', () => {
    expect(() => evaluate('true', {})).toThrow(/number/)
    expect(evaluate('if(1>0,2,3)', {})).toBe(2)
    expect(evaluateTypedExpression(parseExpression('source ? 2 : 3'), { source: 1 }, { legacyNumericConditions: true })).toBe(2)
    expect(() => evaluateTypedExpression(parseExpression('source ? 2 : 3'), { source: 1 })).toThrow(/boolean/)
    expect(() => run('true ? '.repeat(100) + '1' + ' : 0'.repeat(100))).toThrow(/nesting/)
    expect(() => evaluateTypedExpression({ type: 'Identifier', name: 'x' }, Object.create({ x: true }))).toThrow(/Undefined/)
    expect(evaluateTypedExpression(parseExpression('true+1'), { true: 3 })).toBe(4)
  })
})
