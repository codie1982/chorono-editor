import type { ChronoScene } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'

/** Minimal client-space sample shared by object and timeline-key gestures. */
export interface EditorPointerSample {
  pointerId: number
  clientX: number
  clientY: number
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}

/** Native capture owner borrowed for one gesture; never serialized. */
export interface EditorPointerStart { pointerId: number; currentTarget: Element }
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
 * Terminal window events are observed in capture phase: target/React handlers
 * may consume pointer-up while opening a selection panel. They must not strand
 * an owned transaction until implicit capture loss rolls its preview back.
 * Instances are mutable, single-gesture and not reusable after close.
 */
export abstract class EditorPointerSession<TPreview extends { scene: ChronoScene }> {
  private readonly base: ChronoScene
  private expected: ChronoScene
  private readonly document: AbortSignal
  private pointerId?: number
  private readonly capture?: Element
  private pending?: TPreview
  private closed = false

  /** The caller must begin its editor transaction before construction. A pen
   * insertion may already have a provisional point in the baseline preview. */
  protected constructor(private readonly start: EditorPointerStartOptions,
    private readonly host: EditorPointerSessionHost<TPreview>, pointer?: EditorPointerStart) {
    const editor = host.getEditor()
    this.base = this.expected = editor.getScene()
    this.document = editor.getDocumentSignal()
    this.pointerId = pointer?.pointerId
    this.capture = pointer?.currentTarget
    try { this.capture?.setPointerCapture?.(this.pointerId!) } catch { /* window listeners remain the fallback */ }
    host.eventTarget.addEventListener('pointermove', this.onMove)
    host.eventTarget.addEventListener('pointerup', this.onUp, true)
    host.eventTarget.addEventListener('pointercancel', this.onCancel, true)
    host.eventTarget.addEventListener('keydown', this.onKey)
    host.eventTarget.addEventListener('blur', this.onBlur)
    this.capture?.addEventListener('lostpointercapture', this.onCancel as EventListener)
    this.document.addEventListener('abort', this.onDocumentAbort, { once: true })
  }

  private readonly onMove = (event: PointerEvent) => { this.sample(event) }
  private readonly onUp = (event: PointerEvent) => { this.finish(event) }
  private readonly onCancel = (event: PointerEvent) => { if (this.accepts(event)) this.cancel() }
  private readonly onBlur = () => { this.cancel() }
  private readonly onDocumentAbort = () => { this.close() }
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); this.cancel() }
  }

  private accepts(event: EditorPointerSample): boolean {
    if (this.closed) return false
    if (this.pointerId === undefined) this.pointerId = event.pointerId
    return event.pointerId === this.pointerId
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
    const target = this.host.eventTarget
    target.removeEventListener('pointermove', this.onMove)
    target.removeEventListener('pointerup', this.onUp, true)
    target.removeEventListener('pointercancel', this.onCancel, true)
    target.removeEventListener('keydown', this.onKey)
    target.removeEventListener('blur', this.onBlur)
    this.capture?.removeEventListener('lostpointercapture', this.onCancel as EventListener)
    this.document.removeEventListener('abort', this.onDocumentAbort)
    try { if (this.pointerId !== undefined) this.capture?.releasePointerCapture?.(this.pointerId) } catch { /* native capture already released */ }
    this.host.clear()
  }
}
