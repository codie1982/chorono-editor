import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ViewportStatusBar } from './ViewportStatusBar'

/** Exercise user-visible edit/read-only policy; spatial placement and native
 * input ownership are checked through the real viewport acceptance fixture. */
describe('Viewport status footer', () => {
  it('keeps the full selected name available and exposes a labeled pivot choice only for a multi-selection', () => {
    const props = { mode: 'editing' as const, pivotMode: 'active' as const, onPivotModeChange: () => {} }
    const single = renderToStaticMarkup(<ViewportStatusBar {...props} count={1} selectedName="Circle 1 Copy" />)
    expect(single).toContain('title="Circle 1 Copy"')
    expect(single).not.toContain('<select')
    const multiple = renderToStaticMarkup(<ViewportStatusBar {...props} count={2} />)
    expect(multiple).toContain('2 selected')
    expect(multiple).toContain('aria-label="Selection pivot"')
    expect(multiple).toContain('<option value="active" selected="">Active object</option>')
    expect(multiple).toContain('aria-live="off"')
  })

  it('provides an empty-selection prompt and keeps playback/preview free of pivot editing controls', () => {
    const props = { pivotMode: 'selectionCenter' as const, onPivotModeChange: () => {}, count: 0 }
    expect(renderToStaticMarkup(<ViewportStatusBar {...props} mode="editing" />)).toContain('Select an object')
    for (const mode of ['playback', 'preview'] as const) {
      const html = renderToStaticMarkup(<ViewportStatusBar {...props} count={2} mode={mode} />)
      expect(html).toContain(mode === 'playback' ? 'Playing' : 'Preview')
      expect(html).not.toContain('<select')
      expect(html).not.toContain('2 selected')
    }
  })
})
