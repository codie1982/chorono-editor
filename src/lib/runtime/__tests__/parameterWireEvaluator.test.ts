import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateParameterWires, clearParameterWireCache } from '../parameterWireEvaluator'
import type { ParameterWire, Layer } from '../../types'
import type { OverrideMap } from '../../evaluator'
import type { ParamValueMap } from '../paramResolver'

function makeWire(overrides: Partial<ParameterWire> = {}): ParameterWire {
  return {
    id: 'w1',
    sourceParamId: 'params.slider1',
    targetParamId: 'layers.rect1.rotationZ',
    expression: 'map(s, 0, 1, 0, 360)',
    enabled: true,
    ...overrides,
  }
}

describe('evaluateParameterWires (BL-05)', () => {
  beforeEach(() => {
    clearParameterWireCache()
  })

  it('returns input map untouched when no wires', () => {
    const overrides: OverrideMap = new Map()
    const result = evaluateParameterWires(undefined, overrides, new Map(), { layers: [] })
    expect(result).toBe(overrides)
  })

  it('returns input map when wires array is empty', () => {
    const overrides: OverrideMap = new Map()
    const result = evaluateParameterWires([], overrides, new Map(), { layers: [] })
    expect(result).toBe(overrides)
  })

  it('evaluates a simple map() expression', () => {
    const wires = [makeWire()]
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.get('layers.rect1.rotationZ')).toBe(180)
  })

  it('skips disabled wires', () => {
    const wires = [makeWire({ enabled: false })]
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.has('layers.rect1.rotationZ')).toBe(false)
  })

  it('skips wires with bad expressions silently', () => {
    const wires = [makeWire({ expression: 'badFunc(1)' })]
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.has('layers.rect1.rotationZ')).toBe(false)
  })

  it('skips wires with unparseable expressions silently', () => {
    const wires = [makeWire({ expression: 'invalid +' })]
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.has('layers.rect1.rotationZ')).toBe(false)
  })

  it('handles missing source value (null param)', () => {
    const wires = [makeWire()]
    const result = evaluateParameterWires(wires, new Map(), new Map(), { layers: [] })
    expect(result.has('layers.rect1.rotationZ')).toBe(false)
  })

  it('coerces boolean params to 0/1', () => {
    const wires = [makeWire({ expression: 's * 100' })]
    const params: ParamValueMap = new Map([['slider1', true]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.get('layers.rect1.rotationZ')).toBe(100)
  })

  it('coerces numeric strings', () => {
    const wires = [makeWire({ expression: 's * 2' })]
    const params: ParamValueMap = new Map([['slider1', '15']])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.get('layers.rect1.rotationZ')).toBe(30)
  })

  it('reads animated layer property source', () => {
    const wires = [makeWire({ sourceParamId: 'layers.card.opacity', expression: 's + 0.5' })]
    const overrides: OverrideMap = new Map([['layers.card.opacity', 0.3]])
    const result = evaluateParameterWires(wires, overrides, new Map(), { layers: [] })
    expect(result.get('layers.rect1.rotationZ')).toBeCloseTo(0.8, 5)
  })

  it('reads static layer property when no animation override', () => {
    const layers: Layer[] = [
      { id: 'card', kind: 'shape', type: 'shape', x: 100, y: 0 } as unknown as Layer,
    ]
    const wires = [makeWire({ sourceParamId: 'layers.card.x', expression: 's * 2' })]
    const result = evaluateParameterWires(wires, new Map(), new Map(), { layers })
    expect(result.get('layers.rect1.rotationZ')).toBe(200)
  })

  it('skips non-finite results (e.g., divide by zero)', () => {
    const wires = [makeWire({ expression: 's / 0' })]
    const params: ParamValueMap = new Map([['slider1', 5]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    // Divide by zero throws → wire is skipped
    expect(result.has('layers.rect1.rotationZ')).toBe(false)
  })

  it('caches parsed AST across calls (same expression)', () => {
    const wires = [makeWire()]
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    // First call parses
    const r1 = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    // Second call should reuse cache (we can't directly inspect, but result should match)
    const r2 = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(r1.get('layers.rect1.rotationZ')).toBe(r2.get('layers.rect1.rotationZ'))
  })

  it('re-parses when expression changes', () => {
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const w1 = makeWire({ expression: 'map(s, 0, 1, 0, 360)' })
    const r1 = evaluateParameterWires([w1], new Map(), params, { layers: [] })
    expect(r1.get('layers.rect1.rotationZ')).toBe(180)

    const w2 = makeWire({ expression: 'map(s, 0, 1, 0, 100)' })
    const r2 = evaluateParameterWires([w2], new Map(), params, { layers: [] })
    expect(r2.get('layers.rect1.rotationZ')).toBe(50)
  })

  it('evaluates multiple wires in one pass', () => {
    const wires = [
      makeWire({ id: 'w1', targetParamId: 'layers.a.x', expression: 's * 100' }),
      makeWire({ id: 'w2', targetParamId: 'layers.b.y', expression: 's * 200' }),
    ]
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.get('layers.a.x')).toBe(50)
    expect(result.get('layers.b.y')).toBe(100)
  })
})
