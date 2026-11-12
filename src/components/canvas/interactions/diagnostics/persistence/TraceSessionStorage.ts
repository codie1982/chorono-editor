import type { InteractionTrace } from '../InteractionTrace'
import { decodeTraceStorage, encodeTraceStorage } from './TraceStorageConverter'

export const TRACE_SESSION_STORAGE_KEY = 'chorono.interaction-diagnostics.v1'

/** Browser ports are injected so storage/timing/lifecycle remain outside the
 * reusable trace store and can be checked deterministically without a browser. */
export interface TraceSessionStorageHost {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>
  schedule(callback: () => void, delayMs: number): unknown
  cancel(handle: unknown): void
}

/** Best-effort persistence for one tab's opt-in diagnostic collection.
 *
 * Restore happens once before subscription. Event/state changes coalesce to one
 * write per 200 ms; pagehide and dispose synchronously flush pending evidence.
 * This owner keeps no scene, DOM or media data. Storage denial/quota/corruption
 * cannot throw through a gesture callback or disable in-memory diagnostics.
 * The caller owns dispose; it releases its subscriber, timer and page listener.
 */
export class TraceSessionStorage {
  private readonly unsubscribe: () => void
  private timer?: unknown
  private dirty = false
  private disposed = false

  constructor(private readonly trace: InteractionTrace, private readonly host: TraceSessionStorageHost) {
    try {
      const state = decodeTraceStorage(host.storage.getItem(TRACE_SESSION_STORAGE_KEY), trace.getSnapshot().capacity)
      if (state) trace.restore(state)
    } catch { /* Blocked storage leaves the bounded in-memory trace usable. */ }
    this.unsubscribe = trace.subscribe(this.changed)
    host.events.addEventListener('pagehide', this.onPageHide)
    // A caller may enable tracing before the client effect acquires storage.
    // Capture that existing opt-in state too; a fresh disabled owner stays idle.
    const snapshot = trace.getSnapshot()
    if (snapshot.enabled || snapshot.records.length) this.changed()
  }

  /** Force only pending state to storage. Failed writes are dropped rather than
   * retried on an idle loop; another actual event may attempt persistence again. */
  flush(): void {
    if (this.timer !== undefined) { this.host.cancel(this.timer); this.timer = undefined }
    if (!this.dirty) return
    this.dirty = false
    try { this.host.storage.setItem(TRACE_SESSION_STORAGE_KEY, encodeTraceStorage(this.trace.getRestoreState())) }
    catch { /* Quota/security/serialization failures must not change editing. */ }
  }

  /** Flush once and release every borrowed event/timer/subscription handle. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe()
    this.host.events.removeEventListener('pagehide', this.onPageHide)
    this.flush()
  }

  private readonly onPageHide = () => { this.flush() }

  /** No polling: schedule at most one bounded delay for actual trace changes. */
  private readonly changed = () => {
    if (this.disposed) return
    this.dirty = true
    if (this.timer !== undefined) return
    try { this.timer = this.host.schedule(() => { this.timer = undefined; this.flush() }, 200) }
    catch { this.flush() }
  }
}
