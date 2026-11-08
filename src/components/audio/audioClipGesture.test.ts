import { describe, expect, it, vi } from 'vitest'
import type { ChronoScene } from '@/lib/types'
import { DEFAULT_TIMELINE_SETTINGS } from '@/lib/types'
import { emptyScene, newAudioLayer } from '@/lib/defaults'
import { initHistory, pushHistory, undoHistory } from '@/lib/editor/history'
import { createAudioClipGesture, type AudioClipGestureKind } from './audioClipGesture'

function fixture() {
  const scene = emptyScene()
  scene.composition.durationMs = 8000
  scene.assets = [{ id: 'source', type: 'audio', name: 'Voice.wav', url: 'blob:source', durationMs: 8000 }]
  const layer = newAudioLayer('source', 8000)
  layer.id = 'voice'; layer.startMs = 1000; layer.endMs = 6000
  layer.audio = { ...layer.audio!, startOffsetMs: 2000, fadeInMs: 500, fadeOutMs: 500, timelineId: 'intro' }
  scene.layers = [layer]
  scene.timelines = ['intro', 'outro'].map(id => ({ id, durationMs: 8000, autoplay: false, loop: false,
    layerIds: ['voice'], tracks: [{ target: 'layers.voice.audio.volume', keyframes: [
      { id: `${id}-first`, timeMs: 1000, value: 1, easing: { type: 'linear' as const } },
      { id: `${id}-last`, timeMs: 5000, value: .5, easing: { type: 'linear' as const } },
    ] }] }))
  return scene
}
function session(scene: ChronoScene, kind: AudioClipGestureKind, snap = false) {
  const onPreview = vi.fn(), onCommit = vi.fn(), onCancel = vi.fn(), onBegin = vi.fn()
  const drag = createAudioClipGesture({ scene, layerId: 'voice', kind, startX: 100, pixelsPerMs: .5, durationMs: 8000,
    timelineId: 'intro', settings: { ...DEFAULT_TIMELINE_SETTINGS, snapEnabled: snap }, frameRate: 25,
    onPreview, onCommit, onCancel, onBegin })!
  return { drag, onPreview, onCommit, onCancel, onBegin }
}
describe('audio clip pointer gestures', () => {
  it('left-trims source audio instead of stretching animation keyframes', () => {
    const scene = fixture()
    const { drag, onPreview, onCommit } = session(scene, 'trimStart')
    drag.move(600)
    const preview = onPreview.mock.calls[0][0] as ChronoScene
    expect(preview.layers[0]).toMatchObject({ startMs: 2000, endMs: 6000, audio: { startOffsetMs: 3000 } })
    expect(preview.timelines).toEqual(scene.timelines)
    drag.finish(850)
    const final = onCommit.mock.calls[0][0].execute(scene) as ChronoScene
    expect(final.layers[0]).toMatchObject({ startMs: 2500, endMs: 6000, audio: { startOffsetMs: 3500 } })
  })
  it('right-trims within remaining source samples and clamps release like preview', () => {
    const scene = fixture()
    const { drag, onPreview, onCommit } = session(scene, 'trimEnd')
    drag.move(2000)
    expect(onPreview.mock.calls[0][0].layers[0].endMs).toBe(7000)
    drag.finish(5000)
    expect(onCommit.mock.calls[0][0].execute(scene).layers[0].endMs).toBe(7000)
  })
  it('moves the clip and its owning gain automation without changing source offset or other timelines', () => {
    const scene = fixture()
    const { drag, onCommit } = session(scene, 'move')
    drag.finish(600)
    const final = onCommit.mock.calls[0][0].execute(scene) as ChronoScene
    expect(final.layers[0]).toMatchObject({ startMs: 2000, endMs: 7000, audio: { startOffsetMs: 2000 } })
    expect(final.timelines[0].tracks[0].keyframes.map(key => key.timeMs)).toEqual([2000, 6000])
    expect(final.timelines[1]).toEqual(scene.timelines[1])
  })
  it('edits each fade duration with opposite pointer direction, through native patch commands', () => {
    for (const [kind, endX] of [['fadeIn', 200], ['fadeOut', 0]] as const) {
      const scene = fixture()
      const { drag, onCommit } = session(scene, kind)
      drag.finish(endX)
      const final = onCommit.mock.calls[0][0].execute(scene) as ChronoScene
      expect(final.layers[0].audio![kind === 'fadeIn' ? 'fadeInMs' : 'fadeOutMs']).toBe(700)
    }
  })
  it('cancels a click and Escape/unmount without committing a transaction', () => {
    const click = session(fixture(), 'move')
    click.drag.finish(101)
    expect(click.onCommit).not.toHaveBeenCalled()
    expect(click.onCancel).toHaveBeenCalledOnce()
    const cancelled = session(fixture(), 'move')
    cancelled.drag.move(600)
    cancelled.drag.cancel(); cancelled.drag.cancel(); cancelled.drag.finish(900)
    expect(cancelled.onCommit).not.toHaveBeenCalled()
    expect(cancelled.onCancel).toHaveBeenCalledOnce()
  })
  it('rejects locked clips before opening a transaction', () => {
    const scene = fixture(); scene.layers[0].locked = true
    const { drag, onBegin } = session(scene, 'move')
    expect(drag).toBeNull(); expect(onBegin).not.toHaveBeenCalled()
  })
  it('keeps grid snapping independent of composition frame snapping', () => {
    const scene = fixture()
    const onPreview = vi.fn()
    const drag = createAudioClipGesture({ scene, layerId: 'voice', kind: 'move', startX: 100,
      pixelsPerMs: .5, durationMs: 8000, timelineId: 'intro', frameRate: 25,
      settings: { ...DEFAULT_TIMELINE_SETTINGS, snapToGrid: true, snapToFrame: false, snapToKeyframes: false, snapToMarkers: false },
      onBegin() {}, onPreview, onCommit() {}, onCancel() {},
    })!
    // Visible ruler grid is 200ms. Raw1110 is far from the grid, although it
    // is near the1120ms frame boundary: grid-only must leave it unsnapped.
    drag.move(155)
    expect(onPreview.mock.calls[0][0].layers[0].startMs).toBe(1110)
  })
  it('previews freely, uses the final pointer-up position, and adds one undo step', () => {
    const scene = fixture()
    let history = initHistory(scene)
    const drag = createAudioClipGesture({ scene, layerId: 'voice', kind: 'move', startX: 0,
      pixelsPerMs: 1, timelineId: 'intro', durationMs: 8000, settings: { ...DEFAULT_TIMELINE_SETTINGS, snapEnabled: false }, frameRate: 25,
      onBegin() {}, onPreview(next) { history = { ...history, present: next } },
      onCommit(command) { history = pushHistory({ ...history, present: scene }, command.execute(scene)) },
      onCancel() { history = { ...history, present: scene } },
    })!
    drag.move(100); drag.move(200); drag.move(300)
    expect(history.past).toHaveLength(0)
    drag.finish(400)
    expect(history.present.layers[0].startMs).toBe(1400)
    expect(history.past).toHaveLength(1)
    expect(undoHistory(history).present).toBe(scene)
  })
})
