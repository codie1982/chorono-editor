import { describe, it, expect, beforeEach } from 'vitest'
import {
  evaluateParameterWires, evaluateParameterWiresVerbose, clearParameterWireCache,
} from '../parameterWireEvaluator'
import type { ParameterWire, Layer } from '../../types'
import type { OverrideMap } from '../../evaluator'
import type { ParamValueMap } from '../paramResolver'

function makeWire(overrides: Partial<ParameterWire> = {}): ParameterWire {
  const now = Date.now()
  return {
    id: 'w1',
    enabled: true,
    source: { propertyPath: 'slider1', valueType: 'number' },
    target: { layerId: 'rect1', propertyPath: 'rotationZ', valueType: 'number' },
    expression: 'map(source, 0, 1, 0, 360)',
    blendMode: 'override',
    createdAt: now,
    updatedAt: now,
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

  it('accepts legacy "s" identifier alongside "source" in expressions', () => {
    const wires = [makeWire({ expression: 's * 100' })]
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.get('layers.rect1.rotationZ')).toBe(50)
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
    const wires = [makeWire({ expression: 'source * 100' })]
    const params: ParamValueMap = new Map([['slider1', true]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.get('layers.rect1.rotationZ')).toBe(100)
  })

  it('coerces numeric strings', () => {
    const wires = [makeWire({ expression: 'source * 2' })]
    const params: ParamValueMap = new Map([['slider1', '15']])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.get('layers.rect1.rotationZ')).toBe(30)
  })

  it('reads animated layer property source', () => {
    const wires = [makeWire({
      source: { layerId: 'card', propertyPath: 'opacity', valueType: 'number' },
      expression: 'source + 0.5',
    })]
    const overrides: OverrideMap = new Map([['layers.card.opacity', 0.3]])
    const result = evaluateParameterWires(wires, overrides, new Map(), { layers: [] })
    expect(result.get('layers.rect1.rotationZ')).toBeCloseTo(0.8, 5)
  })

  it('reads static layer property when no animation override', () => {
    const layers: Layer[] = [
      { id: 'card', kind: 'shape', type: 'shape', x: 100, y: 0 } as unknown as Layer,
    ]
    const wires = [makeWire({
      source: { layerId: 'card', propertyPath: 'x', valueType: 'number' },
      expression: 'source * 2',
    })]
    const result = evaluateParameterWires(wires, new Map(), new Map(), { layers })
    expect(result.get('layers.rect1.rotationZ')).toBe(200)
  })

  it('skips non-finite results (e.g., divide by zero)', () => {
    const wires = [makeWire({ expression: 'source / 0' })]
    const params: ParamValueMap = new Map([['slider1', 5]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.has('layers.rect1.rotationZ')).toBe(false)
  })

  it('caches parsed AST across calls (same expression)', () => {
    const wires = [makeWire()]
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const r1 = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    const r2 = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(r1.get('layers.rect1.rotationZ')).toBe(r2.get('layers.rect1.rotationZ'))
  })

  it('re-parses when expression changes', () => {
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const w1 = makeWire({ expression: 'map(source, 0, 1, 0, 360)' })
    const r1 = evaluateParameterWires([w1], new Map(), params, { layers: [] })
    expect(r1.get('layers.rect1.rotationZ')).toBe(180)

    const w2 = makeWire({ expression: 'map(source, 0, 1, 0, 100)' })
    const r2 = evaluateParameterWires([w2], new Map(), params, { layers: [] })
    expect(r2.get('layers.rect1.rotationZ')).toBe(50)
  })

  it('evaluates multiple wires in one pass', () => {
    const wires = [
      makeWire({
        id: 'w1',
        target: { layerId: 'a', propertyPath: 'x', valueType: 'number' },
        expression: 'source * 100',
      }),
      makeWire({
        id: 'w2',
        target: { layerId: 'b', propertyPath: 'y', valueType: 'number' },
        expression: 'source * 200',
      }),
    ]
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.get('layers.a.x')).toBe(50)
    expect(result.get('layers.b.y')).toBe(100)
  })

  it('applies output clamp when enabled', () => {
    const wires = [makeWire({
      expression: 'source * 1000',
      clamp: { enabled: true, min: 0, max: 100 },
    })]
    const params: ParamValueMap = new Map([['slider1', 5]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    // 5 * 1000 = 5000 → clamped to 100
    expect(result.get('layers.rect1.rotationZ')).toBe(100)
  })

  it('clamp.min only (no max)', () => {
    const wires = [makeWire({
      expression: 'source - 100',
      clamp: { enabled: true, min: 0 },
    })]
    const params: ParamValueMap = new Map([['slider1', 50]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    // 50 - 100 = -50 → clamped to 0
    expect(result.get('layers.rect1.rotationZ')).toBe(0)
  })

  it('clamp disabled means no clamping', () => {
    const wires = [makeWire({
      expression: 'source * 1000',
      clamp: { enabled: false, min: 0, max: 100 },
    })]
    const params: ParamValueMap = new Map([['slider1', 5]])
    const result = evaluateParameterWires(wires, new Map(), params, { layers: [] })
    expect(result.get('layers.rect1.rotationZ')).toBe(5000)
  })
})

describe('evaluateParameterWiresVerbose (BL-05 Sprint 6)', () => {
  beforeEach(() => clearParameterWireCache())

  it('returns empty broken / runtimeError sets when wires array is empty', () => {
    const { overrides, brokenWireIds, runtimeErrorIds } =
      evaluateParameterWiresVerbose([], new Map(), new Map(), { layers: [] })
    expect(overrides.size).toBe(0)
    expect(brokenWireIds.size).toBe(0)
    expect(runtimeErrorIds.size).toBe(0)
  })

  it('flags wires whose source value cannot be resolved (broken)', () => {
    const wires = [makeWire({ id: 'wA' })] // slider1 not in paramValues
    const { brokenWireIds, runtimeErrorIds, overrides } =
      evaluateParameterWiresVerbose(wires, new Map(), new Map(), { layers: [] })
    expect(brokenWireIds.has('wA')).toBe(true)
    expect(runtimeErrorIds.size).toBe(0)
    expect(overrides.has('layers.rect1.rotationZ')).toBe(false)
  })

  it('flags wires whose expression fails to parse (runtime error)', () => {
    const wires = [makeWire({ id: 'wA', expression: '1 ++' })]
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const { runtimeErrorIds, brokenWireIds } =
      evaluateParameterWiresVerbose(wires, new Map(), params, { layers: [] })
    expect(runtimeErrorIds.has('wA')).toBe(true)
    expect(brokenWireIds.size).toBe(0)
  })

  it('flags wires whose expression evaluates to a non-finite number', () => {
    const wires = [makeWire({ id: 'wA', expression: 'source / 0' })]
    const params: ParamValueMap = new Map([['slider1', 5]])
    const { runtimeErrorIds } =
      evaluateParameterWiresVerbose(wires, new Map(), params, { layers: [] })
    expect(runtimeErrorIds.has('wA')).toBe(true)
  })

  it('successful wires aren\'t flagged', () => {
    const wires = [makeWire({ id: 'wOK' })]
    const params: ParamValueMap = new Map([['slider1', 0.5]])
    const { overrides, brokenWireIds, runtimeErrorIds } =
      evaluateParameterWiresVerbose(wires, new Map(), params, { layers: [] })
    expect(overrides.get('layers.rect1.rotationZ')).toBe(180)
    expect(brokenWireIds.size).toBe(0)
    expect(runtimeErrorIds.size).toBe(0)
  })

  it('disabled wires are not flagged (silent skip)', () => {
    const wires = [makeWire({ id: 'wOff', enabled: false })]
    const { brokenWireIds, runtimeErrorIds } =
      evaluateParameterWiresVerbose(wires, new Map(), new Map(), { layers: [] })
    expect(brokenWireIds.size).toBe(0)
    expect(runtimeErrorIds.size).toBe(0)
  })
})
