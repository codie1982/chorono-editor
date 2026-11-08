import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newStateMachine, newTimeline } from '../../defaults'
import { cloneTimeline } from '../cloneTimeline'
import { resolveSelectedKeyframes } from '../keyframeSelection'
import { collectKeyframeClipboard } from '../keyframeClipboard'
import { makeBulkDeleteKfCmd } from '../../editor/commands-keyframe'
import { getTimelineDeletionBlockReason, makeDeleteTimelineCmd } from '../../editor/commands-timeline'
import { initHistory, pushHistory, undoHistory } from '../../editor/history'
import { evaluateNumericTrack } from '../../evaluator'

function fixture() {
  const scene = emptyScene()
  const layer = newRectLayer()
  scene.layers = [layer]
  scene.timelines = [{ ...newTimeline(), id: 'intro', layerIds: [layer.id], tracks: [{
    target: `layers.${layer.id}.opacity`,
    modifiers: [{ id: 'offset', type: 'offset', enabled: true, blendMode: 'replace', weight: 1, parameters: { delta: 0.1 } }],
    keyframes: [
      { id: 'a', timeMs: 100, value: 0, easing: { type: 'customBezier', bezier: { cx1: 0.2, cy1: 0, cx2: 0.8, cy2: 1 } } },
      { id: 'b', timeMs: 600, value: 1, easing: { type: 'linear' } },
    ],
  }] }]
  return scene
}

describe('independent animation editing', () => {
  it('clones editable keys with distinct identities and unchanged evaluated motion', () => {
    const scene = fixture()
    const original = structuredClone(scene)
    const copy = cloneTimeline(scene, 'intro', 'loop')
    const sourceTrack = scene.timelines[0].tracks[0]
    const clonedTrack = copy.tracks[0]
    expect(new Set([...sourceTrack.keyframes, ...clonedTrack.keyframes].map((key) => key.id)).size).toBe(4)
    for (const time of [0, 100, 250, 500, 600, 1000]) {
      expect(evaluateNumericTrack(clonedTrack, time)).toBeCloseTo(evaluateNumericTrack(sourceTrack, time)!)
    }
    clonedTrack.keyframes[0].easing.bezier!.cy1 = 0.7
    clonedTrack.modifiers![0].parameters.delta = 0.9
    expect(scene).toEqual(original)
  })

  it('deletes only keys from the focused legacy timeline and restores them in one undo', () => {
    const scene = fixture()
    scene.timelines.push({ ...structuredClone(scene.timelines[0]), id: 'legacy-copy' })
    const keys = resolveSelectedKeyframes(scene, 'legacy-copy', new Set(['a']))
    expect(keys.map((entry) => entry.timelineId)).toEqual(['legacy-copy'])
    const command = makeBulkDeleteKfCmd(keys)
    const history = pushHistory(initHistory(scene), command.execute(scene))
    expect(history.present.timelines[0]).toEqual(scene.timelines[0])
    expect(history.present.timelines[1].tracks[0].keyframes.map((key) => key.id)).toEqual(['b'])
    expect(undoHistory(history).present).toEqual(scene)
  })

  it('copies only the focused animation and keeps relative timing and a value snapshot', () => {
    const scene = fixture()
    scene.timelines.push({ ...structuredClone(scene.timelines[0]), id: 'legacy-copy' })
    const entries = collectKeyframeClipboard(scene, 'legacy-copy', new Set(['a', 'b']))
    expect(entries.map((entry) => entry.timelineId)).toEqual(['legacy-copy', 'legacy-copy'])
    expect(entries.map((entry) => entry.relativeMs)).toEqual([0, 500])
    scene.timelines[1].tracks[0].keyframes[0].easing.bezier!.cy1 = 0.6
    expect(entries[0].kf.easing.bezier!.cy1).toBe(0)
    expect(resolveSelectedKeyframes(scene, 'missing', new Set(['a']))).toEqual([])
  })

  it('guards state-machine references at command execution and allows deletion after reassignment', () => {
    const scene = fixture()
    const tl = scene.timelines[0]
    const command = makeDeleteTimelineCmd(tl)
    scene.stateMachines = [newStateMachine('intro', 'Menu states')]
    expect(getTimelineDeletionBlockReason(scene, 'intro')).toContain('Menu states')
    expect(() => command.execute(scene)).toThrow(/Reassign/)
    expect(scene.timelines).toHaveLength(1)
    scene.stateMachines[0].states[0].timelineId = 'other'
    expect(getTimelineDeletionBlockReason(scene, 'intro')).toBeNull()
    expect(command.execute(scene).timelines).toEqual([])
  })
})
