import { describe, it, expect } from 'vitest'
import {
  paramRefKey, parseParamRef,
  findWireForProperty, findAllWiresForProperty,
  formatParameterRef, listLayerParameterRefs, listSceneParameterRefs,
  areTypesCompatible, isWireBroken,
} from '../helpers'
import type { ChronoScene, Layer, ParameterWire } from '../../types'

function makeScene(overrides: Partial<ChronoScene> = {}): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: { id: 't', width: 1920, height: 1080, durationMs: 5000, frameRate: 30, backgroundColor: '#000' },
    assets: [],
    layers: [],
    timelines: [],
    parameters: [],
    triggers: [],
    bindings: [],
    initialState: {},
    ...overrides,
  } as unknown as ChronoScene
}

const NOW = 0

describe('paramRefKey / parseParamRef (round-trip)', () => {
  it('round-trips a scene parameter', () => {
    const k = paramRefKey({ propertyPath: 'slider1', valueType: 'number' })
    expect(k).toBe('params.slider1')
    const back = parseParamRef(k)
    expect(back?.propertyPath).toBe('slider1')
    expect(back?.layerId).toBeUndefined()
  })

  it('round-trips a layer property', () => {
    const k = paramRefKey({ layerId: 'rect1', propertyPath: 'opacity', valueType: 'number' })
    expect(k).toBe('layers.rect1.opacity')
    const back = parseParamRef(k)
    expect(back?.layerId).toBe('rect1')
    expect(back?.propertyPath).toBe('opacity')
  })

  it('round-trips a nested layer property', () => {
    const k = paramRefKey({ layerId: 'rect1', propertyPath: 'transform.rotationDeg', valueType: 'number' })
    expect(k).toBe('layers.rect1.transform.rotationDeg')
    const back = parseParamRef(k)
    expect(back?.propertyPath).toBe('transform.rotationDeg')
  })

  it('round-trips a modifier-scoped property', () => {
    const k = paramRefKey({ layerId: 'rect1', modifierId: 'mod1', propertyPath: 'strength', valueType: 'number' })
    expect(k).toBe('layers.rect1.modifiers.mod1.strength')
    const back = parseParamRef(k)
    expect(back?.layerId).toBe('rect1')
    expect(back?.modifierId).toBe('mod1')
    expect(back?.propertyPath).toBe('strength')
  })

  it('parseParamRef returns null on malformed input', () => {
    expect(parseParamRef('')).toBeNull()
    expect(parseParamRef('foo')).toBeNull()
    expect(parseParamRef('layers.')).toBeNull()
  })
})

describe('findWireForProperty (BL-05)', () => {
  const wireEnabled: ParameterWire = {
    id: 'w1', enabled: true,
    source: { propertyPath: 'slider1', valueType: 'number' },
    target: { layerId: 'rect1', propertyPath: 'opacity', valueType: 'number' },
    expression: 'source', blendMode: 'override', createdAt: NOW, updatedAt: NOW,
  }
  const wireDisabled: ParameterWire = { ...wireEnabled, id: 'w2', enabled: false }

  it('returns null when no wires', () => {
    expect(findWireForProperty(undefined, 'rect1', 'opacity')).toBeNull()
    expect(findWireForProperty([], 'rect1', 'opacity')).toBeNull()
  })

  it('returns the matching enabled wire', () => {
    const found = findWireForProperty([wireEnabled], 'rect1', 'opacity')
    expect(found?.id).toBe('w1')
  })

  it('skips disabled wires', () => {
    expect(findWireForProperty([wireDisabled], 'rect1', 'opacity')).toBeNull()
  })

  it('returns null when target layer/property mismatch', () => {
    expect(findWireForProperty([wireEnabled], 'rect2', 'opacity')).toBeNull()
    expect(findWireForProperty([wireEnabled], 'rect1', 'rotation')).toBeNull()
  })

  it('findAllWiresForProperty includes disabled', () => {
    const all = findAllWiresForProperty([wireEnabled, wireDisabled], 'rect1', 'opacity')
    expect(all).toHaveLength(2)
  })
})

describe('formatParameterRef (BL-05)', () => {
  it('formats a layer property using layer name', () => {
    const scene = makeScene({
      layers: [{ id: 'rect1', name: 'My Rect', type: 'shape' } as Layer],
    })
    const ref = { layerId: 'rect1', propertyPath: 'opacity', valueType: 'number' as const }
    expect(formatParameterRef(ref, scene)).toBe('My Rect · opacity')
  })

  it('falls back to layerId when layer missing', () => {
    const scene = makeScene()
    const ref = { layerId: 'rect_ghost', propertyPath: 'opacity', valueType: 'number' as const }
    expect(formatParameterRef(ref, scene)).toBe('rect_ghost · opacity')
  })

  it('formats a scene parameter using parameter name', () => {
    const scene = makeScene({
      parameters: [{ id: 'slider1', name: 'Volume', type: 'number', defaultValue: 0.5 }],
    })
    const ref = { propertyPath: 'slider1', valueType: 'number' as const }
    expect(formatParameterRef(ref, scene)).toBe('params · Volume')
  })

  it('falls back to parameter id when missing', () => {
    const scene = makeScene()
    const ref = { propertyPath: 'unknown', valueType: 'number' as const }
    expect(formatParameterRef(ref, scene)).toBe('params · unknown')
  })
})

