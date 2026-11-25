import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../defaults'
import type { ChronoScene, Layer } from '../types'
import { makeSelectionSoloCmd } from './selectionSolo'
import { editorSoloScope } from '../scene/visibility/editorSoloScope'
import { parseSceneJson } from '../format/scene/SceneJsonConverter'

/** Nested authored sources, with a separate audio Solo domain. */
function fixture(): ChronoScene {
  const layer = (id: string, extra: Partial<Layer> = {}): Layer => ({ ...newRectLayer(), id, ...extra })
  return { ...emptyScene(), layers: [
    layer('group', { type: 'group' }), layer('child', { parentId: 'group' }),
    layer('nested', { type: 'group', parentId: 'group' }), layer('deep', { parentId: 'nested' }),
    layer('other'), layer('audio', { type: 'audio', solo: true }),
  ] }
}

const solos = (scene: ChronoScene) => scene.layers.filter(layer => layer.solo).map(layer => layer.id)

describe('selection Solo command', () => {
  it('replaces a multi-object Solo with one object and toggles that exact selection off', () => {
    const scene = fixture(), before = JSON.stringify(scene)
    const many = makeSelectionSoloCmd(scene, ['child', 'other'])!
    const multi = many.execute(scene)
    expect(solos(multi)).toEqual(['child', 'other', 'audio'])
    const single = makeSelectionSoloCmd(multi, ['other'])!
    const one = single.execute(multi)
    expect(solos(one)).toEqual(['other', 'audio'])
    const off = makeSelectionSoloCmd(one, ['other'])!.execute(one)
    expect(solos(off)).toEqual(['audio'])
    expect(single.undo(one)).toEqual(multi)
    expect(many.undo(multi)).toEqual(scene)
    expect(many.execute(many.undo(multi))).toEqual(multi)
    expect(parseSceneJson(JSON.stringify(multi), true)).toEqual(multi)
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('normalizes overlapping group selection and includes every nested child through inherited scope', () => {
    const scene = fixture()
    const next = makeSelectionSoloCmd(scene, ['group', 'child', 'deep', 'group'])!.execute(scene)
    expect(solos(next)).toEqual(['group', 'audio'])
    expect(Array.from(editorSoloScope(next.layers)!)).toEqual(['group', 'child', 'nested', 'deep', 'audio'])
    expect(solos(makeSelectionSoloCmd(next, ['deep'])!.execute(next))).toEqual(['deep', 'audio'])
    expect(solos(makeSelectionSoloCmd(next, ['group', 'deep'])!.execute(next))).toEqual(['audio'])
  })

  it('leaves empty/missing selections unchanged and supports explicit mixed-domain requests', () => {
    const scene = fixture()
    expect(makeSelectionSoloCmd(scene, [])).toBeNull()
    expect(makeSelectionSoloCmd(scene, ['absent'])).toBeNull()
    const next = makeSelectionSoloCmd(scene, ['other', 'audio'], true)!.execute(scene)
    expect(solos(next)).toEqual(['other', 'audio'])
    expect(makeSelectionSoloCmd(next, ['other', 'audio'], true)).toBeNull()
    expect(solos(makeSelectionSoloCmd(next, ['audio'], false)!.execute(next))).toEqual(['other'])
    const cyclic = { ...scene, layers: scene.layers.map(layer => layer.id === 'group' ? { ...layer, parentId: 'deep' } : layer) }
    expect(makeSelectionSoloCmd(cyclic, ['group'])).toBeNull()
  })
})
