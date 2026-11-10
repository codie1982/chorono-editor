import { createHash } from 'node:crypto'
import { measureJson } from '@/lib/format/json'
import { convertDiagnosticFailure } from '@/lib/diagnostics'
import { validateDiagnosticReport } from '@/lib/diagnostics/conversion/validateDiagnosticReport'
import type { DiagnosticDepotState, DiagnosticTriageRecord, StoredDiagnosticGroup } from './types'
import { DiagnosticRepositoryError } from './types'
import { diagnosticIssueKey } from './issueProjection'

export const MAX_DEPOT_BYTES = 16 * 1024 * 1024
export const MAX_DEPOT_RECEIPTS = 10_000
export const MAX_DEPOT_GROUPS = 10_000
export const MAX_DEPOT_ISSUES = MAX_DEPOT_GROUPS
const DAY = 86_400_000
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

/** Decode private state fail-closed into v2. V1 receipts/counts are preserved;
 * manual triage starts empty and legacy receipt-time limitations are explicit
 * below. Every subsequent transaction writes v2, so old v1-only writers reject
 * rather than silently erase triage. Wire DiagnosticReport remains version1.
 * Own files are bounded before parse by FileStateStore; this second layer
 * validates code-only data, finite TTLs and unique identities. */
export function decodeDiagnosticDepot(raw: string): DiagnosticDepotState {
  try {
    const state = JSON.parse(raw)
    if (!state || ![1, 2].includes(state.schemaVersion) || !Array.isArray(state.receipts) || !Array.isArray(state.groups)
      || state.receipts.length > MAX_DEPOT_RECEIPTS || state.groups.length > MAX_DEPOT_GROUPS) throw new Error()
    const legacy = state.schemaVersion === 1
    if (!exactKeys(state, legacy ? ['schemaVersion', 'receipts', 'groups'] : ['schemaVersion', 'receipts', 'groups', 'triage']) ||
      (!legacy && (!Array.isArray(state.triage) || state.triage.length > MAX_DEPOT_ISSUES))) throw new Error()
    const receipts = state.receipts.map((r: Record<string, unknown>) => {
      if (!r || !exactKeys(r, ['reportId', 'fingerprint', 'expiresAtMs']) || typeof r.reportId !== 'string' || !/^[a-f0-9-]{36}$/.test(r.reportId)
        || typeof r.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(r.fingerprint)
        || !validTime(r.expiresAtMs)) throw new Error()
      return { reportId: r.reportId, fingerprint: r.fingerprint, expiresAtMs: r.expiresAtMs }
    })
    const groups = state.groups.map((r: StoredDiagnosticGroup) => {
      if (!r || !exactKeys(r, ['key', 'summary', 'example', 'exampleExpiresAtMs', 'expiresAtMs',
        ...(legacy ? [] : ['firstSeenAtMs', 'lastSeenAtMs'])]) || !r.summary ||
        !Number.isSafeInteger(r.summary.occurrenceCount) || r.summary.occurrenceCount < 1
        || !validTime(r.expiresAtMs) || !validTime(r.exampleExpiresAtMs)) throw new Error()
      const sample = convertDiagnosticFailure({ failureSite: r.summary.failureSite })?.sample
      const canonical = validateDiagnosticReport({ ...r.summary, sample, occurrenceCount: 1, reportId: fixtureId, schemaVersion: 1 })
      if (!canonical || r.key !== diagnosticGroupKey(r.summary) || (r.example !== null &&
        (r.example.operation !== sample?.operation || r.example.outcome !== sample?.outcome || Object.keys(r.example).length !== 2))) throw new Error()
      const { schemaVersion: _schema, reportId: _id, sample: _sample, ...summary } = canonical
      // V1 retained expiry = first receipt +90days, but had no last receipt.
      // Migration conservatively uses that creation time for both timestamps;
      // subsequent fresh reports provide real lastSeen time. No guess from IDs.
      const firstSeenAtMs = legacy ? Math.max(0, r.expiresAtMs - 90 * DAY) : r.firstSeenAtMs
      const lastSeenAtMs = legacy ? firstSeenAtMs : r.lastSeenAtMs
      if (!validTime(firstSeenAtMs) || !validTime(lastSeenAtMs) || lastSeenAtMs < firstSeenAtMs) throw new Error()
      return { key: r.key, summary: { ...summary, occurrenceCount: r.summary.occurrenceCount }, example: r.example === null ? null : sample!,
        exampleExpiresAtMs: r.exampleExpiresAtMs, expiresAtMs: r.expiresAtMs, firstSeenAtMs, lastSeenAtMs }
    })
    const issueKeys = new Set(groups.map((g: StoredDiagnosticGroup) => diagnosticIssueKey(g.summary)))
    const triage: DiagnosticTriageRecord[] = legacy ? [] : state.triage.map((value: DiagnosticTriageRecord) => {
      if (!value || !exactKeys(value, ['key', 'status', 'revision', 'updatedAtMs']) ||
        typeof value.key !== 'string' || !/^[a-f0-9]{64}$/.test(value.key) || !issueKeys.has(value.key) ||
        !['new', 'investigating', 'fixed'].includes(value.status) || !Number.isSafeInteger(value.revision) ||
        value.revision < 1 || !validTime(value.updatedAtMs)) throw new Error()
      return { key: value.key, status: value.status, revision: value.revision, updatedAtMs: value.updatedAtMs }
    })
    if (new Set(receipts.map((r: { reportId: string }) => r.reportId)).size !== receipts.length ||
      new Set(groups.map((g: StoredDiagnosticGroup) => g.key)).size !== groups.length ||
      new Set(triage.map(value => value.key)).size !== triage.length) throw new Error()
    return { schemaVersion: 2, receipts, groups, triage }
  } catch { throw new DiagnosticRepositoryError('depot-unavailable') }
}

/** Use existing JSON preflight before materializing a finite replacement file. */
export function encodeDiagnosticDepot(state: DiagnosticDepotState): string {
  if (state.receipts.length > MAX_DEPOT_RECEIPTS || state.groups.length > MAX_DEPOT_GROUPS || state.triage.length > MAX_DEPOT_ISSUES) throw new DiagnosticRepositoryError('depot-capacity')
  try { measureJson(state, { maxBytes: MAX_DEPOT_BYTES, maxChars: MAX_DEPOT_BYTES, maxNodes: 500_000 }); return JSON.stringify(state) }
  catch { throw new DiagnosticRepositoryError('depot-capacity') }
}

/** Server receipt/expiry clocks are epoch milliseconds, never client identity. */
function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000
}

/** Private state has exact keys so unknown content cannot silently persist. */
function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}
