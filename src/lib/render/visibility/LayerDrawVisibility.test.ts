import { describe, expect, it } from 'vitest'
import { newRectLayer } from '@/lib/defaults'
import type { Layer } from '@/lib/types'
import { LayerDrawVisibility } from './LayerDrawVisibility'

/** One nested Solo selection with a sibling and independent audio track. */
function fixture(): Layer[] {
  return [
    { ...newRectLayer(), id: 'group', type: 'group' },
    { ...newRectLayer(), id: 'solo', parentId: 'group', solo: true },
    { ...newRectLayer(), id: 'sibling', parentId: 'group' },
    { ...newRectLayer(), id: 'other' },
    { ...newRectLayer(), id: 'audio', type: 'audio', solo: true },
  ]
}

describe('shared scene draw Solo visibility', () => {
  it('keeps ancestor transforms, omits siblings, but permits referenced dependencies', () => {
    const layers = fixture(), visibility = new LayerDrawVisibility(layers, 0)
    expect(layers.filter(layer => visibility.sceneChild(layer)).map(layer => layer.id)).toEqual(['group', 'solo', 'audio'])
    expect(visibility.root(layers[0])).toBe(true)
    expect(visibility.active(layers[2])).toBe(true)
    expect(visibility.root(layers[3])).toBe(false)
  })

  it('includes a Solo group subtree while respecting hidden/time gates and independent audio', () => {
    const layers = fixture().map(layer => ({ ...layer, solo: layer.id === 'group' || layer.id === 'audio' }))
    const visibility = new LayerDrawVisibility(layers, 0)
    expect(visibility.sceneChild(layers[2])).toBe(true)
    expect(visibility.sceneChild({ ...layers[2], hidden: true })).toBe(false)
    expect(visibility.sceneChild({ ...layers[2], startMs: 1 })).toBe(false)
    const audioOnly = layers.map(layer => ({ ...layer, solo: layer.id === 'audio' }))
    expect(new LayerDrawVisibility(audioOnly, 0).root(audioOnly[3])).toBe(true)
  })
})
