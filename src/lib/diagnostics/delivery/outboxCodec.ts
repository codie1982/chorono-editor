import { utf8ByteLength } from '@/lib/format/json'
import { validateDiagnosticReport } from '../conversion/validateDiagnosticReport'
import { DIAGNOSTIC_MAX_COUNT, DIAGNOSTIC_MAX_GROUPS } from '../contracts/types'
import { DIAGNOSTIC_OUTBOX_MAX_BYTES, DIAGNOSTIC_OUTBOX_MAX_ITEMS, DIAGNOSTIC_POLICY_VERSION,
  type DiagnosticDeliveryConsent, type DiagnosticOutboxState } from './types'

/** Safe local millisecond epoch range, preserving YYYY-MM-DD day semantics. */
export function diagnosticTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 253_402_300_799_999
}

/** Fresh empty state for exactly one local consent generation/target. */
export function emptyOutbox(consent: DiagnosticDeliveryConsent): DiagnosticOutboxState {
  return { schemaVersion: 1, generation: consent.generation, endpoint: consent.endpoint,
    policyVersion: DIAGNOSTIC_POLICY_VERSION, day: null, seen: [], items: [], dropped: 0,
    lastAttemptAt: null, lastSentAt: null, lastTime: 0, lastOutcome: 'idle' }
}

/** Code-only grouping identity. No caller text or raw error reaches this key. */
export function diagnosticGroup(report: DiagnosticOutboxState['seen'][number]): string {
  return JSON.stringify([report.day, report.appVersion, report.buildId, report.channel,
    report.errorCode, report.module, report.failureSite])
}

/** Parse at most 256 KiB of same-generation local state. Every report is
 * revalidated by the strict server/shared boundary; corrupt/unknown envelope
 * fields reset to empty, never become requests. Expiry is a later state policy.
 * Returns undefined for malformed state; no storage is accessed here. */
export function decodeOutbox(raw: string | null, consent: DiagnosticDeliveryConsent): DiagnosticOutboxState | undefined {
  if (raw === null) return emptyOutbox(consent)
  try {
    utf8ByteLength(raw, DIAGNOSTIC_OUTBOX_MAX_BYTES)
    const state = JSON.parse(raw) as Record<string, unknown>
    const fields = ['schemaVersion', 'generation', 'endpoint', 'policyVersion', 'day', 'seen', 'items',
      'dropped', 'lastAttemptAt', 'lastSentAt', 'lastTime', 'lastOutcome']
    if (!state || typeof state !== 'object' || Object.keys(state).length !== fields.length ||
      Object.keys(state).some(key => !fields.includes(key)) || state.schemaVersion !== 1 ||
      state.generation !== consent.generation || state.endpoint !== consent.endpoint ||
      state.policyVersion !== DIAGNOSTIC_POLICY_VERSION ||
      !Array.isArray(state.seen) || state.seen.length > DIAGNOSTIC_MAX_GROUPS ||
      !Array.isArray(state.items) || state.items.length > DIAGNOSTIC_OUTBOX_MAX_ITEMS ||
      !diagnosticTime(state.lastTime) ||
      (state.lastAttemptAt !== null && !diagnosticTime(state.lastAttemptAt)) ||
      (state.lastSentAt !== null && !diagnosticTime(state.lastSentAt)) ||
      typeof state.dropped !== 'number' || !Number.isSafeInteger(state.dropped) || state.dropped < 0 || state.dropped > DIAGNOSTIC_MAX_COUNT ||
      !['idle', 'sent', 'retrying', 'failed'].includes(state.lastOutcome as string) ||
      (state.day !== null && (typeof state.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.day)))) return
    const seen = state.seen.map(validateDiagnosticReport)
    if (seen.some(report => !report) || new Set(seen.map(report => diagnosticGroup(report!))).size !== seen.length ||
      seen.some(report => report!.day !== state.day)) return
    const ids = new Set<string>()
    const items = []
    for (const input of state.items) {
      if (!input || typeof input !== 'object' || Object.keys(input).length !== 4 ||
        Object.keys(input).some(key => !['report', 'createdAt', 'attempts', 'nextAttemptAt'].includes(key))) return
      const report = validateDiagnosticReport(input.report)
      if (!report || ids.has(report.reportId) || !diagnosticTime(input.createdAt) ||
        !diagnosticTime(input.nextAttemptAt) || !Number.isInteger(input.attempts) || input.attempts < 0 || input.attempts > 5) return
      ids.add(report.reportId)
      items.push({ report, createdAt: input.createdAt, attempts: input.attempts, nextAttemptAt: input.nextAttemptAt })
    }
    return { ...emptyOutbox(consent), day: state.day as string | null, seen: seen as DiagnosticOutboxState['seen'],
      items, dropped: state.dropped, lastTime: state.lastTime,
      lastAttemptAt: state.lastAttemptAt as number | null, lastSentAt: state.lastSentAt as number | null,
      lastOutcome: state.lastOutcome as DiagnosticOutboxState['lastOutcome'] }
  } catch { return undefined }
}

/** Serialize only an already-safe finite state, checking actual UTF-8 bytes. */
export function encodeOutbox(state: DiagnosticOutboxState): string {
  const raw = JSON.stringify(state)
  utf8ByteLength(raw, DIAGNOSTIC_OUTBOX_MAX_BYTES)
  return raw
}
