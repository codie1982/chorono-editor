import { validateDiagnosticReport } from '@/lib/diagnostics/conversion/validateDiagnosticReport'
import type { DiagnosticReport } from '@/lib/diagnostics'
import { FileStateStore } from './FileStateStore'
import { diagnosticGroupKey, diagnosticPayloadFingerprint, MAX_DEPOT_GROUPS, MAX_DEPOT_RECEIPTS } from './depotCodec'
import { DiagnosticRepositoryError, type DiagnosticAcceptance, type DiagnosticDepotState, type DiagnosticRepository } from './types'

const DAY = 86_400_000

/** Durable, idempotent code-only error depot. Receipt UUID+hash retention is
 * seven days; first sample is removed after seven days and day aggregates after
 * ninety days. Capacity fails closed rather than dropping live dedup receipts.
 * FileStateStore owns locking/atomic IO. This class owns only validation,
 * aggregation and retention policy; the injected clock is server epoch ms.
 */
export class FileDiagnosticRepository implements DiagnosticRepository {
  private readonly file: FileStateStore

  constructor(directory: string, private readonly clock: () => number = Date.now) {
    this.file = new FileStateStore(directory)
  }

  /** Validate again before durable mutation. Same ID+same canonical payload is
   * ACKed without increasing counts; ID reuse for another delta is a conflict.
   * One promise resolves only after atomic persistence. No raw input retained. */
  async accept(input: DiagnosticReport): Promise<DiagnosticAcceptance> {
    const report = validateDiagnosticReport(input)
    if (!report) throw new DiagnosticRepositoryError('depot-unavailable')
    const now = this.now(), fingerprint = diagnosticPayloadFingerprint(report)
    return this.file.transact<DiagnosticAcceptance>(previous => {
      const state = this.prune(previous, now), receipt = state.receipts.find(r => r.reportId === report.reportId)
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) throw new DiagnosticRepositoryError('report-conflict')
        return { state, value: { accepted: true, reportId: report.reportId, duplicate: true } as const }
      }
      if (state.receipts.length >= MAX_DEPOT_RECEIPTS) throw new DiagnosticRepositoryError('depot-capacity')
      const { schemaVersion: _schema, reportId: _id, sample, ...summary } = report
      const key = diagnosticGroupKey(summary), existing = state.groups.find(g => g.key === key)
      if (!existing && state.groups.length >= MAX_DEPOT_GROUPS) throw new DiagnosticRepositoryError('depot-capacity')
      const group = existing ? { ...existing, summary: { ...existing.summary,
        occurrenceCount: Math.min(Number.MAX_SAFE_INTEGER, existing.summary.occurrenceCount + summary.occurrenceCount) } }
        : { key, summary, example: sample, exampleExpiresAtMs: now + 7 * DAY, expiresAtMs: now + 90 * DAY }
      return { state: { schemaVersion: 1,
        receipts: [...state.receipts, { reportId: report.reportId, fingerprint, expiresAtMs: now + 7 * DAY }],
        groups: [...state.groups.filter(g => g.key !== key), group] },
      value: { accepted: true, reportId: report.reportId, duplicate: false } as const }
    })
  }

  /** Private administrative/test read also enforces retention and persists
   * removals. No public GET endpoint exposes stored reports. */
  inspect(): Promise<DiagnosticDepotState> {
    const now = this.now()
    return this.file.transact(previous => {
      const state = this.prune(previous, now)
      return { state, value: JSON.parse(JSON.stringify(state)) as DiagnosticDepotState }
    })
  }

  /** TTL pruning is performed on each accepted operation/inspection; no idle
   * process timer survives shutdown. Deployments may schedule inspect as a job. */
  private prune(state: DiagnosticDepotState, now: number): DiagnosticDepotState {
    return { schemaVersion: 1, receipts: state.receipts.filter(r => r.expiresAtMs > now),
      groups: state.groups.filter(g => g.expiresAtMs > now).map(g => g.example && g.exampleExpiresAtMs <= now ? { ...g, example: null } : g) }
  }

  /** Reject invalid/overflowing server clocks rather than writing invalid TTL. */
  private now(): number {
    const now = this.clock()
    if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000 - 90 * DAY) throw new DiagnosticRepositoryError('depot-unavailable')
    return now
  }
}
