import { describe, expect, it } from 'vitest'
import type { Layer } from '../../types'
import { newRectLayer } from '../../defaults'
import { LayerIndex } from '../LayerIndex'
import { buildEditorLayerRows, selectedBranchIds } from './editorLayerRows'
import { buildSceneExplorerRows } from '../../sceneExplorer/sceneExplorerModel'

const layer = (id: string, parentId?: string): Layer => ({ ...newRectLayer(), id, name: id, parentId })

describe('shared editor layer hierarchy', () => {
  it('places parents before serialized children, retains sibling order and never detaches a pinned child', () => {
    const layers = [layer('b', 'root'), layer('root'), { ...layer('a', 'root'), pinned: true },
      layer('grand', 'a'), { ...layer('pinned'), pinned: true }, layer('other')]
    const before = JSON.stringify(layers)
    const rows = buildEditorLayerRows(layers)
    expect(rows.map(row => [row.layer.id, row.depth])).toEqual([
      ['pinned', 0], ['root', 0], ['b', 1], ['a', 1], ['grand', 2], ['other', 0]])
    expect(buildSceneExplorerRows(layers, { collapsedIds: new Set() }).map(row => [row.id, row.depth]))
      .toEqual(rows.map(row => [row.layer.id, row.depth]))
    expect(JSON.stringify(layers)).toBe(before)
  })

  it('sorts only siblings, retains ancestor context and collapse never leaks descendants as roots', () => {
    const layers = [layer('root'), layer('z', 'root'), layer('a', 'root'), layer('leaf', 'a'), layer('other')]
    const options = { matches: new Set(['leaf', 'z']), compare: (a: Layer, b: Layer) => a.name.localeCompare(b.name) }
    expect(buildEditorLayerRows(layers, options).map(row => [row.layer.id, row.contextOnly])).toEqual([
      ['root', true], ['a', true], ['leaf', false], ['z', false]])
    expect(buildEditorLayerRows(layers, { ...options, collapsedIds: new Set(['root']) }).map(row => row.layer.id)).toEqual(['root'])
    expect(buildEditorLayerRows(layers, { matches: new Set(), revealIds: ['leaf'] }).map(row => row.layer.id)).toEqual(['root', 'a', 'leaf'])
    expect(buildEditorLayerRows(layers, { matches: new Set() })).toEqual([])
  })

  it('find is an additive path exception and removing it restores the exact filter result', () => {
    const layers = [layer('root'), layer('a', 'root'), layer('b', 'root'), layer('outside')]
    const matches = new Set(['outside'])
    const normal = buildEditorLayerRows(layers, { matches })
    expect(buildEditorLayerRows(layers, { matches, revealIds: ['b'] }).map(row => row.layer.id)).toEqual(['root', 'b', 'outside'])
    expect(Array.from(matches)).toEqual(['outside'])
    expect(buildEditorLayerRows(layers, { matches })).toEqual(normal)
  })

  it('unions multiple selected branches and includes hidden descendants independently of visible rows', () => {
    const layers = [layer('a'), { ...layer('aa', 'a'), hidden: true }, layer('b'), layer('bb', 'b'), layer('other')]
    expect(Array.from(selectedBranchIds(layers, 'other', new Set(['a', 'aa', 'b'])))).toEqual(['a', 'aa', 'b', 'bb'])
    expect(Array.from(selectedBranchIds(layers, 'b', new Set()))).toEqual(['b', 'bb'])
  })

  it('handles a 5000-level hierarchy, missing parents and cycles without recursion or repairs', () => {
    const deep = Array.from({ length: 5000 }, (_, i) => layer(String(i), i ? String(i - 1) : undefined)).reverse()
    const rows = buildEditorLayerRows(deep, { matches: new Set(['4999']) })
    expect(rows).toHaveLength(5000); expect(rows[4999].depth).toBe(4999)
    const malformed = [layer('a', 'b'), layer('b', 'a'), layer('orphan', 'absent')]
    const before = JSON.stringify(malformed)
    expect(new Set(buildEditorLayerRows(malformed).map(row => row.layer.id)).size).toBe(3)
    expect(buildEditorLayerRows(malformed, { collapsedIds: new Set(['a']) }).map(row => row.layer.id)).toEqual(['orphan', 'a'])
    expect(JSON.stringify(malformed)).toBe(before)
  })

  it('computes ancestor closure once across shared paths, tolerating missing identities and cycles', () => {
    const index = new LayerIndex([layer('root'), layer('a', 'root'), layer('b', 'root'), layer('leaf', 'a')])
    expect(Array.from(index.ancestorIds(['leaf', 'b', 'missing'], false))).toEqual(['a', 'root'])
    expect(Array.from(index.ancestorIds(['a', 'leaf'], false))).toEqual(['root', 'a'])
    const cyclic = new LayerIndex([layer('x', 'y'), layer('y', 'x')])
    expect(cyclic.ancestorIds(['x']).size).toBe(2)
  })
})
