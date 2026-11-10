import type { DiagnosticReport, DiagnosticSample, DiagnosticSummary } from '@/lib/diagnostics'

export interface DiagnosticReceipt {
  readonly reportId: string
  readonly fingerprint: string
  readonly expiresAtMs: number
}
export interface StoredDiagnosticGroup {
  readonly key: string
  readonly summary: Omit<DiagnosticSummary, 'sample'>
  readonly example: DiagnosticSample | null
  readonly exampleExpiresAtMs: number
  readonly expiresAtMs: number
}
/** Private on-disk schema. Receipts contain only random report IDs and payload
 * digests; examples and daily aggregate retention are independent. */
export interface DiagnosticDepotState {
  readonly schemaVersion: 1
  readonly receipts: readonly DiagnosticReceipt[]
  readonly groups: readonly StoredDiagnosticGroup[]
}
export interface DiagnosticAcceptance { readonly accepted: true; readonly reportId: string; readonly duplicate: boolean }
/** A repository atomically deduplicates and counts one validated report. */
export interface DiagnosticRepository {
  accept(report: DiagnosticReport): Promise<DiagnosticAcceptance>
}

/** Public-safe failure category. HTTP responses never include IO errors/paths. */
export class DiagnosticRepositoryError extends Error {
  constructor(readonly code: 'report-conflict' | 'depot-busy' | 'depot-capacity' | 'depot-unavailable') {
    super(code); this.name = 'DiagnosticRepositoryError'
  }
}
