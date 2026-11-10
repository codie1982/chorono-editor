import { convertDiagnosticFailure } from '../conversion/convertDiagnosticFailure'
import { convertDiagnosticReport } from '../conversion/convertDiagnosticReport'
import { DIAGNOSTIC_MAX_COUNT, DIAGNOSTIC_MAX_GROUPS } from '../contracts/types'
import type { BuildInfo } from '@/lib/version'
import { diagnosticGroup, encodeOutbox } from './outboxCodec'
import { DIAGNOSTIC_DELIVERY_INTERVAL_MS, DIAGNOSTIC_MAX_ATTEMPTS, DIAGNOSTIC_OUTBOX_MAX_ITEMS, DIAGNOSTIC_OUTBOX_TTL_MS,
  type DiagnosticOutboxState } from './types'

/** Count local drops without unbounded integer growth. */
export function diagnosticDrop(state: DiagnosticOutboxState, amount = 1): DiagnosticOutboxState {
  return { ...state, dropped: Math.min(DIAGNOSTIC_MAX_COUNT, state.dropped + amount) }
}

/** Expire old reports but retain the day's finite admission catalogue. */
export function expireOutbox(state: DiagnosticOutboxState, now: number): DiagnosticOutboxState {
  const items = state.items.filter(item => item.attempts < DIAGNOSTIC_MAX_ATTEMPTS && item.createdAt <= now &&
    now - item.createdAt < DIAGNOSTIC_OUTBOX_TTL_MS)
  return diagnosticDrop({ ...state, items, lastTime: now }, state.items.length - items.length)
}

/** Append one known occurrence, merging only a never-attempted report. UUIDs
 * and count deltas are frozen once attempts > 0; retries never call this path.
 * The daily 20-group, 200-item, 256 KiB and 1m-count caps are fail-closed.
 * No caller input or mutable report object is retained. */
export function recordOutbox(state: DiagnosticOutboxState, input: unknown, build: BuildInfo,
  now: number, randomId: () => string): DiagnosticOutboxState {
  const failure = convertDiagnosticFailure(input)
  if (!failure) return state
  const day = new Date(now).toISOString().slice(0, 10)
  let next = day === state.day ? state : { ...state, day, seen: [] }
  const probe = convertDiagnosticReport({ ...build, ...failure, day, occurrenceCount: 1 }, randomId())
  if (!probe) return diagnosticDrop(next)
  const key = diagnosticGroup(probe)
  if (!next.seen.some(report => diagnosticGroup(report) === key)) {
    if (next.seen.length >= DIAGNOSTIC_MAX_GROUPS) return diagnosticDrop(next)
    next = { ...next, seen: [...next.seen, probe] }
  }
  const existing = next.items.findIndex(item => item.attempts === 0 && diagnosticGroup(item.report) === key)
  let items = next.items.slice()
  if (existing >= 0) {
    const item = items[existing]
    if (item.report.occurrenceCount >= DIAGNOSTIC_MAX_COUNT) return diagnosticDrop(next)
    const report = convertDiagnosticReport({ ...item.report, occurrenceCount: item.report.occurrenceCount + 1 }, item.report.reportId)!
    items[existing] = { ...item, report }
  } else {
    if (items.length >= DIAGNOSTIC_OUTBOX_MAX_ITEMS) return diagnosticDrop(next)
    items.push({ report: probe, createdAt: now, attempts: 0, nextAttemptAt: now + DIAGNOSTIC_DELIVERY_INTERVAL_MS })
  }
  const candidate = { ...next, items, lastTime: now }
  try { encodeOutbox(candidate); return candidate }
  catch { return diagnosticDrop(next) }
}

/** Earliest legal attempt, including the shared inter-request throttle. */
export function outboxNextAttempt(state: DiagnosticOutboxState): number | null {
  if (!state.items.length) return null
  const throttle = state.lastAttemptAt === null ? 0 : state.lastAttemptAt + DIAGNOSTIC_DELIVERY_INTERVAL_MS
  return Math.max(throttle, Math.min(...state.items.map(item => item.nextAttemptAt)))
}
