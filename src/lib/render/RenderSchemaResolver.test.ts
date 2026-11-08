import { describe, expect, it, vi } from 'vitest'
import { newRectLayer } from '@/lib/defaults'
import type { LayerDefinition } from '@/lib/registry/LayerDefinition'
import type { PropertyGroup } from '@/lib/registry/PropertySchema'
import { RenderSchemaResolver } from './RenderSchemaResolver'
import { materializeLayerOverrides } from './materializeOverrides'

/** Small canonical schema with a real render constraint, rather than timing
 * assertions that vary with JIT/host load. */
function groups(max: number): PropertyGroup[] {
  return [{ title: 'Appearance', schemas: [{ id: 'opacity', path: 'opacity', group: 'Appearance',
    label: 'Opacity', valueType: 'number', animatable: true, defaultValue: 1, min: 0, max }] }]
}

describe('RenderSchemaResolver', () => {
  it('compiles one certified definition for 3000 layers and preserves render clamping', () => {
    const provider = vi.fn(() => groups(0.5))
    const definition: LayerDefinition = { kind: 'rect', label: 'Rectangle', iconKey: 'rectangle',
      category: 'Basic Shapes', createDefault: newRectLayer, getPropertyGroups: provider, propertyGroupsAreStatic: true }
    const resolver = new RenderSchemaResolver(() => definition)
    const layer = newRectLayer()
    const first = resolver.resolve(layer)
    for (let i = 0; i < 3000; i++) expect(resolver.resolve({ ...layer, id: `rect-${i}` })).toBe(first)
    const frame = materializeLayerOverrides(layer, new Map([[`layers.${layer.id}.opacity`, 0.9]]), resolver.resolve)
    expect(frame.opacity).toBe(0.5)
    expect(layer.opacity).toBe(1)
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('keeps custom dynamic schemas live for every layer and constraint change', () => {
    let max = 0.2
    const provider = vi.fn(() => groups(max))
    const definition: LayerDefinition = { kind: 'rect', label: 'Rectangle', iconKey: 'rectangle',
      category: 'Basic Shapes', createDefault: newRectLayer, getPropertyGroups: provider }
    const resolver = new RenderSchemaResolver(() => definition)
    const layer = newRectLayer(), overrides = new Map([[`layers.${layer.id}.opacity`, 0.9]])
    expect(materializeLayerOverrides(layer, overrides, resolver.resolve).opacity).toBe(0.2)
    max = 0.7
    expect(materializeLayerOverrides(layer, overrides, resolver.resolve).opacity).toBe(0.7)
    expect(provider).toHaveBeenCalledTimes(2)
    // A legacy array adapter still has exactly the same numeric semantics.
    expect(materializeLayerOverrides(layer, overrides, () => groups(max)[0].schemas).opacity).toBe(0.7)
  })

  it('invalidates a replaced provider and honors registry replacement/removal', () => {
    const definition: LayerDefinition = { kind: 'rect', label: 'Rectangle', iconKey: 'rectangle',
      category: 'Basic Shapes', createDefault: newRectLayer, getPropertyGroups: () => groups(0.3), propertyGroupsAreStatic: true }
    let current: LayerDefinition | undefined = definition
    const resolver = new RenderSchemaResolver(() => current), layer = newRectLayer()
    expect(resolver.resolve(layer).get('opacity')?.max).toBe(0.3)
    definition.getPropertyGroups = () => groups(0.6)
    expect(resolver.resolve(layer).get('opacity')?.max).toBe(0.6)
    current = { ...definition, getPropertyGroups: () => [...groups(0.6), ...groups(0.8)] }
    expect(resolver.resolve(layer).get('opacity')?.max).toBe(0.8)
    current = undefined
    expect(resolver.resolve(layer).size).toBe(0)
  })
})
