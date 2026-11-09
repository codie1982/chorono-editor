import type { ChronoScene } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { PointerGestureSession, type PointerGestureSample, type PointerGestureStart } from './PointerGestureSession'

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

  /** The caller must begin its editor transaction before construction. A pen
   * insertion may already have a provisional point in the baseline preview. */
  protected constructor(private readonly start: EditorPointerStartOptions,
    private readonly host: EditorPointerSessionHost<TPreview>, pointer?: EditorPointerStart) {
    const editor = host.getEditor()
    this.base = this.expected = editor.getScene()
    this.document = editor.getDocumentSignal()
    this.pointer = new PointerGestureSession({ eventTarget: host.eventTarget,
      move: event => this.sample(event), up: event => this.finish(event), cancel: () => this.cancel(),
      error: error => host.warning?.(error instanceof Error ? error.message : String(error)),
    }, pointer)
    this.document.addEventListener('abort', this.onDocumentAbort, { once: true })
  }

  private readonly onDocumentAbort = () => { this.close() }

  private accepts(event: EditorPointerSample): boolean {
    return !this.closed && this.pointer.accepts(event)
  }

  /** Reject stale snapshots before geometry/commit. External edits survive; the
   * transaction is detached rather than rolled back over the replacement. */
  private current(): boolean {
    const editor = this.host.getEditor()
    if (this.document.aborted || editor.getDocumentSignal() !== this.document) { this.close(); return false }
    if (!editor.isTransactionActive()) { this.close(); return false }
    if (editor.getScene() !== this.expected) {
      this.cancel(true)
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
    } catch (error) { this.cancel(); this.host.warning?.(error instanceof Error ? error.message : String(error)) }
  }

  /** Commit the final pointer sample once. A click/returned-to-start gesture
   * creates no history; provisional pen insertion is still a real source edit. */
  finish(event: EditorPointerSample): void {
    if (!this.accepts(event) || !this.current()) return
    this.sample(event)
    if (this.closed || !this.current()) return
    try {
      const moved = Math.hypot(event.clientX - this.start.startClientX, event.clientY - this.start.startClientY) > 1e-6
      if (!this.pending || !this.host.hasChanges(this.pending) || (!moved && !this.start.allowClick)) { this.cancel(); return }
      if (Math.hypot(event.clientX - this.start.startClientX, event.clientY - this.start.startClientY) < (this.start.minDragDistance ?? 0)) { this.cancel(); return }
      this.host.commit(this.base, this.pending)
      this.close()
    } catch (error) { this.cancel(); this.host.warning?.(error instanceof Error ? error.message : String(error)) }
  }

  /** Roll back only our own preview. preserveScene detaches a transaction when
   * another command has already changed the scene; document resets own cleanup. */
  cancel(preserveScene = false): void {
    if (this.closed) return
    const editor = this.host.getEditor()
    if (!this.document.aborted && editor.getDocumentSignal() === this.document && editor.isTransactionActive()) {
      editor.cancelTransaction({ preserveScene: preserveScene || editor.getScene() !== this.expected })
    }
    this.close()
  }

  private close(): void {
    if (this.closed) return
    this.closed = true
    this.document.removeEventListener('abort', this.onDocumentAbort)
    this.pointer.dispose()
    this.host.clear()
  }
}
