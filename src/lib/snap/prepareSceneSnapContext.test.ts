import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { prepareSceneSnapContext } from './prepareSceneSnapContext'

describe('evaluated snap geometry preparation', () => {
  it('separates parent bounds from moving subtrees and excludes hidden ancestors', () => {
    const parent = { ...newRectLayer(), id: 'parent', size: { width: 200, height: 100 } }
    parent.transform = { ...parent.transform, x: 100, y: 50, scaleX: 2, scaleY: 2, anchorX: 0, anchorY: 0 }
    const child = { ...newRectLayer(), id: 'child', parentId: parent.id }
    const sibling = { ...newRectLayer(), id: 'sibling', parentId: parent.id }
    const hidden = { ...newRectLayer(), id: 'hidden', hidden: true }
    const hiddenChild = { ...newRectLayer(), id: 'hidden-child', parentId: hidden.id }
    const descendant = { ...newRectLayer(), id: 'descendant', parentId: child.id }
    const scene = { ...emptyScene(), layers: [parent, child, sibling, hidden, hiddenChild, descendant] }
    const result = prepareSceneSnapContext(scene, 0, undefined, [child.id])
    expect(result.otherLayers.map(layer => layer.id)).toEqual(['sibling'])
    expect(result.parentBounds).toEqual([{ x: 100, y: 50, width: 400, height: 200 }])
    expect(prepareSceneSnapContext(scene, 0, undefined, [child.id], new Set()).otherLayers).toEqual([])
    expect(prepareSceneSnapContext(scene, 0, undefined, [parent.id, child.id]).parentBounds).toEqual([
      { x: 0, y: 0, width: scene.composition.width, height: scene.composition.height },
    ])
  })
})