describe('listLayerParameterRefs / listSceneParameterRefs (BL-05)', () => {
  it('returns one ParameterRef per ANIMATABLE_PROPERTY applicable to layer.type', () => {
    const layer: Layer = { id: 'rect1', type: 'shape', name: 'Rect' } as Layer
    const refs = listLayerParameterRefs(layer)
    expect(refs.length).toBeGreaterThan(0)
    expect(refs[0].layerId).toBe('rect1')
    expect(refs[0].valueType).toBe('number')
  })

  it('returns scene parameters as ParameterRefs with proper valueType', () => {
    const scene = makeScene({
      parameters: [
        { id: 'a', name: 'A', type: 'number',  defaultValue: 1 },
        { id: 'b', name: 'B', type: 'boolean', defaultValue: true },
      ],
    })
    const refs = listSceneParameterRefs(scene)
    expect(refs).toHaveLength(2)
    expect(refs[0]).toMatchObject({ propertyPath: 'a', valueType: 'number' })
    expect(refs[1]).toMatchObject({ propertyPath: 'b', valueType: 'boolean' })
  })
})

describe('areTypesCompatible (BL-05)', () => {
  it('number target accepts number/boolean/string', () => {
    expect(areTypesCompatible('number',  'number')).toBe(true)
    expect(areTypesCompatible('boolean', 'number')).toBe(true)
    expect(areTypesCompatible('string',  'number')).toBe(true)
    expect(areTypesCompatible('color',   'number')).toBe(false)
    expect(areTypesCompatible('vec2',    'number')).toBe(false)
  })

  it('boolean target accepts number/boolean', () => {
    expect(areTypesCompatible('number',  'boolean')).toBe(true)
    expect(areTypesCompatible('boolean', 'boolean')).toBe(true)
    expect(areTypesCompatible('string',  'boolean')).toBe(false)
  })

  it('string target accepts anything', () => {
    expect(areTypesCompatible('number', 'string')).toBe(true)
    expect(areTypesCompatible('color',  'string')).toBe(true)
  })

  it('color/vec2 require matching source', () => {
    expect(areTypesCompatible('color', 'color')).toBe(true)
    expect(areTypesCompatible('vec2',  'vec2')).toBe(true)
    expect(areTypesCompatible('number','color')).toBe(false)
    expect(areTypesCompatible('color', 'vec2')).toBe(false)
  })
})

describe('isWireBroken (BL-05)', () => {
  it('returns false when both ends resolve', () => {
    const scene = makeScene({
      layers: [{ id: 'rect1', type: 'shape', name: 'R' } as Layer],
      parameters: [{ id: 'slider1', name: 'S', type: 'number', defaultValue: 0 }],
    })
    const wire: ParameterWire = {
      id: 'w', enabled: true,
      source: { propertyPath: 'slider1', valueType: 'number' },
      target: { layerId: 'rect1', propertyPath: 'opacity', valueType: 'number' },
      expression: 'source', blendMode: 'override', createdAt: NOW, updatedAt: NOW,
    }
    expect(isWireBroken(wire, scene)).toBe(false)
  })

  it('returns true when source parameter missing', () => {
    const scene = makeScene({
      layers: [{ id: 'rect1', type: 'shape', name: 'R' } as Layer],
    })
    const wire: ParameterWire = {
      id: 'w', enabled: true,
      source: { propertyPath: 'ghost', valueType: 'number' },
      target: { layerId: 'rect1', propertyPath: 'opacity', valueType: 'number' },
      expression: 'source', blendMode: 'override', createdAt: NOW, updatedAt: NOW,
    }
    expect(isWireBroken(wire, scene)).toBe(true)
  })

  it('returns true when target layer missing', () => {
    const scene = makeScene({
      parameters: [{ id: 'slider1', name: 'S', type: 'number', defaultValue: 0 }],
    })
    const wire: ParameterWire = {
      id: 'w', enabled: true,
      source: { propertyPath: 'slider1', valueType: 'number' },
      target: { layerId: 'ghost', propertyPath: 'opacity', valueType: 'number' },
      expression: 'source', blendMode: 'override', createdAt: NOW, updatedAt: NOW,
    }
    expect(isWireBroken(wire, scene)).toBe(true)
  })
})
