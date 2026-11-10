import type { DiagnosticReport, DiagnosticSample, DiagnosticSummary } from '@/lib/diagnostics'
import type { DiagnosticIssueStatus } from '@/lib/diagnostics/management'

export interface DiagnosticReceipt {
  readonly reportId: string
  readonly fingerprint: string
  readonly expiresAtMs: number
}
/** Durable manual triage, separate from per-day counts and expiring examples. */
export interface DiagnosticTriageRecord {
  readonly key: string
  readonly status: DiagnosticIssueStatus
  readonly revision: number
  readonly updatedAtMs: number
}
export interface StoredDiagnosticGroup {
  readonly key: string
  readonly summary: Omit<DiagnosticSummary, 'sample'>
  readonly example: DiagnosticSample | null
  readonly exampleExpiresAtMs: number
  readonly expiresAtMs: number
  readonly firstSeenAtMs: number
  readonly lastSeenAtMs: number
}
/** Private v2 disk schema. V1 is converted by depotCodec on read; the public
 * DiagnosticReport wire schema remains1. Manual triage outlives samples but is
 * removed when its last retained daily group expires. No account data is added. */
export interface DiagnosticDepotState {
  readonly schemaVersion: 2
  readonly receipts: readonly DiagnosticReceipt[]
  readonly groups: readonly StoredDiagnosticGroup[]
  readonly triage: readonly DiagnosticTriageRecord[]
}
export interface DiagnosticAcceptance { readonly accepted: true; readonly reportId: string; readonly duplicate: boolean }
/** A repository atomically deduplicates and counts one validated report. */
export interface DiagnosticRepository {
  accept(report: DiagnosticReport): Promise<DiagnosticAcceptance>
}

/** Public-safe failure category. HTTP responses never include IO errors/paths. */
export class DiagnosticRepositoryError extends Error {
  constructor(readonly code: 'report-conflict' | 'depot-busy' | 'depot-capacity' | 'depot-unavailable' |
    'issue-conflict' | 'issue-not-found' | 'invalid-issue-query') {
    super(code); this.name = 'DiagnosticRepositoryError'
  }
}
