import { describe, expect, it } from 'vitest'
import { evaluate, evaluateTypedExpression, parseExpression } from '../expressionEvaluator'
const value = (formula: string) => evaluateTypedExpression(parseExpression(formula), {})

describe('bounded typed expression values', () => {
  it.each([
    ['"Chorono"', 'Chorono'], ["'hello\\nworld'", 'hello\nworld'], ['"\\u0041"', 'A'],
    ['concat("Frame ",str(2+3))', 'Frame 5'], ['fixed(1/3,2)', '0.33'],
    ['if(true,"a","b")', 'a'], ['"a"=="a"', true],
    ['x(vec2(10,20))', 10], ['alpha(rgba(1,2,3,0.5))', .5],
  ])('evaluates %s without host code', (formula, expected) => { expect(value(formula)).toEqual(expected) })
  it('uses shared canonical color/vector calculations and keeps numeric APIs strict', () => {
    expect(value('vec2(2+3,4)')).toEqual({ x: 5, y: 4 })
    expect(value('color("#f00")')).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    expect(value('rgba(4,5,6,.5)')).toEqual({ r: 4, g: 5, b: 6, a: 127.5 })
    expect(() => evaluate('vec2(1,2)', {})).toThrow(/number/)
    expect(() => evaluate('"3"', {})).toThrow(/number/)
  })
  it.each(['rgb(256,0,0)', 'rgba(0,0,0,2)', 'vec2(true,1)', 'x(1)', 'fixed(1,13)', 'fixed(1,.5)', 'concat("a",1)',
    '"a"+1', 'str(vec2(1,2))', 'color("invalid")', 'color("constructor")', 'color("__proto__")', '"unterminated', '"\\q"', '"\\u00xx"', 'vec2(1,2).x',
    'if("yes",1,2)', '"a"<"b"'])('rejects %s', formula => { expect(() => value(formula)).toThrow() })
  it('rejects oversized intermediates and foreign object contexts', () => {
    expect(() => evaluateTypedExpression(parseExpression('concat(a,a)'), { a: 'a'.repeat(3000) })).toThrow(/4096/)
    expect(() => evaluateTypedExpression(parseExpression('a'), { a: 'a'.repeat(4097) })).toThrow(/bounded/)
    expect(() => evaluateTypedExpression(parseExpression('a'), { a: { x: 1, y: 2, extra: true } } as any)).toThrow(/bounded/)
    expect(() => evaluateTypedExpression(parseExpression('a'), { a: { r: 1, g: 2, b: 3, a: 300 } })).toThrow(/bounded/)
  })
})
