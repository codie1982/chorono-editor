import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { emptyScene } from '@/lib/defaults'
import type { ChronoScene } from '@/lib/types'
import { EditorPointerSession, type EditorPointerSessionHost, type EditorPointerSample } from './EditorPointerSession'
import { interactionTrace } from './diagnostics'

/** Concrete host fixture without React/native browser handles. */
class DiagnosticSourceSession extends EditorPointerSession<{ scene: ChronoScene }> {
  constructor(host: EditorPointerSessionHost<{ scene: ChronoScene }>, minDragDistance?: number) {
    super({ startClientX: 0, startClientY: 0, minDragDistance }, host)
  }
}

/** Mutable editor ownership exposes source identity changes without serialization. */
function fixture(options: { unchanged?: boolean; minDistance?: number; brokenSummary?: boolean } = {}) {
  const base = emptyScene(), document = new AbortController(), events = new EventTarget()
  let scene = base, active = true
  const editor = { getScene: () => scene, getDocumentSignal: () => document.signal,
    isTransactionActive: () => active, previewTransaction: (next: ChronoScene) => { scene = next },
    cancelTransaction: ({ preserveScene }: { preserveScene?: boolean } = {}) => { active = false; if (!preserveScene) scene = base },
  } as unknown as EditorStateReturn
  const commit = vi.fn((_base, preview: { scene: ChronoScene }) => { active = false; scene = preview.scene })
  const summary = vi.fn((_preview, point: EditorPointerSample) => {
    if (options.brokenSummary) throw new Error('Observer failed')
    return { appliedX: point.clientX }
  })
  const session = new DiagnosticSourceSession({ getEditor: () => editor, eventTarget: events as unknown as Window,
    preview: (source, point) => ({ scene: options.unchanged ? source : { ...source, composition: { ...source.composition, width: point.clientX } } }),
    hasChanges: preview => preview.scene !== base, show: vi.fn(), commit, clear: vi.fn(), warning: vi.fn(),
    diagnostics: { owner: 'test-object', details: { rootId: 'shape-1' } }, previewSummary: summary,
  }, options.minDistance)
  const sample = (x: number): EditorPointerSample => ({ pointerId: 1, clientX: x, clientY: 0, shiftKey: false, metaKey: false, ctrlKey: false, buttons: 1 })
  const emit = (type: string, fields: object = {}) => events.dispatchEvent(Object.assign(new Event(type), fields))
  return { base, session, commit, summary, sample, emit, document, getScene: () => scene,
    externalEdit: () => { scene = { ...scene, composition: { ...scene.composition, height: 999 } } },
    endTransaction: () => { active = false } }
}

beforeEach(() => { interactionTrace.clear(); interactionTrace.setEnabled(true) })
afterEach(() => { interactionTrace.setEnabled(false); interactionTrace.clear() })

describe('source pointer cancellation evidence', () => {
  it('records only first/final applied preview summaries and correlates native/source IDs', () => {
    const h = fixture()
    h.session.sample(h.sample(10)); h.session.sample(h.sample(15)); h.session.finish(h.sample(20))
    const records = interactionTrace.getSnapshot().records
    expect(h.commit).toHaveBeenCalledOnce(); expect(h.summary).toHaveBeenCalledTimes(2)
    expect(records.find(record => record.event === 'source-finish')?.details).toMatchObject({ appliedX: 20, samples: 3, distanceCssPx: 20 })
    const source = records.find(record => record.event === 'source-start')!, nativeContext = records.find(record => record.owner === 'test-object.native' && record.event === 'context')!
    expect(nativeContext.details.sourceSessionId).toBe(source.sessionId)
    expect(records.find(record => record.event === 'source-commit')?.details.transactionActive).toBe(false)
    expect(records.every(record => !('scene' in record.details))).toBe(true)
  })

  it('records source divergence identities while preserving the external edit', () => {
    const h = fixture()
    h.session.sample(h.sample(10)); h.externalEdit(); h.session.finish(h.sample(20))
    const rejected = interactionTrace.getSnapshot().records.find(record => record.event === 'current-rejected')!
    expect(rejected.details.reason).toBe('source-changed')
    expect(rejected.details.currentReference).not.toBe(rejected.details.expectedReference)
    expect(h.getScene().composition.height).toBe(999); expect(h.commit).not.toHaveBeenCalled()
    expect(interactionTrace.getSnapshot().records.find(record => record.event === 'source-cancel')?.details).toMatchObject({ reason: 'source-changed', preserveScene: true })
  })

  it.each(['blur', 'pointercancel'] as const)('preserves native %s cancellation reason', reason => {
    const h = fixture(); h.session.sample(h.sample(10)); h.emit(reason, h.sample(10))
    expect(interactionTrace.getSnapshot().records.find(record => record.event === 'source-cancel')?.details.reason).toBe('native:' + reason)
    expect(h.getScene()).toBe(h.base); expect(h.commit).not.toHaveBeenCalled()
  })

  it('distinguishes no-change and under-threshold rejection from commit failure', () => {
    const unchanged = fixture({ unchanged: true }); unchanged.session.finish(unchanged.sample(20))
    const tiny = fixture({ minDistance: 5 }); tiny.session.finish(tiny.sample(2))
    const failed = fixture(); failed.commit.mockImplementation(() => { throw new Error('Rejected') }); failed.session.finish(failed.sample(20))
    expect(interactionTrace.getSnapshot().records.filter(record => record.event === 'source-cancel').map(record => record.details.reason))
      .toEqual(['no-source-change', 'below-drag-threshold', 'commit-error'])
  })

  it('records inactive transaction and document replacement without restoring stale snapshots', () => {
    const inactive = fixture(); inactive.endTransaction(); inactive.session.finish(inactive.sample(20))
    const aborted = fixture(); aborted.document.abort()
    expect(interactionTrace.getSnapshot().records.filter(record => record.event === 'current-rejected').map(record => record.details.reason))
      .toEqual(['transaction-inactive', 'document-aborted'])
    expect(inactive.commit).not.toHaveBeenCalled(); expect(aborted.commit).not.toHaveBeenCalled()
  })

  it('cannot turn a diagnostic preview summary error into an edit cancellation', () => {
    const h = fixture({ brokenSummary: true }); h.session.finish(h.sample(20))
    expect(h.commit).toHaveBeenCalledOnce()
    expect(interactionTrace.getSnapshot().records.find(record => record.event === 'source-finish')?.details.diagnosticSummaryError).toBe(true)
  })

  it('does not call diagnostic preview observers while collection is disabled', () => {
    interactionTrace.setEnabled(false)
    const h = fixture(); h.session.finish(h.sample(20))
    expect(h.commit).toHaveBeenCalledOnce(); expect(h.summary).not.toHaveBeenCalled()
    expect(interactionTrace.getSnapshot().records).toEqual([])
  })
})
