import { describe, it, expect, beforeEach } from 'vitest'
import { LayerRegistry } from './LayerRegistry'
import type { LayerDefinition } from './LayerDefinition'
import type { Layer } from '@/lib/types'

const mockDef = (kind: string, category: any = 'Basic Shapes'): LayerDefinition => ({
  kind,
  label: kind,
  iconKey: kind,
  category,
  createDefault: () => ({ id: `${kind}_1`, name: kind, type: 'shape', shapeKind: kind } as any),
  getPropertyGroups: () => [],
})

describe('LayerRegistry', () => {
  let registry: LayerRegistry
  beforeEach(() => { registry = new LayerRegistry() })

  it('registers and retrieves by kind', () => {
    const def = mockDef('star')
    registry.register(def)
    expect(registry.get('star')).toBe(def)
  })

  it('throws on duplicate kind', () => {
    registry.register(mockDef('star'))
    expect(() => registry.register(mockDef('star'))).toThrow(/already registered/)
  })

  it('get() returns undefined for unknown kind', () => {
    expect(registry.get('missing')).toBeUndefined()
  })

  it('getOrThrow throws clearly', () => {
    expect(() => registry.getOrThrow('missing')).toThrow(/no definition for kind "missing"/)
  })

  it('preserves registration order in getAll()', () => {
    registry.register(mockDef('a'))
    registry.register(mockDef('b'))
    registry.register(mockDef('c'))
    expect(registry.getAll().map(d => d.kind)).toEqual(['a', 'b', 'c'])
  })

  it('getByCategory filters', () => {
    registry.register(mockDef('a', 'Basic Shapes'))
    registry.register(mockDef('b', 'Path & Vector'))
    registry.register(mockDef('c', 'Basic Shapes'))
    expect(registry.getByCategory('Basic Shapes').map(d => d.kind)).toEqual(['a', 'c'])
  })

  describe('findForLayer', () => {
    it('matches shape layer by shapeKind', () => {
      const def = mockDef('star')
      registry.register(def)
      const layer = { id: 'l', name: 'L', type: 'shape', shapeKind: 'star' } as Layer
      expect(registry.findForLayer(layer)).toBe(def)
    })

    it('falls back to legacy layer.shape', () => {
      const def = mockDef('rect')
      registry.register(def)
      const layer = { id: 'l', name: 'L', type: 'shape', shape: 'rect' } as Layer
      expect(registry.findForLayer(layer)).toBe(def)
    })

    it('maps text layer type to "text" kind', () => {
      const def = mockDef('text')
      registry.register(def)
      const layer = { id: 'l', name: 'L', type: 'text' } as Layer
      expect(registry.findForLayer(layer)).toBe(def)
    })

    it('returns undefined when no match', () => {
      const layer = { id: 'l', name: 'L', type: 'shape', shapeKind: 'unknown' } as unknown as Layer
      expect(registry.findForLayer(layer)).toBeUndefined()
    })
  })

  it('clear() empties everything', () => {
    registry.register(mockDef('a'))
    registry.register(mockDef('b'))
    registry.clear()
    expect(registry.getAll()).toEqual([])
    expect(registry.get('a')).toBeUndefined()
  })
})
