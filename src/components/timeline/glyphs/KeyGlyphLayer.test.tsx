import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Keyframe, Track } from '@/lib/types'
import TrackKeyframes from './TrackKeyframes'

/** Pure stress input for editor UI, not an authored project. */
function track(count: number): Track {
  return { target: 'layers.test.opacity', keyframes: Array.from({ length: count }, (_, i): Keyframe => ({
    id: `key-${i}`, timeMs: i, value: i % 2, easing: { type: 'linear' } })) }
}

describe('bounded native key controls', () => {
  it('renders 42000 keys and select-all with only bounded active controls', () => {
    const input = track(42000), selected = new Set(input.keyframes.map(key => key.id))
    const html = renderToStaticMarkup(<TrackKeyframes track={input} width={1000} height={72} graph locked={false}
      msToX={time => time / 42} previewMs={{}} selected={selected} onSelect={() => {}} onDelete={() => {}}
      onEasing={() => {}} onBeginDrag={() => () => {}} />)
    expect(html).toContain('data-key-glyph-layer="dense"')
    expect(html).toContain('data-glyph-count="42000"')
    expect((html.match(/data-kf-id=/g) ?? []).length).toBeLessThanOrEqual(3)
    expect((html.match(/<path/g) ?? []).length).toBe(3)
    expect(html.length).toBeLessThan(50000)
    expect(input.keyframes).toHaveLength(42000)
  })

  it('keeps sparse native key controls and original accessibility/locking contract', () => {
    const input = track(5)
    const html = renderToStaticMarkup(<TrackKeyframes track={input} width={1000} height={28} graph={false} locked
      msToX={time => time * 40} previewMs={{}} selected={new Set(['key-2'])} onSelect={() => {}} onDelete={() => {}}
      onEasing={() => {}} onBeginDrag={() => () => {}} />)
    expect(html).toContain('data-key-glyph-layer="native"')
    expect((html.match(/data-kf-id=/g) ?? []).length).toBe(5)
    expect(html).toContain('Keyframe at 2 milliseconds')
    expect(html).toContain('aria-pressed="true"')
  })
})
