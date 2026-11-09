import type { InteractionTraceDetails, InteractionTraceRecord, InteractionTraceRestoreState, InteractionTraceSession, InteractionTraceSnapshot } from './types'

const EMPTY_RECORDS: readonly InteractionTraceRecord[] = Object.freeze([])

/** A bounded, opt-in, local interaction event owner.
 *
 * Mutable storage belongs to this instance; consumers receive frozen snapshots.
 * There is no timer, console/network sink, source serialization or persistence.
 * Disabled recording neither retains payloads nor creates sessions. Native
 * gesture owners record their first movement and terminal summary rather than
 * every movement. UI subscribers may use getSnapshot/subscribe directly through
 * useSyncExternalStore. Throwing subscribers cannot change gesture behavior.
 */
export class InteractionTrace {
  private snapshot: InteractionTraceSnapshot
  private readonly listeners = new Set<() => void>()
  private nextSequence = 1
  private nextSession = 1
  private restored = false

  /** Capacity is a positive integer, capped at 1000. Clock injection supports
   * deterministic tests; the browser default is Date.now in epoch milliseconds. */
  constructor(capacity = 300, private readonly clock: () => number = Date.now,
    private readonly bootId = 'memory') {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000) throw new RangeError('Trace capacity must be between 1 and 1000')
    this.snapshot = Object.freeze({ enabled: false, capacity, dropped: 0, records: EMPTY_RECORDS })
  }

  /** Read the same immutable object until an actual state/event change. */
  readonly getSnapshot = (): InteractionTraceSnapshot => this.snapshot

  /** Subscribe synchronously to state changes; unsubscribe is idempotent. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Start/stop local collection. Stopping keeps recorded evidence available. */
  setEnabled(enabled: boolean): void {
    if (this.snapshot.enabled === enabled) return
    this.publish({ ...this.snapshot, enabled })
  }

  /** Remove evidence/eviction count while preserving enabled state and identity. */
  clear(): void {
    if (!this.snapshot.records.length && !this.snapshot.dropped) return
    this.publish({ ...this.snapshot, records: EMPTY_RECORDS, dropped: 0 })
  }

  /** Allocate a numeric correlation ID only while collection is enabled. Values
   * are copied/sanitized immediately; the returned lease retains no details. */
  begin(owner: string, details?: InteractionTraceDetails): InteractionTraceSession | undefined {
    if (!this.snapshot.enabled) return
    const id = this.nextSession++, label = this.label(owner)
    const lease: InteractionTraceSession = Object.freeze({ id,
      record: (event: string, values?: InteractionTraceDetails) => this.record(id, label, event, values) })
    if (details) lease.record('context', details)
    return lease
  }

  /** Record a one-off routing rejection/transition without retaining a gesture. */
  recordEvent(owner: string, event: string, details?: InteractionTraceDetails): void {
    this.begin(owner)?.record(event, details)
  }

  /** Export a versioned JSON string. Download/persistence belongs to the UI;
   * calling this method does not stop collection or mutate existing evidence. */
  exportJson(): string {
    return JSON.stringify({ schemaVersion: 1, scope: 'local-editor-interactions',
      exportedAtMs: this.clock(), currentBootId: this.bootId, ...this.snapshot }, null, 2)
  }

  /** Read only serializable state/counters. Browser storage ownership belongs
   * to a separate adapter; no write or timer is created by this operation. */
  getRestoreState(): InteractionTraceRestoreState {
    return Object.freeze({ enabled: this.snapshot.enabled, dropped: this.snapshot.dropped,
      records: this.snapshot.records, nextSequence: this.nextSequence, nextSession: this.nextSession })
  }

  /** Restore validated scalar evidence once, before this instance records or
   * enables tracing. Active in-memory evidence always wins over a stale stored
   * copy. The caller validates version/shape; this method re-copies/bounds values,
   * preserves old boot IDs, and advances counters past every restored identity.
   * It returns false rather than replacing an active or already-restored trace. */
  restore(state: InteractionTraceRestoreState): boolean {
    if (this.restored || this.snapshot.enabled || this.snapshot.records.length || this.nextSequence !== 1 || this.nextSession !== 1) return false
    if (!Number.isSafeInteger(state.nextSequence) || state.nextSequence < 1 || !Number.isSafeInteger(state.nextSession) || state.nextSession < 1) return false
    const excess = Math.max(0, state.records.length - this.snapshot.capacity)
    const records = state.records.slice(excess).map(record => Object.freeze({ sequence: record.sequence, sessionId: record.sessionId,
      timeMs: record.timeMs, bootId: this.label(record.bootId), owner: this.label(record.owner),
      event: this.label(record.event), details: this.details(record.details) }))
    this.nextSequence = Math.max(state.nextSequence, ...records.map(record => record.sequence + 1))
    this.nextSession = Math.max(state.nextSession, ...records.map(record => record.sessionId + 1))
    this.restored = true
    this.publish({ ...this.snapshot, enabled: state.enabled, dropped: state.dropped + excess, records: Object.freeze(records) })
    return true
  }

  /** Copy only finite scalar values; bound keys/strings/field count so callers
   * cannot accidentally retain a large payload through diagnostic metadata. */
  private details(input?: InteractionTraceDetails): InteractionTraceDetails {
    const result: Record<string, string | number | boolean | null> = {}
    for (const [key, value] of Object.entries(input ?? {}).slice(0, 24)) {
      if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) result[this.label(key)] = value
      else if (typeof value === 'string') result[this.label(key)] = value.slice(0, 160)
    }
    return Object.freeze(result)
  }

  /** Disabled collection is a no-op even for an existing session lease. */
  private record(sessionId: number, owner: string, event: string, details?: InteractionTraceDetails): void {
    if (!this.snapshot.enabled) return
    const record: InteractionTraceRecord = Object.freeze({ bootId: this.bootId, sequence: this.nextSequence++, sessionId, owner,
      event: this.label(event), timeMs: this.clock(), details: this.details(details) })
    const records = [...this.snapshot.records, record]
    const excess = Math.max(0, records.length - this.snapshot.capacity)
    this.publish({ ...this.snapshot, records: Object.freeze(records.slice(excess)), dropped: this.snapshot.dropped + excess })
  }

  /** Owner/event/key labels have a small fixed bound and no object references. */
  private label(value: string): string { return value.slice(0, 80) }

  /** Diagnostic delivery cannot interrupt editor source/capture cleanup. */
  private publish(snapshot: InteractionTraceSnapshot): void {
    this.snapshot = Object.freeze(snapshot)
    for (const listener of Array.from(this.listeners)) { try { listener() } catch { /* Optional diagnostic observer failed. */ } }
  }
}
