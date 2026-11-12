import { utf8ByteLength } from '@/lib/format/json'
import type { InteractionTraceDetails, InteractionTraceRecord, InteractionTraceRestoreState } from '../types'

export const TRACE_STORAGE_MAX_BYTES = 2 * 1024 ** 2
const MAX_ID = 1_000_000_000_000

/** Convert untrusted tab storage to a detached, bounded scalar trace. Unknown
 * versions/malformed payloads are ignored wholesale. No runtime objects survive.
 * The byte limit is checked before parsing; last-capacity records preserve order. */
export function decodeTraceStorage(raw: string | null, capacity: number): InteractionTraceRestoreState | undefined {
  if (!raw || raw.length > TRACE_STORAGE_MAX_BYTES) return
  try {
    utf8ByteLength(raw, TRACE_STORAGE_MAX_BYTES)
    const value: unknown = JSON.parse(raw)
    if (!object(value) || value.schemaVersion !== 1 || !object(value.state)) return
    const state = value.state
    if (typeof state.enabled !== 'boolean' || !integer(state.dropped, 0) || !integer(state.nextSequence, 1) || !integer(state.nextSession, 1)) return
    if (!Array.isArray(state.records) || state.records.length > 1000) return
    const records: InteractionTraceRecord[] = []
    let sequence = 0, largestSession = 0
    for (const item of state.records) {
      if (!object(item) || !integer(item.sequence, 1) || item.sequence <= sequence || !integer(item.sessionId, 1)
        || !label(item.bootId) || !label(item.owner) || !label(item.event) || typeof item.timeMs !== 'number' || !Number.isFinite(item.timeMs)
        || !object(item.details) || Object.keys(item.details).length > 24) return
      const details: Record<string, string | number | boolean | null> = {}
      for (const [key, detail] of Object.entries(item.details)) {
        if (!label(key) || !(detail === null || typeof detail === 'boolean' || typeof detail === 'number' && Number.isFinite(detail)
          || typeof detail === 'string' && detail.length <= 160)) return
        details[key] = detail
      }
      sequence = item.sequence; largestSession = Math.max(largestSession, item.sessionId)
      records.push(Object.freeze({ bootId: item.bootId, sequence, sessionId: item.sessionId, owner: item.owner,
        event: item.event, timeMs: item.timeMs, details: Object.freeze(details) as InteractionTraceDetails }))
    }
    if (state.nextSequence <= sequence || state.nextSession <= largestSession) return
    const excess = Math.max(0, records.length - capacity)
    return Object.freeze({ enabled: state.enabled, dropped: state.dropped + excess, records: Object.freeze(records.slice(excess)),
      nextSequence: state.nextSequence, nextSession: state.nextSession })
  } catch { return undefined }
}

/** Encode at most 2 MiB of scalar evidence. Extremely large Unicode metadata
 * evicts oldest records in quarters until it fits; counters remain authoritative.
 * Persistence errors are handled by the storage adapter, not by source tools. */
export function encodeTraceStorage(state: InteractionTraceRestoreState): string {
  let records = state.records, dropped = state.dropped
  for (;;) {
    const raw = JSON.stringify({ schemaVersion: 1, state: { ...state, records, dropped } })
    try { utf8ByteLength(raw, TRACE_STORAGE_MAX_BYTES); return raw }
    catch (failure) {
      if (records.length <= 1) throw failure
      const excess = Math.max(1, Math.ceil(records.length / 4))
      records = records.slice(excess); dropped += excess
    }
  }
}

/** JSON objects only; arrays never stand in for metadata/envelopes. */
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
/** Bound numerical identities before they approach floating-point precision loss. */
function integer(value: unknown, minimum: number): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value < MAX_ID }
/** Shared persisted owner/event/key/boot string bound. */
function label(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 80 }
