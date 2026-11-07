import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { DEFAULT_TIMELINE_SETTINGS } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import DopeSheetPanel from './DopeSheetPanel'
import TrackNodeRow from './TrackNodeRow'
import DopeSheetKeyframeRow from './DopeSheetKeyframeRow'

describe('Dope Sheet shared selection', () => {
  it('reflects parent keyframe selection and clearing without a private selection copy', () => {
    const scene = emptyScene()
    const layer = { ...newRectLayer(), id: 'card' }
    scene.layers = [layer]
    scene.timelines = [{ id: 'intro', durationMs: 1000, autoplay: false, loop: false,
      tracks: [{ target: 'layers.card.opacity', keyframes: [
        { id: 'selected-key', timeMs: 200, value: 1, easing: { type: 'linear' } },
        { id: 'other-key', timeMs: 600, value: 0, easing: { type: 'linear' } },
      ] }] }]
    const props = { scene, editor: {} as EditorStateReturn,
      settings: DEFAULT_TIMELINE_SETTINGS, onSettingsChange() {},
      selectedLayerId: 'card', selectedTimelineId: 'intro', currentTimeMs: 0, isPlaying: false,
      onTimeChange() {}, onSelectKeyframes() {}, onSelectLayer() {},
    }
    const selected = renderToStaticMarkup(createElement(DopeSheetPanel, { ...props, selectedKfIds: new Set(['selected-key']) }))
    // Empty-area/marquee and ruler gestures focus this region, so keyboard
    // edits leave the search input and operate on the shared key selection.
    expect(selected).toMatch(/class="dope-sheet-grid"[^>]*tabindex="0"[^>]*role="region"[^>]*aria-label="Dope Sheet keyframes"/)
    expect(selected).toContain('class="keyframe-symbol selected"')
    expect(selected).toMatch(/data-key-id="other-key"[^>]*class="keyframe-symbol "/)
    const cleared = renderToStaticMarkup(createElement(DopeSheetPanel, { ...props, selectedKfIds: new Set<string>() }))
    expect(cleared).not.toContain('class="keyframe-symbol selected"')
  })

  it('highlights only the exact selected layer, rather than every object or id prefix', () => {
    const node = { id: 'layer:card-10', name: 'Other card', type: 'object' as const, layerId: 'card-10',
      depth: 1, trackTarget: 'layers.card-10', children: [], expanded: true, hasKeys: true, isParent: false }
    const props = { node, isExpanded: true, onToggleExpand() {}, onSelectLayer() {} }
    const other = renderToStaticMarkup(createElement(TrackNodeRow, { ...props, selectedLayerId: 'card-1' }))
    expect(other).not.toContain('track-node-row selected')
    const selected = renderToStaticMarkup(createElement(TrackNodeRow, { ...props, selectedLayerId: 'card-10' }))
    expect(selected).toContain('track-node-row selected')
  })

  it('renders a single accessible summary diamond for co-located keys on different tracks', () => {
    const html = renderToStaticMarkup(createElement(DopeSheetKeyframeRow, {
      row: { node: { id: 'scene', name: 'Scene', type: 'group', depth: 0, children: [], expanded: true, hasKeys: true, isParent: true },
        tracks: ['layers.card.opacity', 'layers.card.transform.y'].map((target, index) => ({ target,
          keyframes: [{ id: `key-${index}`, timeMs: 200, value: 1, easing: { type: 'linear' as const } }] })) },
      selectedKfIds: new Set(['key-0']), previewMs: {}, pixelsPerMs: 1, visibleStartMs: 0, visibleEndMs: 1000,
      currentTimeMs: 0, snapTarget: null, gridStepMs: 100,
      onKeyPointerDown() {}, onKeySelect() {}, onEmptyPointerDown() {},
    }))
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain('data-key-ids="key-0 key-1"')
    expect(html).toContain('aria-pressed="mixed"')
    expect(html).toContain('2 keyframes at 200 milliseconds')
  })
})
