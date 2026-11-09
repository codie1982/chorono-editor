import type { ChronoScene } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { PointerGestureSession, type PointerGestureSample, type PointerGestureStart } from './PointerGestureSession'
import { interactionTrace, type InteractionTraceContext, type InteractionTraceDetails, type InteractionTraceSession } from './diagnostics'

const sourceReferences = new WeakMap<ChronoScene, number>()
let nextSourceReference = 1

/** Numerical correlation only. Weak keys never keep source/undo snapshots alive. */
function sourceReference(scene: ChronoScene): number {
  let reference = sourceReferences.get(scene)
  if (reference === undefined) { reference = nextSourceReference++; sourceReferences.set(scene, reference) }
  return reference
}

/** Minimal client-space sample shared by object and timeline-key gestures. */
export interface EditorPointerSample extends PointerGestureSample {}

/** Native capture owner borrowed for one gesture; never serialized. */
export interface EditorPointerStart extends PointerGestureStart {}
export interface EditorPointerStartOptions {
  startClientX: number
  startClientY: number
  allowClick?: boolean
  minDragDistance?: number
}

/** Domain adapters own preview/commit meaning; this owner manages only pointer,
 * source snapshot and transaction lifetime. Every preview borrows the same base. */
export interface EditorPointerSessionHost<TPreview extends { scene: ChronoScene }> {
  getEditor(): EditorStateReturn
  eventTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>
  preview(base: ChronoScene, event: EditorPointerSample): TPreview
  hasChanges(preview: TPreview): boolean
  show(preview: TPreview, event: EditorPointerSample): void
  commit(base: ChronoScene, preview: TPreview): void
  clear(): void
  warning?(message: string): void
  diagnostics?: InteractionTraceContext
  /** Optional scalar applied-geometry summary, sampled only for first/final
   * previews while tracing. Diagnostic failures never change the gesture. */
  previewSummary?(preview: TPreview, event: EditorPointerSample): InteractionTraceDetails
}

/**
 * Shared abstract lifecycle for editor pointer transactions. Object transforms
 * and timeline-key editing supply small policy subclasses/adapters rather than
 * duplicating listener/capture/cancel logic. The editor owns history/source
 * resources; this instance borrows the baseline until close, removes listeners
 * and releases capture on every exit. A changed source/document is never replaced
 * by a stale baseline. Pointer-up is sampled synchronously before one commit.
 * PointerGestureSession owns native capture, pointer identity and terminal
 * events, shared with view-only Pan. Recovery from a missed release uses the
 * last pressed sample, never a later hover point. This class owns only source,
 * transaction and document policy; explicit cancellation restores its baseline.
 * Instances are mutable, single-gesture and not reusable after close.
 */
export abstract class EditorPointerSession<TPreview extends { scene: ChronoScene }> {
  private readonly base: ChronoScene
  private expected: ChronoScene
  private readonly document: AbortSignal
  private readonly pointer: PointerGestureSession
  private pending?: TPreview
  private closed = false
  private readonly trace?: InteractionTraceSession
  private samples = 0

  /** The caller must begin its editor transaction before construction. A pen
   * insertion may already have a provisional point in the baseline preview. */
  protected constructor(private readonly start: EditorPointerStartOptions,
    private readonly host: EditorPointerSessionHost<TPreview>, pointer?: EditorPointerStart) {
    const editor = host.getEditor()
    this.base = this.expected = editor.getScene()
    this.document = editor.getDocumentSignal()
    this.trace = interactionTrace.begin(host.diagnostics?.owner ?? 'editor-pointer', host.diagnostics?.details)
    this.trace?.record('source-start', { baseReference: sourceReference(this.base),
      transactionActive: editor.isTransactionActive(), documentAborted: this.document.aborted,
      startClientX: start.startClientX, startClientY: start.startClientY,
      allowClick: Boolean(start.allowClick), minDragDistance: start.minDragDistance ?? 0 })
    this.pointer = new PointerGestureSession({ eventTarget: host.eventTarget,
      move: event => this.sample(event), up: event => this.finish(event), cancel: reason => this.cancel(false, 'native:' + reason),
      error: error => host.warning?.(error instanceof Error ? error.message : String(error)),
      diagnostics: { owner: (host.diagnostics?.owner ?? 'editor-pointer') + '.native',
        details: this.trace ? { sourceSessionId: this.trace.id } : undefined },
    }, pointer)
    this.document.addEventListener('abort', this.onDocumentAbort, { once: true })
  }

  private readonly onDocumentAbort = () => {
    this.trace?.record('current-rejected', { reason: 'document-aborted', ...this.sourceState() })
    this.close('document-aborted')
  }

  private accepts(event: EditorPointerSample): boolean {
    return !this.closed && this.pointer.accepts(event)
  }

