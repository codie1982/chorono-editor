import { describe, it, expect } from 'vitest'
import { parseExpression, evaluateExpression, evaluate, safeEvaluate } from '../expressionEvaluator'

describe('Expression Evaluator', () => {
  describe('Literals', () => {
    it('parses and evaluates numeric literals', () => {
      expect(evaluate('42', {})).toBe(42)
      expect(evaluate('3.14', {})).toBe(3.14)
      expect(evaluate('0', {})).toBe(0)
      expect(evaluate('-5', {})).toBe(-5)
    })

    it('parses scientific notation', () => {
      expect(evaluate('1e3', {})).toBe(1000)
      expect(evaluate('1.5e-2', {})).toBeCloseTo(0.015, 5)
    })
  })

  describe('Variables', () => {
    it('evaluates identifiers from context', () => {
      expect(evaluate('s', { s: 0.5 })).toBe(0.5)
      expect(evaluate('x', { x: 10 })).toBe(10)
    })

    it('throws on undefined variables', () => {
      expect(() => evaluate('s', {})).toThrow()
      expect(() => evaluate('undefined_var', {})).toThrow()
    })
  })

  describe('Binary Operations', () => {
    it('adds numbers', () => {
      expect(evaluate('2 + 3', {})).toBe(5)
      expect(evaluate('s + 5', { s: 10 })).toBe(15)
    })

    it('subtracts numbers', () => {
      expect(evaluate('10 - 3', {})).toBe(7)
      expect(evaluate('s - 2', { s: 5 })).toBe(3)
    })

    it('multiplies numbers', () => {
      expect(evaluate('3 * 4', {})).toBe(12)
      expect(evaluate('s * 2', { s: 5 })).toBe(10)
    })

    it('divides numbers', () => {
      expect(evaluate('10 / 2', {})).toBe(5)
      expect(evaluate('s / 2', { s: 10 })).toBe(5)
    })

    it('modulo', () => {
      expect(evaluate('10 % 3', {})).toBe(1)
      expect(evaluate('17 % 5', {})).toBe(2)
    })

    it('power', () => {
      expect(evaluate('2 ^ 3', {})).toBe(8)
      expect(evaluate('10 ^ 2', {})).toBe(100)
    })

    it('respects operator precedence', () => {
      expect(evaluate('2 + 3 * 4', {})).toBe(14) // not 20
      expect(evaluate('10 / 2 + 3', {})).toBe(8) // not 1
      expect(evaluate('2 * 3 ^ 2', {})).toBe(18) // 2 * 9, not 36
    })
  })

  describe('Unary Operations', () => {
    it('unary plus', () => {
      expect(evaluate('+5', {})).toBe(5)
      expect(evaluate('+s', { s: 10 })).toBe(10)
    })

    it('unary minus', () => {
      expect(evaluate('-5', {})).toBe(-5)
      expect(evaluate('-s', { s: 10 })).toBe(-10)
    })
  })

  describe('Safe Functions', () => {
    describe('map', () => {
      it('remaps from [0,1] to [0,360]', () => {
        expect(evaluate('map(s, 0, 1, 0, 360)', { s: 0 })).toBe(0)
        expect(evaluate('map(s, 0, 1, 0, 360)', { s: 0.5 })).toBe(180)
        expect(evaluate('map(s, 0, 1, 0, 360)', { s: 1 })).toBe(360)
      })

      it('remaps negative ranges', () => {
        expect(evaluate('map(s, 0, 100, -50, 50)', { s: 0 })).toBe(-50)
        expect(evaluate('map(s, 0, 100, -50, 50)', { s: 50 })).toBe(0)
        expect(evaluate('map(s, 0, 100, -50, 50)', { s: 100 })).toBe(50)
      })

      it('handles zero-width input range', () => {
        expect(evaluate('map(s, 5, 5, 0, 100)', { s: 5 })).toBe(0) // outMin
      })
    })

    describe('clamp', () => {
      it('clamps to range', () => {
        expect(evaluate('clamp(s, 0, 10)', { s: 5 })).toBe(5)
        expect(evaluate('clamp(s, 0, 10)', { s: -5 })).toBe(0)
        expect(evaluate('clamp(s, 0, 10)', { s: 15 })).toBe(10)
      })
    })

    describe('lerp', () => {
      it('interpolates linearly', () => {
        expect(evaluate('lerp(0, 100, 0)', {})).toBe(0)
        expect(evaluate('lerp(0, 100, 0.5)', {})).toBe(50)
        expect(evaluate('lerp(0, 100, 1)', {})).toBe(100)
      })

      it('works with variables', () => {
        expect(evaluate('lerp(0, 10, s)', { s: 0.5 })).toBe(5)
      })
    })

    describe('abs', () => {
      it('returns absolute value', () => {
        expect(evaluate('abs(5)', {})).toBe(5)
        expect(evaluate('abs(-5)', {})).toBe(5)
        expect(evaluate('abs(0)', {})).toBe(0)
      })
    })

    describe('min/max', () => {
      it('finds minimum', () => {
        expect(evaluate('min(3, 5)', {})).toBe(3)
        expect(evaluate('min(-5, 0)', {})).toBe(-5)
        expect(evaluate('min(10, 10)', {})).toBe(10)
      })

      it('finds maximum', () => {
        expect(evaluate('max(3, 5)', {})).toBe(5)
        expect(evaluate('max(-5, 0)', {})).toBe(0)
      })
    })

    describe('Trigonometry', () => {
      it('sine', () => {
        expect(evaluate('sin(0)', {})).toBeCloseTo(0, 5)
        expect(evaluate('sin(3.14159 / 2)', {})).toBeCloseTo(1, 4)
      })

      it('cosine', () => {
        expect(evaluate('cos(0)', {})).toBeCloseTo(1, 5)
        expect(evaluate('cos(3.14159)', {})).toBeCloseTo(-1, 4)
      })
    })

    describe('sqrt', () => {
      it('square root', () => {
        expect(evaluate('sqrt(4)', {})).toBe(2)
        expect(evaluate('sqrt(9)', {})).toBe(3)
        expect(evaluate('sqrt(0)', {})).toBe(0)
      })
    })

    describe('pow', () => {
      it('power function', () => {
        expect(evaluate('pow(2, 3)', {})).toBe(8)
        expect(evaluate('pow(10, 2)', {})).toBe(100)
      })
    })

    describe('round', () => {
      it('rounds to nearest integer', () => {
        expect(evaluate('round(3.2)', {})).toBe(3)
        expect(evaluate('round(3.7)', {})).toBe(4)
        expect(evaluate('round(3.5)', {})).toBe(4)
      })
    })

    describe('floor', () => {
      it('floors to integer', () => {
        expect(evaluate('floor(3.2)', {})).toBe(3)
        expect(evaluate('floor(3.9)', {})).toBe(3)
        expect(evaluate('floor(-1.5)', {})).toBe(-2)
      })
    })

    describe('ceil', () => {
      it('ceils to integer', () => {
        expect(evaluate('ceil(3.1)', {})).toBe(4)
        expect(evaluate('ceil(3.9)', {})).toBe(4)
        expect(evaluate('ceil(-1.5)', {})).toBe(-1)
      })
    })

    describe('smoothstep', () => {
      it('smooth step easing', () => {
        expect(evaluate('smoothstep(0)', {})).toBe(0)
        expect(evaluate('smoothstep(0.5)', {})).toBeCloseTo(0.5, 5)
        expect(evaluate('smoothstep(1)', {})).toBe(1)
      })
    })
  })

  describe('Complex Expressions', () => {
    it('evaluates chained operations', () => {
      expect(evaluate('2 + 3 * 4 - 1', {})).toBe(13)
      expect(evaluate('(2 + 3) * 4 - 1', {})).toBe(19)
    })

    it('evaluates nested function calls', () => {
      expect(evaluate('max(min(10, 20), 5)', {})).toBe(10)
      expect(evaluate('clamp(map(s, 0, 1, 0, 100), 0, 50)', { s: 0.8 })).toBe(50)
    })

    it('evaluates realistic parameter mappings', () => {
      // Map slider 0-1 to rotation 0-360
      expect(evaluate('map(s, 0, 1, 0, 360)', { s: 0.25 })).toBe(90)

      // Map with clamping
      expect(evaluate('clamp(s * 360, 0, 360)', { s: 0.5 })).toBe(180)

      // Complex easing: sin(π) ≈ 0
      expect(evaluate('sin(s * 3.14159) * 100', { s: 1 })).toBeCloseTo(0, 3)
    })

    it('handles whitespace', () => {
      expect(evaluate('  2 + 3  ', {})).toBe(5)
      expect(evaluate('map( s , 0 , 1 , 0 , 360 )', { s: 0.5 })).toBe(180)
    })
  })

  describe('Error Handling', () => {
    it('throws on syntax errors', () => {
      expect(() => parseExpression('2 +')).toThrow()
      expect(() => parseExpression(')')).toThrow()
      expect(() => parseExpression('2 3')).toThrow()
    })

    it('throws on undefined functions', () => {
      expect(() => evaluate('unknown(5)', {})).toThrow()
      expect(() => evaluate('eval(1)', {})).toThrow()
    })

    it('throws on division by zero', () => {
      expect(() => evaluate('1 / 0', {})).toThrow()
    })

    it('safeEvaluate returns null on error', () => {
      expect(safeEvaluate('2 +', {})).toBeNull()
      expect(safeEvaluate('1 / 0', {})).toBeNull()
      expect(safeEvaluate('undefined_var', {})).toBeNull()
    })

    it('does not allow dangerous functions', () => {
      expect(() => evaluate('eval("alert(1)")', {})).toThrow()
      expect(() => evaluate('eval(1)', {})).toThrow()
      expect(() => evaluate('Function(1)', {})).toThrow()
      expect(() => evaluate('fetch(1)', {})).toThrow()
      expect(() => evaluate('import(1)', {})).toThrow()
    })
  })

  describe('Security', () => {
    it('prevents code injection via unknown functions', () => {
      expect(() => evaluate('eval(1)', {})).toThrow('Unknown function')
      expect(() => evaluate('fetch(1)', {})).toThrow('Unknown function')
      expect(() => evaluate('import(1)', {})).toThrow('Unknown function')
      expect(() => evaluate('require(1)', {})).toThrow('Unknown function')
      expect(() => evaluate('badFunc(1)', {})).toThrow('Unknown function')
    })

    it('prevents injection via semicolons (parser rejects)', () => {
      expect(() => evaluate('1; alert("xss")', {})).toThrow()
      expect(() => evaluate('(function(){})(); 2', {})).toThrow()
    })

    it('only allows whitelisted functions', () => {
      // Only these should work
      expect(evaluate('abs(-5)', {})).toBe(5)
      expect(evaluate('max(1, 2)', {})).toBe(2)
      expect(evaluate('map(0.5, 0, 1, 0, 100)', {})).toBe(50)

      // Everything else should fail
      expect(() => evaluate('unknownFunc(1)', {})).toThrow()
      expect(() => evaluate('alert(1)', {})).toThrow()
      expect(() => evaluate('console(1)', {})).toThrow()
    })
  })

  describe('AST API', () => {
    it('parses to valid AST', () => {
      const ast = parseExpression('map(s, 0, 1, 0, 360)')
      expect(ast.type).toBe('CallExpression')
      expect(ast.name).toBe('map')
      expect(ast.arguments).toHaveLength(5)
    })

    it('evaluates AST directly', () => {
      const ast = parseExpression('2 + 3')
      expect(evaluateExpression(ast, {})).toBe(5)
    })
  })
})
