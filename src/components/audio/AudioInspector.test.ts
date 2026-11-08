import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { emptyScene, newAudioLayer } from '@/lib/defaults'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { DEFAULT_TIMELINE_SETTINGS } from '@/lib/types'
import AudioInspector from './AudioInspector'
import LayerTimelineSection from '@/components/timeline/LayerTimelineSection'
import { audioGainAtPlayhead, audioGainKeyCommand } from './audioGainKeyCommand'
import AudioClipTimeline, { gainEnvelopeY } from './AudioClipTimeline'

function fixture() {
  const scene = emptyScene()
  scene.composition.durationMs = 10000
  scene.assets = [{ id: 'voice-source', name: 'Narration.wav', type: 'audio', url: 'blob:voice', durationMs: 8000 }]
  const layer = newAudioLayer('voice-source', 8000)
  layer.id = 'voice'; layer.startMs = 2000; layer.endMs = 7000
  layer.audio = { ...layer.audio!, volume: .5, startOffsetMs: 1000, timelineId: 'intro', fadeInMs: 200, fadeOutMs: 300 }
  scene.layers = [layer]
  scene.timelines = [{ id: 'intro', durationMs: 10000, autoplay: false, loop: false, tracks: [], layerIds: ['voice'] },
    { id: 'outro', durationMs: 10000, autoplay: false, loop: false, tracks: [], layerIds: [] }]
  return { scene, layer }
}
afterEach(() => vi.restoreAllMocks())
describe('audio clip editor UI', () => {
  it('shows decibels, source in/out, placement and native editing controls', () => {
    const { scene, layer } = fixture()
    const html = renderToStaticMarkup(createElement(AudioInspector, { scene, layer, currentTimeMs: 4000,
      selectedTimelineId: 'intro', dispatchCommand() {}, onNormalizeAudio() {} }))
    expect(html).toMatch(/aria-label="Gain"[^>]*value="-6\.0206"/)
    expect(html).toContain('Source out: 6000 ms / 8000 ms')
    for (const name of ['Source in', 'Start', 'Duration', 'End', 'Pan', 'Fade in', 'Fade out']) expect(html).toContain(`aria-label="${name}"`)
    expect(html).toContain('Split at playhead')
    expect(html).toContain('Key gain at playhead')
    expect(html).toContain('Normalize to −1 dBFS')
    expect(html).not.toContain('Transform')
  })
  it('disables clip mutations while locked and splitting outside the clip', () => {
    const { scene, layer } = fixture(); layer.locked = true
    const html = renderToStaticMarkup(createElement(AudioInspector, { scene, layer, currentTimeMs: 1000, dispatchCommand() {} }))
    expect(html).toContain('Unlock this clip to edit it.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Split at playhead/)
    expect(html).toMatch(/aria-label="Gain"[^>]*disabled=""/)
  })
  it('creates a missing gain track, upserts its key, and preserves other timelines', () => {
    const { scene, layer } = fixture()
    const first = audioGainKeyCommand(layer, 'intro', 4000).execute(scene)
    expect(first.timelines[0].tracks[0]).toMatchObject({ target: 'layers.voice.audio.volume', keyframes: [{ timeMs: 4000, value: .5 }] })
    const originalKey = first.timelines[0].tracks[0].keyframes[0]
    const modifier = { id: 'gain-offset', type: 'offset' as const, enabled: true, blendMode: 'add' as const,
      weight: 1, parameters: { offset: .1 } }
    first.timelines[0].tracks[0].modifiers = [modifier]
    first.timelines[0].tracks[0].keyframes[0] = { ...originalKey, easing: { type: 'hold' },
      tangentMode: 'broken', segmentModifiers: [modifier] }
    const replaced = audioGainKeyCommand(layer, 'intro', 4000, 2).execute(first)
    expect(replaced.timelines[0].tracks[0].keyframes).toHaveLength(1)
    expect(replaced.timelines[0].tracks[0].keyframes[0].value).toBe(2)
    expect(replaced.timelines[0].tracks[0].keyframes[0]).toMatchObject({ id: originalKey.id,
      easing: { type: 'hold' }, tangentMode: 'broken', segmentModifiers: [modifier] })
    expect(replaced.timelines[0].tracks[0].modifiers).toEqual([modifier])
    expect(replaced.timelines[1]).toBe(scene.timelines[1])
  })
  it('shows the evaluated automated gain rather than the static clip gain at the playhead', () => {
    const { scene, layer } = fixture()
    scene.timelines[0].tracks = [{ target: 'layers.voice.audio.volume', keyframes: [
      { id: 'gain-a', timeMs: 2000, value: 1, easing: { type: 'linear' } },
      { id: 'gain-b', timeMs: 6000, value: .25, easing: { type: 'linear' } },
    ] }]
    expect(audioGainAtPlayhead(layer, scene.timelines[0].tracks, 4000)).toBe(.625)
    const html = renderToStaticMarkup(createElement(AudioInspector, { scene, layer, currentTimeMs: 4000,
      selectedTimelineId: 'intro', dispatchCommand() {} }))
    expect(html).toMatch(/aria-label="Gain"[^>]*value="-4\.0824"/)
    expect(html).toContain('Gain is automated. Level edits add a key at the playhead.')
    const keyed = audioGainKeyCommand(layer, 'intro', 4000, 2).execute(scene)
    expect(audioGainAtPlayhead(layer, keyed.timelines[0].tracks, 4000)).toBe(2)
    expect(keyed.layers[0].audio!.volume).toBe(.5)
  })
  it('renders a dedicated 64px waveform row with dB/mute/solo and source trim/fade handles', () => {
    // React SSR cannot run layout measurement; the actual canvas is verified in-browser.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { scene, layer } = fixture()
    const noop = () => {}
    const html = renderToStaticMarkup(createElement(LayerTimelineSection, { layer, tracks: [], expanded: true,
      graphMode: false, isPrimary: true, isInSet: true, trackWidth: 1000, msToScreenPx: (ms: number) => ms / 10,
      visibleStartMs: 0, visibleEndMs: 10000, selectedKfIds: new Set<string>(), previewMs: {},
      onToggleExpand: noop, onSelectLayer: noop, onToggleFlag: noop, onAddTrack: noop, onRemoveTrack: noop,
      onAddKeyframeAtPlayhead: noop, onDeleteKf: noop, onSetEasing: noop, onSelectKf: noop,
      onBeginKfDrag: () => noop, durationMs: 10000, currentTimeMs: 4000, frameRate: 25, labelColWidth: 240,
      audioUrl: 'blob:voice', audioContext: { scene, editor: {} as EditorStateReturn,
        settings: DEFAULT_TIMELINE_SETTINGS, timelineId: 'intro', isPlaying: false } }))
    expect(html).toContain('height:64px')
    expect(html).toContain('aria-label="Mute Audio ')
    expect(html).toContain('data-audio-clip="voice"')
    expect(html).toContain('aria-label="Audio waveform"')
    expect(html).toContain('aria-label="Trim start Audio ')
    expect(html).toContain('aria-label="Fade in Audio ')
  })
  it('maps gain automation into dB envelope coordinates with silence at the floor', () => {
    expect(gainEnvelopeY(1)).toBeLessThan(gainEnvelopeY(.5))
    expect(gainEnvelopeY(0)).toBe(52)
    expect(gainEnvelopeY(4)).toBe(4)
  })
  it('keeps split-clip fade handles separately clickable when both anchors clamp to the same edge', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { scene, layer } = fixture()
    layer.endMs = 2750
    layer.audio = { ...layer.audio!, fadeInMs: 1000, fadeOutMs: 1000,
      fadeRange: { startMs: 2000, endMs: 4000 } }
    const noop = () => {}
    const html = renderToStaticMarkup(createElement(AudioClipTimeline, {
      layer, context: { scene, editor: {} as EditorStateReturn, settings: DEFAULT_TIMELINE_SETTINGS,
        timelineId: 'intro', isPlaying: false }, audioUrl: 'blob:voice', durationMs: 10000,
      visibleStartMs: 0, visibleEndMs: 10000, msToScreenPx: (ms: number) => ms / 10,
      onSelect: noop, tracks: [], selectedKfIds: new Set<string>(), previewMs: {}, onSelectKf: noop,
      onBeginKfDrag: () => noop, onDeleteKf: noop, onSetEasing: noop,
    }))
    const fadeIn = html.match(/<button\b[^>]*aria-label="Fade in [^"]*"[^>]*>/)![0]
    const fadeOut = html.match(/<button\b[^>]*aria-label="Fade out [^"]*"[^>]*>/)![0]
    // Both shared-envelope anchors fall past the shortened clip's end. Their
    // horizontal positions match, but16px hit targets occupy separate lanes.
    expect(fadeIn).toContain('left:63px')
    expect(fadeOut).toContain('left:63px')
    expect(fadeIn).toMatch(/top:0(?:;|")/)
    expect(fadeOut).toContain('top:40px')
  })
})
