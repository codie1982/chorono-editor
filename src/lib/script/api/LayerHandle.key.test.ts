import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { LayerHandle } from './LayerHandle'

/** Exercise the real script-facing command adapter without executing scripts. */
function host() {
  let scene = emptyScene()
  const layer = { ...newRectLayer(), id: 'hero' }
  const timeline = { ...newTimeline(), id: 'active', layerIds: [] as string[] }
  timeline.tracks = [{ target: 'layers.hero.opacity', keyframes: [{ id: 'manual', timeMs: 100, value: 0.5, easing: { type: 'easeOut' }, tangentMode: 'aligned' }] }]
  scene = { ...scene, layers: [layer], timelines: [timeline] }
  let command: EditorCommand
  const handle = new LayerHandle('hero', { resolveTimelineId: () => 'active', host: {
    getScene: () => scene, applyCommand: next => { command = next; scene = next.execute(scene) },
  } })
  return { handle, source: () => scene, undo: () => { scene = command.undo(scene) } }
}

describe('script key updates', () => {
  it('preserves manual identity, easing and tangents unless easing is explicit; undo restores membership and payload', () => {
    const { handle, source, undo } = host(), before = source()
    handle.key('opacity', 100, 0.8)
    expect(source().timelines[0].tracks[0].keyframes).toEqual([{ ...before.timelines[0].tracks[0].keyframes[0], value: 0.8 }])
    expect(source().timelines[0].layerIds).toEqual(['hero'])
    undo(); expect(source()).toEqual(before)
    handle.key('opacity', 100, 0.9, 'hold')
    expect(source().timelines[0].tracks[0].keyframes[0]).toMatchObject({ id: 'manual', easing: { type: 'hold' }, tangentMode: 'aligned' })
    undo(); expect(source()).toEqual(before)
  })
  it('retains a nearby fractional key and restores duration extensions on undo', () => {
    const { handle, source, undo } = host(), before = source()
    handle.key('opacity', 100.25, 0.75)
    expect(source().timelines[0].tracks[0].keyframes).toHaveLength(2)
    undo(); expect(source()).toEqual(before)
    handle.key('opacity', 900000, 1)
    expect(source().timelines[0].durationMs).toBe(900000)
    undo(); expect(source()).toEqual(before)
  })
})
