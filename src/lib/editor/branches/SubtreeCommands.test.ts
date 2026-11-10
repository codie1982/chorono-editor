import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { makeSetSubtreeFlagCmd, type SubtreeFlag } from './SubtreeCommands'
import { executeAuthoredCommand } from '../authoring/AuthoringCommand'
import { attributeSourceChange } from '../authoring/Attribution'
import { fieldAuthoring } from '../authoring/AuthoringQuery'
import { initHistory, pushHistory, undoHistory, redoHistory } from '../history'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'

/** Mixed prior flags and manual geometry/keys exercise real source/history. */
function fixture() {
  const source = emptyScene(), timeline = newTimeline()
  const root = { ...newRectLayer(), id: 'root' }, child = { ...newRectLayer(), id: 'child', parentId: 'root', hidden: true, locked: true, frozen: true }
  child.transform.x = 91; child.name = 'Human clock · 09:05'
  timeline.tracks = [{ target: 'layers.child.transform.x', keyframes: [{ id: 'human-key', timeMs: 50, value: 91, easing: { type: 'easeOut' } }] }]
  return attributeSourceChange(source, { ...source, layers: [child, root, { ...newRectLayer(), id: 'outside' }], timelines: [timeline] },
    { actor: { kind: 'human' }, transactionId: 'manual-before' })
}

describe('shared selected subtree source commands', () => {
  for (const flag of ['hidden', 'locked', 'solo', 'frozen'] as SubtreeFlag[]) it(`${flag}: one history step covers hidden/filtered descendants and restores exact mixed source`, () => {
    const scene = fixture(), before = JSON.stringify(scene)
    const command = makeSetSubtreeFlagCmd(scene, ['root', 'child', 'absent'], flag, true)!
    const next = executeAuthoredCommand(command, scene)
    expect(next.layers.filter(layer => layer.id !== 'outside').every(layer => layer[flag])).toBe(true)
    expect(next.layers[2]).toBe(scene.layers[2])
    expect(next.timelines).toBe(scene.timelines)
    expect(next.layers.map(layer => ({ name: layer.name, parentId: layer.parentId, transform: layer.transform })))
      .toEqual(scene.layers.map(layer => ({ name: layer.name, parentId: layer.parentId, transform: layer.transform })))
    expect(fieldAuthoring(next, ['layer', 'child'], ['transform', 'x']).transactionId).toBe('manual-before')
    const history = pushHistory(initHistory(scene), next)
    expect(history.past).toHaveLength(1)
    expect(undoHistory(history).present).toBe(scene)
    expect(redoHistory(undoHistory(history)).present).toBe(next)
    expect(parseSceneJson(JSON.stringify(next), true)).toEqual(next)
    expect(JSON.stringify(scene)).toBe(before)
    expect(makeSetSubtreeFlagCmd(next, ['root'], flag, true)).toBeNull()
  })

  it('clears complete branches including frozen/locked nodes; missing scope and semantic false are no-ops', () => {
    const scene = fixture()
    for (const flag of ['hidden', 'locked', 'frozen'] as SubtreeFlag[]) {
      const command = makeSetSubtreeFlagCmd(scene, ['root'], flag, false)!
      const next = command.execute(scene)
      expect(next.layers.every(layer => !layer[flag])).toBe(true)
      expect(command.undo(next)).toEqual(scene)
    }
    expect(makeSetSubtreeFlagCmd(scene, ['absent'], 'hidden', true)).toBeNull()
    expect(makeSetSubtreeFlagCmd(scene, ['outside'], 'solo', false)).toBeNull()
  })
})
