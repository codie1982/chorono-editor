import { describe, expect, it } from 'vitest'
import { combineLayerSelection, createLayerSelection, retainLayerSelection, toggleLayerSelection } from '../layerSelection'

describe('layer selection membership and primary', () => {
  it('toggles additions and removal of the primary without mutating prior snapshots', () => {
    const first = createLayerSelection(['a'], 'a')
    const added = toggleLayerSelection(first, 'b')
    expect(added.primaryId).toBe('b')
    expect(Array.from(first.selectedIds)).toEqual(['a'])
    const removed = toggleLayerSelection(added, 'b')
    expect(Array.from(removed.selectedIds)).toEqual(['a'])
    expect(removed.primaryId).toBe('a')
    expect(toggleLayerSelection(removed, 'a').primaryId).toBeNull()
  })

  it('preserves the primary when a secondary member is removed', () => {
    const selection = createLayerSelection(['a', 'b', 'c'], 'b')
    expect(toggleLayerSelection(selection, 'a').primaryId).toBe('b')
  })

  it('applies bulk replacement, addition and subtraction with an always valid primary', () => {
    const input = new Set(['a', 'b'])
    const selection = createLayerSelection(input, 'b')
    const added = combineLayerSelection(selection, ['c'], 'add')
    expect(added.primaryId).toBe('b')
    const subtracted = combineLayerSelection(added, ['b'], 'subtract')
    expect(subtracted.primaryId).toBe('a')
    expect(combineLayerSelection(selection, [], 'replace')).toEqual(createLayerSelection([]))
    expect(combineLayerSelection(selection, ['c', 'c', 'd'], 'replace').primaryId).toBe('c')
    expect(input).toEqual(new Set(['a', 'b']))
  })

  it('drops removed subtree members while retaining surviving selection after delete or undo', () => {
    const selection = createLayerSelection(['group', 'child', 'peer'], 'child')
    const remaining = retainLayerSelection(selection, new Set(['peer', 'unselected']))
    expect(remaining).toEqual(createLayerSelection(['peer'], 'peer'))
    expect(retainLayerSelection(remaining, new Set(['peer']))).toBe(remaining)
    expect(retainLayerSelection(remaining, new Set()).primaryId).toBeNull()
  })
})
