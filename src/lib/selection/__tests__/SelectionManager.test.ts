import { describe, it, expect } from 'vitest'
import {
  SelectionManager, evaluateRule, matchesQuery, nextRuleId,
} from '../SelectionManager'
import type { Layer } from '../../types'
import type { SelectionRule, SelectionQuery } from '../types'

function makeLayer(overrides: Partial<Layer> & { id: string }): Layer {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    type: overrides.type ?? 'shape',
    transform: {
      x: 0, y: 0,
      scaleX: 1, scaleY: 1,
      rotationDeg: 0,
      anchorX: 0, anchorY: 0,
      ...((overrides as any).transform ?? {}),
    },
    opacity: overrides.opacity ?? 1,
    hidden: false,
    locked: false,
  } as unknown as Layer
}

describe('SelectionManager — rule CRUD', () => {
  it('add / get / remove / clear lifecycle', () => {
    const m = new SelectionManager()
    expect(m.getRules()).toHaveLength(0)
    const rule: SelectionRule = {
      id: 'r1', enabled: true, kind: 'numeric',
      attr: 'opacity', operator: 'less', value: 0.5,
    }
    m.addRule(rule)
    expect(m.getRules()).toHaveLength(1)
    m.removeRule('r1')
    expect(m.getRules()).toHaveLength(0)

    m.addRule(rule)
    m.clearRules()
    expect(m.getRules()).toHaveLength(0)
  })

  it('updateRule patches a single rule by id', () => {
    const m = new SelectionManager()
    m.addRule({
      id: 'r1', enabled: true, kind: 'numeric',
      attr: 'opacity', operator: 'less', value: 0.5,
    })
    m.updateRule('r1', { enabled: false })
    expect(m.getRules()[0].enabled).toBe(false)
  })

  it('getRules returns a copy (no internal mutation)', () => {
    const m = new SelectionManager()
    const ref = m.getRules()
    ref.push({} as any)
    expect(m.getRules()).toHaveLength(0)
  })
})

describe('evaluateRule (numeric)', () => {
  const layer = makeLayer({
    id: 'a',
    transform: { x: 100, y: 50, scaleX: 1, scaleY: 1, rotationDeg: 45, anchorX: 0, anchorY: 0 },
    opacity: 0.7,
  } as any)

  it('equals', () => {
    expect(evaluateRule(layer, {
      id: 'r', enabled: true, kind: 'numeric',
      attr: 'x', operator: 'equals', value: 100,
    })).toBe(true)
    expect(evaluateRule(layer, {
      id: 'r', enabled: true, kind: 'numeric',
      attr: 'x', operator: 'equals', value: 99,
    })).toBe(false)
  })

  it('near with tolerance', () => {
    expect(evaluateRule(layer, {
      id: 'r', enabled: true, kind: 'numeric',
      attr: 'rotationDeg', operator: 'near', value: 50, value2: 10,
    })).toBe(true)
  })

  it('between (inclusive)', () => {
    expect(evaluateRule(layer, {
      id: 'r', enabled: true, kind: 'numeric',
      attr: 'opacity', operator: 'between', value: 0.5, value2: 0.8,
    })).toBe(true)
    expect(evaluateRule(layer, {
      id: 'r', enabled: true, kind: 'numeric',
      attr: 'opacity', operator: 'between', value: 0, value2: 0.5,
    })).toBe(false)
  })

  it('less / greater', () => {
    expect(evaluateRule(layer, {
      id: 'r', enabled: true, kind: 'numeric',
      attr: 'y', operator: 'less', value: 100,
    })).toBe(true)
    expect(evaluateRule(layer, {
      id: 'r', enabled: true, kind: 'numeric',
      attr: 'y', operator: 'greater', value: 100,
    })).toBe(false)
  })

  it('disabled rule returns false regardless of match', () => {
    expect(evaluateRule(layer, {
      id: 'r', enabled: false, kind: 'numeric',
      attr: 'x', operator: 'equals', value: 100,
    })).toBe(false)
  })
})

describe('evaluateRule (string)', () => {
  const layer = makeLayer({ id: 'l1', name: 'Background Image', type: 'image' as any })

  it('contains (case-insensitive default)', () => {
    expect(evaluateRule(layer, {
      id: 'r', enabled: true, kind: 'string',
      attr: 'name', operator: 'contains', value: 'background',
    })).toBe(true)
  })

  it('startsWith / endsWith', () => {
    expect(evaluateRule(layer, {
      id: 'r', enabled: true, kind: 'string',
      attr: 'name', operator: 'startsWith', value: 'back',
    })).toBe(true)
    expect(evaluateRule(layer, {
      id: 'r', enabled: true, kind: 'string',
      attr: 'name', operator: 'endsWith', value: 'image',
    })).toBe(true)
  })

  it('type attribute exact match', () => {
    expect(evaluateRule(layer, {
      id: 'r', enabled: true, kind: 'string',
      attr: 'type', operator: 'equals', value: 'image',
    })).toBe(true)
  })
})

