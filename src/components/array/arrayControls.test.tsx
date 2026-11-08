import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { defaultLinearArraySettings, defaultGridArraySettings } from '@/lib/array/ArrayTypes'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { prepareArrayForest } from '@/lib/editor/commands-array-forest'
import ArrayModal from '@/components/modals/ArrayModal'
import type { ArrayAuthoringController } from './useArrayAuthoring'
import { ArrayPatternFields } from './ArrayPatternFields'
import { ArrayPreviewSummary } from './ArrayPreviewSummary'

/** Render the production controls against an actual native bounded plan. Event
 * execution is covered separately by native React/editor acceptance. */
function controller(error = ''): ArrayAuthoringController {
  const source = newRectLayer(), scene = { ...emptyScene(), layers: [source] }, settings = defaultLinearArraySettings()
  const plan = error ? null : prepareArrayForest(scene, { sourceIds: [source.id], timeMs: 0, settings })
  return { active: true, open: () => true, close: () => {}, settings, setSettings: () => {}, pattern: 'linear', setPattern: () => {},
    pivotMode: 'selectionCenter', setPivotMode: () => {}, plan, error, stale: !!error, apply: () => !error,
    sourceName: source.name, sourceCount: 1, pathLayers: [] }
}

describe('Array control contracts', () => {
  it('exposes the same space/pivot/count/timing controls and explicit physical-forest mode', () => {
    const html = renderToStaticMarkup(<ArrayModal authoring={controller()} />)
    for (const label of ['Array Count', 'Array Move X', 'Array Move Y', 'Array Space', 'Array Pivot', 'Array Source policy', 'Array Time offset per occurrence ms', 'Apply array', 'Cancel array']) expect(html).toContain(`aria-label="${label}"`)
    expect(html).toContain('aria-modal="false"'); expect(html).toContain('one undo')
    expect(html).toContain('multi-root Repeater conversion is not supported')
    expect(html).toContain('<option value="parent">'); expect(html).toContain('<option value="local">')
  })

  it('keeps a stale diagnostic visible and Apply disabled', () => {
    const html = renderToStaticMarkup(<ArrayModal authoring={controller('The source changed. Reopen Array.')} />)
    expect(html).toContain('role="alert"'); expect(html).toContain('The source changed. Reopen Array.')
    expect(html).toMatch(/aria-label="Apply array" disabled=""/)
    expect(html).toContain('aria-label="Cancel array"')
  })

  it('names independent grid vector axes as alternatives to spacing handles', () => {
    const html = renderToStaticMarkup(<ArrayPatternFields settings={defaultGridArraySettings()} setSettings={() => {}} paths={[]} />)
    for (const label of ['Columns', 'Rows', 'Column move X', 'Column move Y', 'Row move X', 'Row move Y']) expect(html).toContain(`aria-label="Array ${label}"`)
  })

  it('renders only the admitted bounded outlines while reporting complete workload counts', () => {
    const source = newRectLayer(), scene = { ...emptyScene(), layers: [source] }
    const plan = prepareArrayForest(scene, { sourceIds: [source.id], timeMs: 0, settings: { ...defaultLinearArraySettings(), count: 600 } })
    const html = renderToStaticMarkup(<ArrayPreviewSummary plan={plan} />)
    expect(plan.preview.truncated).toBe(true)
    expect((html.match(/<polygon /g) ?? []).length).toBe(plan.preview.outlines.length)
    expect(html).toContain('599 new occurrences'); expect(html).toContain('bounded preview')
  })
})
