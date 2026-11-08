import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import CurveEditor from './CurveEditor'
import type { Track } from '@/lib/types'

function render(selected: string[], extraTracks: Track[] = []) {
  const scene = emptyScene()
  const layer = { ...newRectLayer(), id: 'probe' }
  scene.layers = [layer]
  scene.timelines = [{ id: 'curve', durationMs: 1000, autoplay: false, loop: false,
    tracks: [{ target: 'layers.probe.opacity', keyframes: [
      { id: 'start', timeMs: 0, value: 0, easing: { type: 'linear' } },
      { id: 'middle', timeMs: 500, value: 0.5, easing: { type: 'linear' } },
      { id: 'end', timeMs: 1000, value: 1, easing: { type: 'linear' } },
    ] }, ...extraTracks] }]
  return renderToStaticMarkup(createElement(CurveEditor, {
    scene, editor: {} as EditorStateReturn, selectedLayerId: layer.id,
    selectedTimelineId: 'curve', currentTimeMs: 500,
    onTimeChange() {}, selectedKfIds: new Set(selected), onSelectKeyframes() {},
  }))
}

function actions(html: string) {
  const toolbar = html.match(/<div role="toolbar" aria-label="Keyframe actions"[^>]*>[\s\S]*?<\/div>/)?.[0]
  expect(toolbar).toBeDefined()
  return toolbar!
}

describe('Curve Editor selection layout', () => {
  it('reserves identical fixed-height actions before the first key selection', () => {
    const empty = actions(render([]))
    const selected = actions(render(['middle']))
    const multi = actions(render(['start', 'middle', 'end']))
    // A conditional/wrapping row changes SVG origin/height on pointerdown,
    // turning a horizontal normalized drag into an unintended value edit.
    for (const toolbar of [empty, selected, multi]) {
      expect(toolbar).toContain('h-7 shrink-0')
      expect(toolbar).toContain('whitespace-nowrap overflow-x-auto')
      expect(toolbar).not.toContain('flex-wrap')
      expect(toolbar.match(/<button\b/g)).toHaveLength(11)
    }
    const classes = (toolbar: string) => toolbar.match(/class="([^"]*)"/)?.[1]
    expect(classes(empty)).toBe(classes(selected))
    expect(classes(empty)).toBe(classes(multi))
  })

  it('disables all actions without selection and leaves only Auto unavailable after selection', () => {
    const emptyButtons = actions(render([])).match(/<button\b[^>]*>/g)!
    expect(emptyButtons.every(button => /\bdisabled=""/.test(button))).toBe(true)
    const selectedButtons = actions(render(['middle'])).match(/<button\b[^>]*>/g)!
    expect(selectedButtons.filter(button => /\bdisabled=""/.test(button))).toHaveLength(1)
    expect(selectedButtons.find(button => /\bdisabled=""/.test(button))).toContain('Automatic tangents are not available yet')
  })

  it('keeps packed color, vector and discrete tracks out of the scalar value graph', () => {
    const extraTracks: Track[] = [
      { target: 'layers.probe.style.fill.color', keyframes: [
        { id: 'red', timeMs: 0, value: 0xff0000, easing: { type: 'linear' } },
        { id: 'blue', timeMs: 1000, value: 0x0000ff, easing: { type: 'linear' } },
      ] },
      { target: 'layers.probe.custom.vector', keyframes: [{ id: 'vec', timeMs: 0, value: { x: 0, y: 1 }, easing: { type: 'linear' } }] },
      { target: 'layers.probe.text.value', keyframes: [{ id: 'text', timeMs: 0, value: 'Title', easing: { type: 'linear' } }] },
    ]
    const html = render([], extraTracks)
    expect(html).toContain('>opacity</span>')
    expect(html).not.toContain('style.fill.color')
    expect(html).not.toContain('custom.vector')
    expect(html).not.toContain('text.value')
  })
})
