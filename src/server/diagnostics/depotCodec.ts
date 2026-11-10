import { createHash } from 'node:crypto'
import { measureJson } from '@/lib/format/json'
import { convertDiagnosticFailure } from '@/lib/diagnostics'
import { validateDiagnosticReport } from '@/lib/diagnostics/conversion/validateDiagnosticReport'
import type { DiagnosticDepotState, StoredDiagnosticGroup } from './types'
import { DiagnosticRepositoryError } from './types'

export const MAX_DEPOT_BYTES = 16 * 1024 * 1024
export const MAX_DEPOT_RECEIPTS = 10_000
export const MAX_DEPOT_GROUPS = 10_000
const fixtureId = '00000000-0000-4000-8000-000000000000'

/** Stable identity is derived only from already allowlisted build/site/day
 * fields, never message/stack/authored content or network identity. */
export function diagnosticGroupKey(summary: StoredDiagnosticGroup['summary']): string {
  return createHash('sha256').update(JSON.stringify([summary.appVersion, summary.buildId, summary.channel,
    summary.errorCode, summary.module, summary.failureSite, summary.day])).digest('hex')
}

/** Canonical report hashing makes object key order irrelevant to idempotency. */
export function diagnosticPayloadFingerprint(report: unknown): string {
  return createHash('sha256').update(JSON.stringify(report)).digest('hex')
}

/** Decode private file state fail-closed. Corruption cannot reset duplicate
 * receipts/counts silently. Own files are bounded before parse by FileStateStore;
 * this second layer validates code-only data, finite TTLs and unique identities. */
export function decodeDiagnosticDepot(raw: string): DiagnosticDepotState {
  try {
    const state = JSON.parse(raw)
    if (!state || state.schemaVersion !== 1 || !Array.isArray(state.receipts) || !Array.isArray(state.groups)
      || state.receipts.length > MAX_DEPOT_RECEIPTS || state.groups.length > MAX_DEPOT_GROUPS) throw new Error()
    const receipts = state.receipts.map((r: Record<string, unknown>) => {
      if (!r || typeof r.reportId !== 'string' || !/^[a-f0-9-]{36}$/.test(r.reportId)
        || typeof r.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(r.fingerprint)
        || !validTime(r.expiresAtMs)) throw new Error()
      return { reportId: r.reportId, fingerprint: r.fingerprint, expiresAtMs: r.expiresAtMs }
    })
    const groups = state.groups.map((r: StoredDiagnosticGroup) => {
      if (!r || !r.summary || !Number.isSafeInteger(r.summary.occurrenceCount) || r.summary.occurrenceCount < 1
        || !validTime(r.expiresAtMs) || !validTime(r.exampleExpiresAtMs)) throw new Error()
      const sample = convertDiagnosticFailure({ failureSite: r.summary.failureSite })?.sample
      const canonical = validateDiagnosticReport({ ...r.summary, sample, occurrenceCount: 1, reportId: fixtureId, schemaVersion: 1 })
      if (!canonical || r.key !== diagnosticGroupKey(r.summary) || (r.example !== null &&
        (r.example.operation !== sample?.operation || r.example.outcome !== sample?.outcome || Object.keys(r.example).length !== 2))) throw new Error()
      const { schemaVersion: _schema, reportId: _id, sample: _sample, ...summary } = canonical
      return { key: r.key, summary: { ...summary, occurrenceCount: r.summary.occurrenceCount }, example: r.example === null ? null : sample!,
        exampleExpiresAtMs: r.exampleExpiresAtMs, expiresAtMs: r.expiresAtMs }
    })
    if (new Set(receipts.map((r: { reportId: string }) => r.reportId)).size !== receipts.length ||
      new Set(groups.map((g: StoredDiagnosticGroup) => g.key)).size !== groups.length) throw new Error()
    return { schemaVersion: 1, receipts, groups }
  } catch { throw new DiagnosticRepositoryError('depot-unavailable') }
}

/** Use existing JSON preflight before materializing a finite replacement file. */
export function encodeDiagnosticDepot(state: DiagnosticDepotState): string {
  if (state.receipts.length > MAX_DEPOT_RECEIPTS || state.groups.length > MAX_DEPOT_GROUPS) throw new DiagnosticRepositoryError('depot-capacity')
  try { measureJson(state, { maxBytes: MAX_DEPOT_BYTES, maxChars: MAX_DEPOT_BYTES, maxNodes: 500_000 }); return JSON.stringify(state) }
  catch { throw new DiagnosticRepositoryError('depot-capacity') }
}

/** Server receipt/expiry clocks are epoch milliseconds, never client identity. */
function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000
}
