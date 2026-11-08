import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import type { Track } from '../../types'
import { detectLifecycleEvents, emptySnapshot, type PlaybackSnapshot } from '../lifecycleEmitter'

/** Literal test tracks intentionally include empty, duplicate and unsorted keys. */
function track(target: string, times: number[]): Track {
  return { target, keyframes: times.map((timeMs, i) => ({ id: `${target}-${i}`, timeMs, value: i, easing: { type: 'linear' } })) }
}
function fixture() {
  const scene = emptyScene(), timeline = newTimeline()
  scene.layers = ['a', 'ab', 'a.b', 'missing', ''].map(id => ({ ...newRectLayer(), id }))
  timeline.id = 'active'; timeline.durationMs = 1000
  timeline.markers = [{ id: 'mark', timeMs: 40, label: 'Mark' }]
  timeline.tracks = [track('layers.a.opacity', [0, 30]), track('layers.ab.opacity', [0, 50]),
    track('layers.a.transform.x', [0, 100, 40]), track('layers.a.b.opacity', [0, 35]),
    track('effects.a.opacity', [0, 999]), track('layers.a.', []), track('layers..opacity', [0, 40])]
  scene.timelines = [timeline]
  return scene
}
function snapshot(timeMs: number, patch: Partial<PlaybackSnapshot> = {}): PlaybackSnapshot {
  return { ...emptySnapshot(), isPlaying: true, activeTimelineId: 'active', timeMs, ...patch }
}

describe('lifecycle completion indexing', () => {
  it('preserves prefix membership, source layer ordering and last-authored key semantics', () => {
    const scene = fixture(), before = JSON.stringify(scene)
    const events = detectLifecycleEvents(scene, snapshot(0), snapshot(40))
    expect(events.filter(event => event.type === 'layerAnimationComplete')).toEqual([
      { type: 'layerAnimationComplete', layerId: 'a' },
      { type: 'layerAnimationComplete', layerId: 'a.b' },
      { type: 'layerAnimationComplete', layerId: '' },
    ])
    expect(events.find(event => event.type === 'markerReached')).toMatchObject({ refId: 'mark' })
    expect(JSON.stringify(scene)).toBe(before)
    expect(detectLifecycleEvents(scene, snapshot(40), snapshot(50)).filter(event => event.type === 'layerAnimationComplete'))
      .toEqual([{ type: 'layerAnimationComplete', layerId: 'ab' }])
  })

  it('keeps appear, disappear, segment, loop and frame ordering while skipping backward completions', () => {
    const scene = fixture()
    const before = snapshot(50, { visibleLayerIds: new Set(['a']), activeSegmentId: 'old' })
    const after = snapshot(20, { visibleLayerIds: new Set(['ab']), activeSegmentId: 'new', loopCount: 1 })
    expect(detectLifecycleEvents(scene, before, after)).toEqual([
      { type: 'animationLoop', timelineId: 'active' }, { type: 'segmentComplete', segmentId: 'old' },
      { type: 'segmentStart', segmentId: 'new' }, { type: 'layerAppear', layerId: 'ab' },
      { type: 'layerDisappear', layerId: 'a' },
    ])
    expect(detectLifecycleEvents(scene, snapshot(40), snapshot(40))).toEqual([])
    expect(detectLifecycleEvents(scene, snapshot(0), snapshot(1000)).filter(event => event.type === 'animationComplete'))
      .toEqual([{ type: 'animationComplete', timelineId: 'active' }])
  })

  it('reads target membership linearly for 3000 layers rather than layer × track', () => {
    const scene = emptyScene(), timeline = newTimeline()
    scene.layers = Array.from({ length: 3000 }, (_, i) => ({ ...newRectLayer(), id: `layer-${i}` }))
    let reads = 0
    timeline.id = 'active'; timeline.durationMs = 1000
    timeline.tracks = scene.layers.map(layer => ({ get target() { reads++; return `layers.${layer.id}.opacity` },
      keyframes: [{ id: layer.id, timeMs: 500, value: 1, easing: { type: 'linear' as const } }] }))
    scene.timelines = [timeline]
    const events = detectLifecycleEvents(scene, snapshot(499), snapshot(500))
    expect(events.filter(event => event.type === 'layerAnimationComplete')).toHaveLength(3000)
    expect(reads).toBeLessThanOrEqual(3 * timeline.tracks.length)
    reads = 0
    detectLifecycleEvents(scene, snapshot(500), snapshot(500))
    expect(reads).toBe(0)
  })
})
