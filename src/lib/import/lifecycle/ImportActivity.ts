import type { ImportProgress } from '../types'
import { cancelledJobError } from '../../resources/jobs'

export interface ImportActivitySnapshot {
  active: number
  settling: number
  label: string | null
  progress: ImportProgress | null
}
export interface ImportOperation {
  readonly signal: AbortSignal
  /** Cancel only this action; actual producer settlement still owns its entry. */
  cancel(): void
  /** Checks document identity as well as cancellation; never changes document state. */
  isCurrent(): boolean
  /** Publish progress only while this action/document remains current. */
  report(progress: ImportProgress): void
  /** Idempotent UI bookkeeping release after the actual producer settles. */
  finish(): void
}
interface Entry { controller: AbortController; label: string; progress: ImportProgress | null; detach(): void }

/** Owns UI request cancellation/status, separately from actual IO queue slots.
 * One operation spans a whole multi-file action. Abort hides its progress but
 * retains a settling entry until the producer actually finishes. Old callbacks
 * cannot clear a newer operation's status. Instances own only controllers and
 * small progress records, never files/results, sources or native resources.
 * Subscriptions are synchronous and snapshots stable until a meaningful update.
 * The bounded request count prevents an unbounded stack of permission prompts
 * or legacy jobs that ignore cancellation. Native concurrency belongs elsewhere. */
export class ImportActivity {
  private readonly entries = new Map<ImportOperation, Entry>()
  private readonly listeners = new Set<() => void>()
  private running = true
  private snapshot: ImportActivitySnapshot = { active: 0, settling: 0, label: null, progress: null }

  /** Borrow stable snapshot/subscription methods directly with useSyncExternalStore. */
  readonly getSnapshot = (): ImportActivitySnapshot => this.snapshot
  /** Subscribe to status changes; the returned operation detaches once. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener); return () => { this.listeners.delete(listener) }
  }

  /** Resume UI ownership after setup. Aborted old requests remain cancelled. */
  start(): void { this.running = true }
  /** Unmount cancels this hook's requests only, never another importer/queue owner. */
  stop(): void { this.running = false; this.cancel() }
  /** User cancellation preserves settlement diagnostics and frees no native slot. */
  readonly cancel = (): void => { this.entries.forEach(entry => entry.controller.abort()); this.publish() }

  /** Capture one document identity for an entire action. Already obsolete or
   * stopped scopes reject before work; at most 130 unsettled UI actions exist.
   * Source identity is rechecked at publication, including synchronous resets. */
  begin(label: string, getDocumentSignal: () => AbortSignal): ImportOperation {
    const documentSignal = getDocumentSignal()
    if (!this.running || documentSignal.aborted) throw cancelledJobError()
    if (this.entries.size >= 130) throw new RangeError('Too many pending import requests. Wait for cancelled work to finish.')
    const controller = new AbortController()
    const abort = () => controller.abort()
    const changed = () => this.publish()
    const entry: Entry = { controller, label, progress: null,
      detach: () => { documentSignal.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', changed) } }
    const operation: ImportOperation = {
      signal: controller.signal,
      cancel: () => controller.abort(),
      isCurrent: () => this.entries.has(operation) && this.running && !controller.signal.aborted && !documentSignal.aborted && getDocumentSignal() === documentSignal,
      report: progress => { if (operation.isCurrent() && this.entries.has(operation)) { entry.progress = progress; this.publish() } },
      finish: () => { if (this.entries.delete(operation)) { entry.detach(); this.publish() } },
    }
    this.entries.set(operation, entry)
    documentSignal.addEventListener('abort', abort, { once: true })
    controller.signal.addEventListener('abort', changed, { once: true })
    this.publish()
    return operation
  }

  /** Progress belongs to the newest live action, not whichever callback ran last. */
  private publish(): void {
    let active = 0, settling = 0, latest: Entry | undefined
    this.entries.forEach((entry, operation) => {
      if (operation.isCurrent()) { active++; latest = entry } else settling++
    })
    this.snapshot = { active, settling, label: latest?.label ?? null, progress: latest?.progress ?? null }
    this.listeners.forEach(listener => listener())
  }
}
