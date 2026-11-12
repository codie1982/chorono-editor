import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'
import { makeGroupSiblingLayersCmd, makeMoveLayerInTreeCmd } from './HierarchyCommands'

function fixture() {
  const scene = emptyScene(), a = { ...newRectLayer(), id: 'a', type: 'group' as const }, b = { ...newRectLayer(), id: 'b', type: 'group' as const }
  a.transform = { ...a.transform, x: 120, y: 10, rotationDeg: 20, scaleX: 2, scaleY: 2 }
  b.transform = { ...b.transform, x: -30, y: 70, rotationDeg: -10 }
  const branch = { ...newRectLayer(), id: 'branch', type: 'group' as const, parentId: 'a' }
  branch.transform = { ...branch.transform, x: 17, rotationDeg: 15, anchorX: 21, anchorY: 9 }
  const child = { ...newRectLayer(), id: 'child', parentId: 'branch' }
  scene.layers = [child, a, b, branch]
  const timeline = newTimeline(); timeline.tracks = [{ target: 'layers.child.transform.x', keyframes: [
    { id: 'manual-a', timeMs: 0, value: 7, easing: { type: 'easeOut' } },
    { id: 'manual-b', timeMs: 1000, value: 80, easing: { type: 'hold' } },
  ] }]; scene.timelines = [timeline]
  return scene
}

describe('safe native hierarchy commands', () => {
  it('preserves anchored world geometry and descendant animation at several times, with exact undo', () => {
    const scene = fixture(), command = makeMoveLayerInTreeCmd(scene, 'branch', 'b', 3)!, next = command.execute(scene)
    for (const time of [0, 250, 750, 1000]) {
      const before = resolveLayerWorldMatrix(scene.layers[0], scene, time).toArray()
      const after = resolveLayerWorldMatrix(next.layers.find(layer => layer.id === 'child')!, next, time).toArray()
      after.forEach((value, i) => expect(value).toBeCloseTo(before[i], 9))
    }
    expect(next.timelines).toBe(scene.timelines)
    expect(next.layers.find(layer => layer.id === 'branch')?.transform.anchorX).toBe(21)
    expect(command.undo(next)).toEqual(scene)
    expect(() => command.execute({ ...scene, layers: [...scene.layers] })).toThrow(/changed/)
  })

  it('rejects animated source/ancestor transforms, cycles, missing/non-group parents and inherited protection', () => {
    const scene = fixture()
    expect(() => makeMoveLayerInTreeCmd(scene, 'child', 'b', 0)).toThrow(/animated/)
    expect(() => makeMoveLayerInTreeCmd(scene, 'branch', 'child', 0)).toThrow(/parent|cycle/)
    expect(() => makeMoveLayerInTreeCmd(scene, 'branch', 'missing', 0)).toThrow(/not found/)
    for (const field of ['locked', 'frozen'] as const) {
      const protectedScene = { ...scene, layers: scene.layers.map(layer => layer.id === 'child' ? { ...layer, [field]: true } : layer) }
      expect(() => makeMoveLayerInTreeCmd(protectedScene, 'branch', 'b', 0)).toThrow(/Unlock/)
    }
    const animated = { ...scene, timelines: [{ ...scene.timelines[0], tracks: [...scene.timelines[0].tracks, { target: 'layers.a.transform.x', keyframes: [] }] }] }
    expect(() => makeMoveLayerInTreeCmd(animated, 'branch', 'b', 0)).toThrow(/animated/)
  })

  it('rejects singular/sheared conversion without altering source', () => {
    const scene = fixture(), before = JSON.stringify(scene)
    const singular = { ...scene, layers: scene.layers.map(layer => layer.id === 'b' ? { ...layer, transform: { ...layer.transform, scaleX: 0 } } : layer) }
    expect(() => makeMoveLayerInTreeCmd(singular, 'branch', 'b', 0)).toThrow(/singular/)
    const shear = { ...scene, layers: scene.layers.map(layer => layer.id === 'a' ? { ...layer, transform: { ...layer.transform, scaleY: 1 } } : layer) }
    expect(() => makeMoveLayerInTreeCmd(shear, 'branch', 'b', 0)).toThrow(/shear/)
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('allows same-parent reordering of animated layers and identity grouping of sibling branches', () => {
    const scene = fixture()
    const reorder = makeMoveLayerInTreeCmd(scene, 'child', 'branch', 4)!.execute(scene)
    expect(reorder.layers.find(layer => layer.id === 'child')?.transform).toBe(scene.layers[0].transform)
    const sibling = { ...newRectLayer(), id: 'sibling', parentId: 'a' }
    scene.layers.push(sibling)
    const command = makeGroupSiblingLayersCmd(scene, ['branch', 'child', 'sibling'])!, grouped = command.execute(scene)
    const group = grouped.layers.find(layer => layer.id === command.groupId)!
    expect(group.parentId).toBe('a')
    expect(grouped.layers.find(layer => layer.id === 'child')?.parentId).toBe('branch')
    expect(grouped.layers.find(layer => layer.id === 'branch')?.transform).toBe(scene.layers[3].transform)
    expect(grouped.timelines).toBe(scene.timelines)
    expect(() => makeGroupSiblingLayersCmd(scene, ['branch', 'b'])).toThrow(/sibling/)
  })
})
