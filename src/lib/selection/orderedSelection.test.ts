import { describe, expect, it } from 'vitest'
import { createLayerSelection } from './layerSelection'
import { selectOrderedItem } from './orderedSelection'

const order = ['z', 'parent', 'child', 'b', 'a']
const range = { range: true, additive: false }, toggle = { range: false, additive: true }
describe('ordered layer selection', () => {
  it('extends and shrinks in displayed order from a stable anchor, in both directions', () => {
    const initial = createLayerSelection(['parent'], 'parent')
    const extended = selectOrderedItem(initial, order, 'a', range, 'parent')
    expect(Array.from(extended.selection.selectedIds)).toEqual(['parent', 'child', 'b', 'a'])
    expect(extended.selection.primaryId).toBe('a')
    const shrunk = selectOrderedItem(extended.selection, order, 'child', range, extended.anchorId)
    expect(Array.from(shrunk.selection.selectedIds)).toEqual(['parent', 'child'])
    expect(Array.from(selectOrderedItem(shrunk.selection, order, 'z', range, shrunk.anchorId).selection.selectedIds)).toEqual(['z', 'parent'])
    expect(Array.from(initial.selectedIds)).toEqual(['parent'])
  })
  it('Ctrl/Cmd toggles a single item and Ctrl/Cmd+Shift adds a range', () => {
    const initial = createLayerSelection(['z', 'a'], 'a')
    const removed = selectOrderedItem(initial, order, 'a', toggle, null)
    expect(Array.from(removed.selection.selectedIds)).toEqual(['z'])
    expect(removed.selection.primaryId).toBe('z')
    const added = selectOrderedItem(initial, order, 'b', { range: true, additive: true }, 'parent')
    expect(Array.from(added.selection.selectedIds)).toEqual(['z', 'a', 'parent', 'child', 'b'])
  })
  it('uses the entire supplied visible order, independent of virtual DOM windows', () => {
    const rows = Array.from({ length: 3000 }, (_, i) => `row-${i}`)
    const selected = selectOrderedItem(createLayerSelection(['row-10']), rows, 'row-2000', range, 'row-10')
    expect(selected.selection.selectedIds.size).toBe(1991)
    expect(Array.from(selectOrderedItem(createLayerSelection(['parent']), ['parent', 'b', 'a'], 'a', range, 'parent').selection.selectedIds)).toEqual(['parent', 'b', 'a'])
  })
  it('recovers from removed/filtered anchors and clears to a fresh clicked anchor', () => {
    const current = createLayerSelection(['missing', 'b'], 'b')
    expect(Array.from(selectOrderedItem(current, order, 'a', range, 'missing').selection.selectedIds)).toEqual(['b', 'a'])
    const fresh = selectOrderedItem(createLayerSelection([]), order, 'a', range, null)
    expect(Array.from(fresh.selection.selectedIds)).toEqual(['a'])
    expect(fresh.anchorId).toBe('a')
    expect(selectOrderedItem(current, order, 'unknown', range, null).selection).toBe(current)
  })
})
