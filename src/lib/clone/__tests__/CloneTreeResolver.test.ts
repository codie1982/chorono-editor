import { describe, it, expect } from 'vitest'
import { cloneLayerTree, collectDescendants } from '../CloneTreeResolver'
import type { Layer } from '../../types'

function makeLayer(
  id: string,
  parentId: string | undefined,
  overrides: Partial<Layer> = {},
): Layer {
  return {
    id,
    name: id,
    type: parentId === undefined ? 'group' : 'shape',
    shape: 'rect',
    parentId,
    transform: {
      x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0,
    },
    opacity: 1,
    ...overrides,
  }
}

describe('collectDescendants', () => {
  it('returns empty for leaf layer with no children', () => {
    const layers = [makeLayer('a', undefined)]
    expect(collectDescendants('a', layers)).toEqual([])
  })

  it('collects direct children', () => {
    const layers = [
      makeLayer('g', undefined),
      makeLayer('c1', 'g'),
      makeLayer('c2', 'g'),
    ]
    const out = collectDescendants('g', layers)
    expect(out.map((l) => l.id).sort()).toEqual(['c1', 'c2'])
  })

  it('collects deep descendants', () => {
    const layers = [
      makeLayer('g', undefined),
      makeLayer('sub', 'g'),
      makeLayer('leaf', 'sub'),
    ]
    const out = collectDescendants('g', layers)
    expect(out.map((l) => l.id).sort()).toEqual(['leaf', 'sub'])
  })
})

describe('cloneLayerTree', () => {
  it('clones a single leaf with no children', () => {
    const src = makeLayer('rect_a', undefined)
    const tree = cloneLayerTree(src, [src])
    expect(tree.allClones.length).toBe(1)
    expect(tree.clonedRoot.id).not.toBe('rect_a')
    expect(tree.idMap['rect_a']).toBe(tree.clonedRoot.id)
  })

  it('clones a group + remaps child parentId', () => {
    const layers = [
      makeLayer('g1', undefined, { type: 'group' }),
      makeLayer('c1', 'g1'),
      makeLayer('c2', 'g1'),
    ]
    const tree = cloneLayerTree(layers[0], layers)

    expect(tree.allClones.length).toBe(3)

    // Children of the cloned root should point at the NEW root id.
    const newRootId = tree.clonedRoot.id
    const children = tree.allClones.slice(1)
    for (const c of children) {
      expect(c.parentId).toBe(newRootId)
    }
  })

  it('idMap covers every node in the subtree', () => {
    const layers = [
      makeLayer('g', undefined, { type: 'group' }),
      makeLayer('c1', 'g'),
      makeLayer('c2', 'g'),
    ]
    const tree = cloneLayerTree(layers[0], layers)
    expect(Object.keys(tree.idMap).sort()).toEqual(['c1', 'c2', 'g'])
  })

  it('applies offset to root only — children stay in relative position', () => {
    const layers = [
      makeLayer('g', undefined, {
        type: 'group',
        transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
      }),
      makeLayer('child', 'g', {
        transform: { x: 5, y: 5, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
      }),
    ]
    const tree = cloneLayerTree(layers[0], layers, { offsetX: 100, offsetY: 200 })

    expect(tree.clonedRoot.transform.x).toBe(110)
    expect(tree.clonedRoot.transform.y).toBe(220)
    // Child's local coordinates are unchanged (no double-offset).
    const child = tree.allClones[1]
    expect(child.transform.x).toBe(5)
    expect(child.transform.y).toBe(5)
  })

  it('handles deep (grandchild) trees', () => {
    const layers = [
      makeLayer('g', undefined, { type: 'group' }),
      makeLayer('sub', 'g', { type: 'group' }),
      makeLayer('leaf', 'sub'),
    ]
    const tree = cloneLayerTree(layers[0], layers)
    expect(tree.allClones.length).toBe(3)

    const subClone = tree.allClones.find((l) => tree.idMap['sub'] === l.id)!
    const leafClone = tree.allClones.find((l) => tree.idMap['leaf'] === l.id)!
    expect(subClone.parentId).toBe(tree.clonedRoot.id)
    expect(leafClone.parentId).toBe(subClone.id)
  })

  it('produces metadata keyed by NEW ids', () => {
    const layers = [
      makeLayer('g', undefined, { type: 'group' }),
      makeLayer('c', 'g'),
    ]
    const tree = cloneLayerTree(layers[0], layers, { arrayGroupId: 'test_arr' })
    for (const newId of Object.keys(tree.metadata)) {
      expect(tree.metadata[newId].mode).toBe('copy')
      expect(tree.metadata[newId].arrayGroupId).toBe('test_arr')
    }
  })
})
