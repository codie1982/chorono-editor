import { describe, it, expect } from 'vitest'
import { M, L, C, Q, Z, type PathDefinition } from '../PathCommand'
import { flattenClosedPath } from '../flattenClosedPath'
import { ringArea } from './rings'
import { PolygonClippingBackend } from './PolygonClippingBackend'
import type { BooleanOperand, BooleanOperation } from './types'
import { Matrix2D, ShapeToPathConverter, transformPathDefinition } from '..'

const rectangle = (x: number, y: number, w: number, h: number) => ({ closed: true, commands: [M(x, y), L(x + w, y), L(x + w, y + h), L(x, y + h), Z()] })
const operand = (path: PathDefinition, fillRule: BooleanOperand['fillRule'] = 'nonzero'): BooleanOperand => ({ label: 'input', path, fillRule })
const backend = new PolygonClippingBackend()
const compute = (operation: BooleanOperation, inputs: BooleanOperand[], reverse = false, tolerancePx = .25) => backend.compute({ operation, operands: inputs, reverse, tolerancePx })
const area = (path: PathDefinition) => path.commands.length ? Math.abs(flattenClosedPath(path, .25, 20000, 1000).reduce((sum, ring) => sum + ringArea(ring), 0)) : 0
const a = operand(rectangle(0, 0, 100, 80)), b = operand(rectangle(60, 30, 100, 80))
/** Area identities and hole semantics cover actual clipping, not its structure. */
describe('bounded Boolean geometry', () => {
  it('satisfies area identities without mutating inputs', () => {
    const inputs = [a, b], source = JSON.stringify(inputs)
    expect(area(compute('intersect', inputs).path)).toBe(2000)
    expect(area(compute('union', inputs).path)).toBe(14000)
    expect(area(compute('subtract', inputs).path)).toBe(6000)
    expect(area(compute('xor', inputs).path)).toBe(12000)
    expect(compute('xor', [a, a]).path.commands).toEqual([])
    expect(area(compute('xor', [a, a, b]).path)).toBe(8000)
    expect(area(compute('subtract', inputs, true).path)).toBe(6000)
    expect(JSON.stringify(inputs)).toBe(source)
  })
  it('preserves nested holes, disjoint islands and explicit subtraction order', () => {
    const outer = operand(rectangle(0, 0, 100, 100)), inner = operand(rectangle(20, 20, 20, 20))
    const result = compute('subtract', [outer, inner])
    expect(result.holes).toBe(1); expect(area(result.path)).toBe(9600)
    expect(compute('subtract', [outer, inner], true).path.commands).toEqual([])
    expect(compute('union', [outer, operand(rectangle(200, 0, 20, 20))]).polygons).toBe(2)
  })
  it('accepts edge/point tangency and identical operands; empty is valid', () => {
    for (const other of [rectangle(100, 0, 100, 80), rectangle(100, 80, 100, 80)]) {
      expect(area(compute('union', [a, operand(other)]).path)).toBe(16000)
      expect(compute('intersect', [a, operand(other)]).polygons).toBe(0)
    }
    expect(area(compute('union', [a, a]).path)).toBe(8000)
    expect(compute('subtract', [a, a]).polygons).toBe(0)
  })
  it('evaluates evenodd overlap and mixed nonzero cumulative winding correctly', () => {
    const outer = rectangle(0, 0, 100, 100), middle = rectangle(10, 10, 80, 80), inner = rectangle(20, 20, 60, 60)
    const reversedInner = { ...inner, commands: [M(20, 20), L(20, 80), L(80, 80), L(80, 20), Z()] }
    const compound = (paths: PathDefinition[]) => ({ closed: true, commands: paths.flatMap(p => p.commands) })
    const outside = operand(rectangle(200, 0, 10, 10))
    expect(area(compute('union', [operand(compound([outer, middle]), 'evenodd'), outside]).path)).toBe(3700)
    expect(area(compute('union', [operand(compound([outer, middle, reversedInner])), outside]).path)).toBe(10100)
    const hole = { ...middle, commands: [M(10, 10), L(10, 90), L(90, 90), L(90, 10), Z()] }
    const nested = compute('union', [operand(compound([outer, hole, inner])), outside])
    expect(area(nested.path)).toBe(7300); expect(nested.holes).toBe(1)
    const overlap = compound([rectangle(0, 0, 100, 100), rectangle(50, 0, 100, 100)])
    expect(area(compute('union', [operand(overlap, 'evenodd'), outside]).path)).toBe(10100)
    expect(area(compute('union', [operand(overlap), outside]).path)).toBe(15100)
  })
  it('rejects ambiguous winding, open/invalid/self-contacting/zero-area paths', () => {
    const bad = [
      { closed: false, commands: [M(0, 0), L(20, 20)] },
      { closed: true, commands: [M(0, 0), L(20, 20), L(0, 20), L(20, 0), Z()] },
      { closed: true, commands: [M(0, 0), L(20, 0), L(10, 0), L(10, 20), Z()] },
      rectangle(0, 0, 0, 20), rectangle(NaN, 0, 20, 20),
    ]
    for (const path of bad) expect(() => compute('union', [a, operand(path)])).toThrow()
    const mixed = { closed: true, commands: [...rectangle(0, 0, 20, 20).commands, M(10, 0), L(10, 20), L(30, 20), L(30, 0), Z()] }
    expect(() => compute('union', [a, operand(mixed)])).toThrow(/Mixed-winding/)
  })
  it('rejects budget/invalid tolerance rather than silently changing detail', () => {
    expect(() => compute('union', Array(9).fill(a))).toThrow(/2–8/)
    expect(() => compute('union', [a, b], false, 0)).toThrow(/tolerance/)
    const huge = { closed: true, commands: [M(0, 0), ...Array.from({ length: 2100 }, (_, i) => L(i, i % 2)), Z()] }
    expect(() => compute('union', [a, operand(huge)])).toThrow(/budget/)
    const circle = ShapeToPathConverter.convert('circle', { width: 1e7, height: 1e7 })
    expect(() => compute('union', [a, operand(circle)], false, .01)).toThrow(/budget/)
  })
  it('flattens Q/C adaptively, preserves collinear overshoot and affine equivalence', () => {
    const curve = { closed: true, commands: [M(0, 0), Q(50, -100, 100, 0), C(100, 50, 0, 50, 0, 0), Z()] }
    const coarse = flattenClosedPath(curve, 2, 2048, 64), fine = flattenClosedPath(curve, .05, 2048, 64)
    expect(fine[0].length).toBeGreaterThan(coarse[0].length)
    const overshoot = flattenClosedPath({ closed: true, commands: [M(0, 0), C(200, 0, 200, 0, 10, 0), L(10, 20), L(0, 20), Z()] }, .25, 2048, 64)
    expect(Math.max(...overshoot[0].map(p => p.x))).toBeGreaterThan(100)
    const matrix = Matrix2D.translation(1000, -2000).rotate(31).scale(-2, .75)
    const transformed = [a, b].map(op => ({ ...op, path: transformPathDefinition(op.path, matrix) }))
    expect(area(compute('union', transformed).path)).toBeCloseTo(14000 * 1.5, 7)
    const back = transformPathDefinition(compute('intersect', transformed).path, matrix.invert())
    expect(area(back)).toBeCloseTo(2000, 7)
  })
})