describe('matchesQuery (combiners)', () => {
  const layer = makeLayer({
    id: 'l',
    transform: { x: 100, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 0.3,
    name: 'button',
  } as any)

  const lowOpacity: SelectionRule = {
    id: 'r1', enabled: true, kind: 'numeric',
    attr: 'opacity', operator: 'less', value: 0.5,
  }
  const namedButton: SelectionRule = {
    id: 'r2', enabled: true, kind: 'string',
    attr: 'name', operator: 'contains', value: 'button',
  }
  const noMatch: SelectionRule = {
    id: 'r3', enabled: true, kind: 'numeric',
    attr: 'x', operator: 'greater', value: 1000,
  }

  it('AND requires every rule to match', () => {
    expect(matchesQuery(layer, { rules: [lowOpacity, namedButton], combineOp: 'AND' })).toBe(true)
    expect(matchesQuery(layer, { rules: [lowOpacity, noMatch],     combineOp: 'AND' })).toBe(false)
  })

  it('OR requires at least one rule to match', () => {
    expect(matchesQuery(layer, { rules: [lowOpacity, noMatch], combineOp: 'OR' })).toBe(true)
    expect(matchesQuery(layer, { rules: [noMatch],             combineOp: 'OR' })).toBe(false)
  })

  it('NOT returns true when NO rule matches', () => {
    expect(matchesQuery(layer, { rules: [noMatch],             combineOp: 'NOT' })).toBe(true)
    expect(matchesQuery(layer, { rules: [lowOpacity, noMatch], combineOp: 'NOT' })).toBe(false)
  })

  it('empty rule list returns false', () => {
    expect(matchesQuery(layer, { rules: [], combineOp: 'AND' })).toBe(false)
  })
})

describe('executeQuery — full pipeline', () => {
  const layers: Layer[] = [
    makeLayer({ id: 'rect1',  opacity: 0.3, name: 'rect a' }),
    makeLayer({ id: 'rect2',  opacity: 0.7, name: 'rect b' }),
    makeLayer({ id: 'rect3',  opacity: 0.2, name: 'background' }),
  ]

  it('returns ids of every matching layer', () => {
    const m = new SelectionManager()
    const query: SelectionQuery = {
      rules: [{
        id: 'r', enabled: true, kind: 'numeric',
        attr: 'opacity', operator: 'less', value: 0.5,
      }],
      combineOp: 'AND',
    }
    const result = m.executeQuery(query, layers)
    expect(result.layerIds.has('rect1')).toBe(true)
    expect(result.layerIds.has('rect3')).toBe(true)
    expect(result.layerIds.has('rect2')).toBe(false)
    expect(result.layerIds.size).toBe(2)
    expect(result.evaluatedAt).toBeGreaterThan(0)
  })

  it('combines numeric + string rules with AND', () => {
    const m = new SelectionManager()
    const query: SelectionQuery = {
      rules: [
        { id: 'r1', enabled: true, kind: 'numeric',
          attr: 'opacity', operator: 'less', value: 0.5 },
        { id: 'r2', enabled: true, kind: 'string',
          attr: 'name', operator: 'contains', value: 'rect' },
      ],
      combineOp: 'AND',
    }
    const result = m.executeQuery(query, layers)
    expect(result.layerIds.has('rect1')).toBe(true)
    expect(result.layerIds.has('rect3')).toBe(false) // name 'background' fails second rule
    expect(result.layerIds.size).toBe(1)
  })

  it('skips disabled rules', () => {
    const m = new SelectionManager()
    const query: SelectionQuery = {
      rules: [
        { id: 'r1', enabled: false, kind: 'numeric',
          attr: 'opacity', operator: 'greater', value: 99 },
      ],
      combineOp: 'AND',
    }
    const result = m.executeQuery(query, layers)
    // All rules disabled → empty enabled list → matchesQuery returns false
    expect(result.layerIds.size).toBe(0)
  })
})

describe('nextRuleId', () => {
  it('produces unique increasing ids', () => {
    const a = nextRuleId()
    const b = nextRuleId()
    expect(a).not.toBe(b)
    expect(a.startsWith('rule_')).toBe(true)
  })
})
