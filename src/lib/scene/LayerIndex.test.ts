import { describe, expect, it } from 'vitest'
import type { Layer } from '@/lib/types'
import { LayerIndex } from './LayerIndex'

function layer(id: string, parentId?: string): Layer {
  return { id, name: id, type: 'group', parentId, opacity: 1,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 } }
}

describe('LayerIndex snapshot relationships', () => {
  it('preserves input root/sibling stacking order without promoting missing-parent children', () => {
    const childB = layer('b', 'parent'), parent = layer('parent')
    const childA = layer('a', 'parent'), orphan = layer('orphan', 'missing'), root = layer('root')
    const input = [childB, parent, orphan, root, childA]
    const index = new LayerIndex(input)
    expect(index.roots).toEqual([parent, root])
    expect(index.childrenOf(parent.id)).toEqual([childB, childA])
    expect(index.childrenOf('missing')).toEqual([orphan])
    expect(index.get('orphan')).toBe(orphan)
    expect(input).toEqual([childB, parent, orphan, root, childA])
  })

  it('borrows model objects, protects relationship arrays and handles empty/missing ids', () => {
    const item = layer('root'), child = layer('child', item.id)
    const index = new LayerIndex([item, child])
    expect(index.get(item.id)).toBe(item)
    expect(Object.isFrozen(item)).toBe(false)
    expect(Object.isFrozen(index.roots)).toBe(true)
    expect(Object.isFrozen(index.childrenOf(item.id))).toBe(true)
    expect(index.get('absent')).toBeUndefined()
    expect(index.childrenOf('absent')).toEqual([])
    expect(new LayerIndex([]).roots).toEqual([])
  })

  it('has Array.find first-match behavior for invalid duplicate ids, while preserving list entries', () => {
    const a = layer('duplicate'), b = layer('duplicate')
    const index = new LayerIndex([a, b])
    expect(index.get(a.id)).toBe(a)
    expect(index.roots).toEqual([a, b])
  })

  it('does not expand parent cycles or apply visibility/solo/time policy', () => {
    const a = layer('a', 'b'), b = layer('b', 'a'), hidden = layer('hidden')
    hidden.hidden = true; hidden.endMs = -1
    const index = new LayerIndex([a, b, hidden])
    expect(index.roots).toEqual([hidden])
    expect(index.childrenOf(a.id)).toEqual([b])
    expect(index.childrenOf(b.id)).toEqual([a])
  })
})