  /** Reject stale snapshots before geometry/commit. External edits survive; the
   * transaction is detached rather than rolled back over the replacement. */
  private current(): boolean {
    const editor = this.host.getEditor()
    if (this.document.aborted || editor.getDocumentSignal() !== this.document) {
      this.trace?.record('current-rejected', { reason: 'document-changed', ...this.sourceState() })
      this.close('document-changed'); return false
    }
    if (!editor.isTransactionActive()) {
      this.trace?.record('current-rejected', { reason: 'transaction-inactive', ...this.sourceState() })
      this.close('transaction-inactive'); return false
    }
    if (editor.getScene() !== this.expected) {
      this.trace?.record('current-rejected', { reason: 'source-changed', ...this.sourceState() })
      this.cancel(true, 'source-changed')
      this.host.warning?.('The scene changed during the drag. Start the edit again from the current scene.')
      return false
    }
    return true
  }

  /** Apply one sample from the initiating pointer. Exceptions cancel atomically
   * and are reported as diagnostics instead of leaving a half-open transaction. */
  sample(event: EditorPointerSample): void {
    if (!this.accepts(event) || !this.current()) return
    try {
      this.pending = this.host.preview(this.base, event)
      this.host.getEditor().previewTransaction(this.pending.scene)
      this.expected = this.host.getEditor().getScene()
      this.host.show(this.pending, event)
      this.samples++
      if (this.samples === 1) this.trace?.record('source-first-preview', { ...this.sourceState(), ...this.previewDetails(this.pending, event) })
    } catch (error) { this.cancel(false, 'preview-error'); this.host.warning?.(error instanceof Error ? error.message : String(error)) }
  }

  /** Commit the final pointer sample once. A click/returned-to-start gesture
   * creates no history; provisional pen insertion is still a real source edit. */
  finish(event: EditorPointerSample): void {
    if (!this.accepts(event) || !this.current()) return
    this.sample(event)
    if (this.closed || !this.current()) return
    try {
      const distance = Math.hypot(event.clientX - this.start.startClientX, event.clientY - this.start.startClientY)
      const moved = distance > 1e-6
      this.trace?.record('source-finish', { distanceCssPx: distance, samples: this.samples,
        ...this.sourceState(), ...this.previewDetails(this.pending, event) })
      if (!this.pending) { this.cancel(false, 'no-preview'); return }
      if (!this.host.hasChanges(this.pending)) { this.cancel(false, 'no-source-change'); return }
      if (!moved && !this.start.allowClick) { this.cancel(false, 'no-pointer-movement'); return }
      if (distance < (this.start.minDragDistance ?? 0)) { this.cancel(false, 'below-drag-threshold'); return }
      this.host.commit(this.base, this.pending)
      this.trace?.record('source-commit', { ...this.sourceState(), samples: this.samples })
      this.close('committed')
    } catch (error) { this.cancel(false, 'commit-error'); this.host.warning?.(error instanceof Error ? error.message : String(error)) }
  }

  /** Roll back only our own preview. preserveScene detaches a transaction when
   * another command has already changed the scene; document resets own cleanup. */
  cancel(preserveScene = false, reason = 'host-cancel'): void {
    if (this.closed) return
    const editor = this.host.getEditor()
    this.trace?.record('source-cancel', { reason, preserveScene: preserveScene || editor.getScene() !== this.expected,
      ...this.sourceState(), samples: this.samples })
    if (!this.document.aborted && editor.getDocumentSignal() === this.document && editor.isTransactionActive()) {
      editor.cancelTransaction({ preserveScene: preserveScene || editor.getScene() !== this.expected })
    }
    this.close(reason)
  }

  private close(reason: string): void {
    if (this.closed) return
    this.closed = true
    this.trace?.record('source-close', { reason, samples: this.samples })
    this.document.removeEventListener('abort', this.onDocumentAbort)
    this.pointer.dispose()
    this.host.clear()
  }

  /** Capture only source identity divergence and ownership flags, never source
   * JSON. This is called only when a diagnostic record will actually be kept. */
  private sourceState(): InteractionTraceDetails {
    const editor = this.host.getEditor(), current = editor.getScene()
    return { baseReference: sourceReference(this.base), expectedReference: sourceReference(this.expected),
      currentReference: sourceReference(current), transactionActive: editor.isTransactionActive(),
      documentAborted: this.document.aborted, sameDocument: editor.getDocumentSignal() === this.document,
      expectedSourceCurrent: current === this.expected }
  }

  /** Optional applied geometry is an observer, not a prerequisite for editing. */
  private previewDetails(preview: TPreview | undefined, event: EditorPointerSample): InteractionTraceDetails {
    if (!preview) return {}
    try { return this.host.previewSummary?.(preview, event) ?? {} }
    catch { return { diagnosticSummaryError: true } }
  }
}
