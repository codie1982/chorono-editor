import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../defaults'
import { makeDeleteLayerCmd, makeDeleteLayersCmd } from './commands-layer'

describe('atomic layer forest deletion', () => {
  it('deduplicates overlapping roots, removes their tracks and restores exact source on Undo/Redo', () => {
    const layers = ['parent', 'child', 'peer', 'keep'].map(id => ({ ...newRectLayer(), id, name: id }))
    layers[1].parentId = 'parent'
    const timeline = newTimeline()
    const scene = { ...emptyScene(), layers, timelines: [{ ...timeline, layerIds: layers.map(l => l.id),
      tracks: layers.map(l => ({ target: `layers.${l.id}.transform.x`, keyframes: [{ id: `key-${l.id}`, timeMs: 17, value: 31, easing: { type: 'easeIn' as const } }] })) }] }
    const original = JSON.stringify(scene), ids = ['parent', 'child', 'peer']
    const command = makeDeleteLayersCmd(ids); ids.push('keep')
    const next = command.execute(scene)
    expect(next.layers.map(l => l.id)).toEqual(['keep'])
    expect(next.timelines[0].layerIds).toEqual(['keep'])
    expect(next.timelines[0].tracks.map(t => t.target)).toEqual(['layers.keep.transform.x'])
    expect(JSON.stringify(command.undo(next))).toBe(original)
    expect(command.execute(command.undo(next))).toEqual(next)
    expect(JSON.stringify(scene)).toBe(original)
  })
  it('keeps the singleton API and ignores stale/missing IDs without rewriting source', () => {
    const layer = newRectLayer(), scene = { ...emptyScene(), layers: [layer] }
    expect(makeDeleteLayersCmd(['stale']).execute(scene)).toBe(scene)
    const command = makeDeleteLayerCmd(layer), next = command.execute(scene)
    expect(next.layers).toEqual([])
    expect(command.undo(next)).toBe(scene)
  })
})
