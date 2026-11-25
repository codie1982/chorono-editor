import type { JobExecutor } from '@/lib/resources/jobs'
import { cancelledJobError } from '@/lib/resources/jobs'
import type {
  BakeJobHandle,
  BakeJobProgress,
  BakeJobSnapshot,
  BakeJobSpec,
} from './BakeContracts'

/** Distinguishes source invalidation from cancellation and algorithm failure. */
export class BakeSourceStaleError extends Error {
  constructor(message = 'Bake source changed. Prepare a new preview from the current source.') {
    super(message)
    this.name = 'BakeSourceStaleError'
  }
}

/**
 * Owns one bake generation and its cancellation/source guards.
 *
 * The job stores only a transient typed preview and small status records. The
 * adapter owns numerical work and returned buffer semantics; the caller owns
 * the atomic editor command used by `commit`. Instances are mutable, are never
 * serialized, and must be disposed when their panel/document lifetime ends.
 */
export class BakeJob<TPreview> implements BakeJobHandle<TPreview> {
  private readonly listeners = new Set<() => void>()
  private readonly controller = new AbortController()
  private snapshot: BakeJobSnapshot<TPreview>
  private started = false
  private disposed = false

  constructor(
    id: string,
    private readonly spec: BakeJobSpec<TPreview>,
    private readonly executor: JobExecutor,
    private readonly release: () => void,
  ) {
    this.snapshot = {
      id,
      kind: spec.kind,
      label: spec.label,
      source: spec.source,
      status: 'idle',
      progress: { value: 0, phase: 'idle', message: 'Ready to prepare a bake preview.' },
    }
    spec.documentSignal?.addEventListener('abort', this.handleDocumentAbort, { once: true })
    if (spec.documentSignal?.aborted) this.markStale('The source document was replaced.')
  }

  /** Returns the same object until a meaningful state/progress transition. */
  readonly getSnapshot = (): BakeJobSnapshot<TPreview> => this.snapshot

  /** Registers a synchronous status listener; the returned cleanup is idempotent. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Queues adapter preparation once. Admission, cancellation and late result
   * settlement are delegated to the injected bounded executor. Failures are
   * represented in the snapshot, so callers may safely fire-and-observe.
   */
  async start(): Promise<void> {
    if (this.disposed) throw new Error('Bake job is disposed.')
    if (this.started) throw new Error('Bake job has already started.')
    this.started = true
    if (!this.checkSource()) return
    this.publish({ status: 'queued', progress: { value: 0, phase: 'queued', message: 'Bake preview queued.' } })
    try {
      const preview = await this.executor.submit(async signal => {
        if (!this.isUsableSource()) throw new BakeSourceStaleError()
        this.publish({ status: 'running', progress: { value: 0.02, phase: 'prepare', message: 'Preparing bake preview.' } })
        const result = await this.spec.prepare({ signal, reportProgress: this.reportProgress })
        if (signal.aborted) { this.discardPrepared(result); throw cancelledJobError() }
        if (!this.isUsableSource()) { this.discardPrepared(result); throw new BakeSourceStaleError() }
        return result
      }, { signal: this.controller.signal, discard: preview => this.discardPrepared(preview) })
      if (this.snapshot.status === 'stale' || this.snapshot.status === 'cancelled' || this.disposed) return
      this.publish({ status: 'preview-ready', preview, error: undefined,
        progress: { value: 1, phase: 'preview', message: 'Bake preview is ready.' } })
    } catch (error) {
      if (this.snapshot.status === 'stale' || this.snapshot.status === 'cancelled' || this.disposed) return
      if (error instanceof BakeSourceStaleError) {
        this.markStale(error.message)
      } else if (error instanceof Error && error.name === 'AbortError') {
        this.publishCancelled()
      } else {
        this.publish({ status: 'failed', preview: undefined, error: errorMessage(error),
          progress: { ...this.snapshot.progress, phase: 'failed', message: 'Bake preview failed.' } })
      }
    }
  }

  /** Requests cancellation and immediately discards any unpublished preview. */
  cancel(): void {
    if (this.disposed || isTerminal(this.snapshot.status)) return
    this.controller.abort()
    this.publishCancelled()
  }

