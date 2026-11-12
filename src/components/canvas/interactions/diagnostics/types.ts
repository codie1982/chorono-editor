/** Only scalar diagnostic metadata is retained: IDs, CSS/composition coordinates,
 * counts, flags and reason codes. Scene data, names, media and errors are excluded. */
export type InteractionTraceDetails = Readonly<Record<string, string | number | boolean | null>>

/** Optional owner label and scalar context supplied by a concrete gesture tool. */
export interface InteractionTraceContext {
  owner: string
  details?: InteractionTraceDetails
}

/** One immutable local diagnostic event. `timeMs` is Unix epoch milliseconds;
 * sequence and session IDs increase across clears to preserve identity. */
export interface InteractionTraceRecord {
  /** Runtime boot identity scopes weak source-reference IDs after a reload. */
  readonly bootId: string
  readonly sequence: number
  readonly sessionId: number
  readonly owner: string
  readonly event: string
  readonly timeMs: number
  readonly details: InteractionTraceDetails
}

/** Stable external-store snapshot. Existing snapshots never change when new
 * records arrive. `dropped` counts older events evicted since the last clear. */
export interface InteractionTraceSnapshot {
  readonly enabled: boolean
  readonly capacity: number
  readonly dropped: number
  readonly records: readonly InteractionTraceRecord[]
}

/** Borrowed diagnostic session; retains no editor/source or platform handles.
 * Recording after tracing stops is a no-op. The gesture owns its lifetime. */
export interface InteractionTraceSession {
  readonly id: number
  record(event: string, details?: InteractionTraceDetails): void
}

/** Pure bounded state handed to a separate persistence/conversion adapter.
 * Counters survive Clear/reload even when no records remain. */
export interface InteractionTraceRestoreState {
  readonly enabled: boolean
  readonly dropped: number
  readonly records: readonly InteractionTraceRecord[]
  readonly nextSequence: number
  readonly nextSession: number
}
