import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { initHistory, pushHistory, undoHistory } from '@/lib/editor/history'
import { makeAddAnimationCmd } from '../addAnimationCommand'

function fixture() {
  const scene = emptyScene()
  const layer = newRectLayer()
  const timeline = { ...newTimeline(), id: 'intro', durationMs: 1000 }
  scene.layers = [layer]
  scene.timelines = [timeline, { ...newTimeline(), id: 'other' }]
  return { scene, layer, timeline }
}

describe('Add Animation menu command', () => {
  it('adds the track and first key in one undo step using the current layer value', () => {
    const { scene, layer } = fixture()
    const command = makeAddAnimationCmd('intro', layer.id, 'transform.x', 1500)
    const current = { ...scene, layers: [{ ...layer, transform: { ...layer.transform, x: 321 } }] }
    const after = command.execute(current)
    const track = after.timelines[0].tracks[0]
    expect(track.target).toBe(`layers.${layer.id}.transform.x`)
    expect(track.keyframes).toHaveLength(1)
    expect(track.keyframes[0]).toMatchObject({ timeMs: 1000, value: 321 })
    expect(after.timelines[1]).toBe(current.timelines[1])
    const history = pushHistory(initHistory(current), after)
    expect(history.past).toHaveLength(1)
    expect(undoHistory(history).present).toBe(current)
    expect(command.undo(after).timelines[0].tracks).toHaveLength(0)
  })

  it('does not duplicate an existing track or overwrite its keys', () => {
    const { scene, layer } = fixture()
    const command = makeAddAnimationCmd('intro', layer.id, 'opacity', 200)
    const after = command.execute(scene)
    expect(makeAddAnimationCmd('intro', layer.id, 'opacity', 400).execute(after)).toBe(after)
  })

  it('keeps empty-track creation available to the inline property picker', () => {
    const { scene, layer } = fixture()
    expect(makeAddAnimationCmd('intro', layer.id, 'opacity').execute(scene).timelines[0].tracks[0].keyframes).toEqual([])
  })
})