  /** Re-evaluates the adapter's read-only source predicate and marks stale once. */
  checkSource(): boolean {
    if (this.disposed || this.snapshot.status === 'stale') return false
    if (!this.isUsableSource()) {
      this.markStale('Bake source changed. Prepare a new preview from the current source.')
      return false
    }
    return true
  }

  /**
   * Publishes a reviewed preview through one caller-owned transaction.
   * Source identity is checked immediately before invocation. A successful
   * callback transfers artifact ownership to the caller; this job keeps only
   * its preview reference until disposal.
   */
  async commit(publish: (preview: TPreview) => void): Promise<void> {
    if (this.disposed) throw new Error('Bake job is disposed.')
    if (this.snapshot.status !== 'preview-ready' || this.snapshot.preview === undefined) {
      throw new Error('Bake preview is not ready to commit.')
    }
    if (!this.checkSource()) throw new BakeSourceStaleError(this.snapshot.error)
    const preview = this.snapshot.preview
    this.publish({ status: 'committing', error: undefined,
      progress: { value: 1, phase: 'commit', message: 'Applying bake in one undoable edit.' } })
    try {
      // Publication must be one synchronous transaction. Any async asset/cache
      // preparation belongs to `prepare`, before this source-write boundary.
      publish(preview)
      this.discardSnapshotPreview()
      this.publish({ status: 'completed', progress: { value: 1, phase: 'completed', message: 'Bake completed.' } })
    } catch (error) {
      if (!this.isUsableSource()) {
        this.markStale('Bake source changed before the preview could be applied.')
        throw new BakeSourceStaleError(this.snapshot.error)
      }
      this.discardSnapshotPreview()
      this.publish({ status: 'failed', error: errorMessage(error),
        progress: { value: 1, phase: 'failed', message: 'Bake commit failed.' } })
      throw error
    }
  }

  /** Cancels unpublished work and releases all runtime listeners/references. */
  dispose(): void {
    if (this.disposed) return
    this.discardSnapshotPreview()
    this.disposed = true
    this.controller.abort()
    this.spec.documentSignal?.removeEventListener('abort', this.handleDocumentAbort)
    this.listeners.clear()
    this.release()
  }

  private readonly handleDocumentAbort = (): void => {
    this.markStale('The source document was replaced.')
  }

  private readonly reportProgress = (progress: BakeJobProgress): void => {
    if (this.disposed || this.snapshot.status !== 'running' || this.controller.signal.aborted) return
    if (!Number.isFinite(progress.value)) throw new RangeError('Bake progress must be finite.')
    const value = Math.max(this.snapshot.progress.value, Math.min(1, Math.max(0, progress.value)))
    this.publish({ progress: { value, phase: progress.phase, message: progress.message } })
  }

  private isUsableSource(): boolean {
    return !this.controller.signal.aborted && !this.spec.documentSignal?.aborted && this.spec.isSourceCurrent()
  }

  private markStale(message: string): void {
    if (this.disposed || isTerminal(this.snapshot.status)) return
    this.controller.abort()
    this.discardSnapshotPreview()
    this.publish({ status: 'stale', preview: undefined, error: message,
      progress: { ...this.snapshot.progress, phase: 'stale', message: 'Bake source is stale.' } })
  }

  private publishCancelled(): void {
    this.discardSnapshotPreview()
    this.publish({ status: 'cancelled', preview: undefined, error: undefined,
      progress: { ...this.snapshot.progress, phase: 'cancelled', message: 'Bake preview was cancelled.' } })
  }

  private publish(patch: Partial<BakeJobSnapshot<TPreview>>): void {
    if (this.disposed) return
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(listener => listener())
  }

  private discardSnapshotPreview(): void {
    const preview = this.snapshot.preview
    if (preview === undefined) return
    this.snapshot = { ...this.snapshot, preview: undefined }
    this.discardPrepared(preview)
  }

  private discardPrepared(preview: TPreview): void {
    this.spec.discardPreview?.(preview)
  }
}

function isTerminal(status: BakeJobSnapshot<unknown>['status']): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed' || status === 'stale'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
