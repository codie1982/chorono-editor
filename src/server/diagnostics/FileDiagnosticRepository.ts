import { validateDiagnosticReport } from '@/lib/diagnostics/conversion/validateDiagnosticReport'
import type { DiagnosticReport } from '@/lib/diagnostics'
import type { DiagnosticIssue, DiagnosticIssuePage, DiagnosticIssueQuery, DiagnosticIssueRepository,
  DiagnosticIssueStatus } from '@/lib/diagnostics/management'
import { FileStateStore } from './FileStateStore'
import { diagnosticGroupKey, diagnosticPayloadFingerprint, MAX_DEPOT_GROUPS, MAX_DEPOT_RECEIPTS } from './depotCodec'
import { DiagnosticRepositoryError, type DiagnosticAcceptance, type DiagnosticDepotState, type DiagnosticRepository } from './types'
import { diagnosticIssueKey, projectDiagnosticIssues, queryDiagnosticIssues } from './issueProjection'

const DAY = 86_400_000

/** Durable, idempotent code-only error depot. Receipt UUID+hash retention is
 * seven days; first sample is removed after seven days and day aggregates after
 * ninety days. Capacity fails closed rather than dropping live dedup receipts.
 * FileStateStore owns locking/atomic IO. This class owns validation, occurrence
 * aggregation, durable manual triage and retention; issue projection owns the
 * day-independent list/query rules. The injected clock is server epoch ms.
 */
export class FileDiagnosticRepository implements DiagnosticRepository, DiagnosticIssueRepository {
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
      const group = existing ? { ...existing, lastSeenAtMs: Math.max(existing.lastSeenAtMs, now), summary: { ...existing.summary,
        occurrenceCount: Math.min(Number.MAX_SAFE_INTEGER, existing.summary.occurrenceCount + summary.occurrenceCount) } }
        : { key, summary, example: sample, exampleExpiresAtMs: now + 7 * DAY, expiresAtMs: now + 90 * DAY,
          firstSeenAtMs: now, lastSeenAtMs: now }
      return { state: { ...state,
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

  /** Read a finite aggregated issue page across retained UTC days. Triage and
   * counts share the same file transaction, preventing mixed snapshots during
   * status/ingress races. Query data is validated by the projection owner. */
  listIssues(query: DiagnosticIssueQuery = {}): Promise<DiagnosticIssuePage> {
    const now = this.now()
    return this.file.transact(previous => {
      const state = this.prune(previous, now)
      return { state, value: queryDiagnosticIssues(state, query) }
    })
  }

  /** Persist one reversible triage decision atomically. Expected revision is
   * required even when selecting the same status; no-op at the current revision
   * keeps it unchanged. Ingested counts never reset a chosen status. Unknown
   * issue, stale revision and invalid inputs have distinct safe categories. */
  setIssueStatus(key: string, status: DiagnosticIssueStatus, expectedRevision: number): Promise<DiagnosticIssue> {
    if (typeof key !== 'string' || key.length !== 64 || !/^[a-f0-9]{64}$/.test(key) || !['new', 'investigating', 'fixed'].includes(status) ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new DiagnosticRepositoryError('invalid-issue-query')
    const now = this.now()
    return this.file.transact(previous => {
      const state = this.prune(previous, now), issue = projectDiagnosticIssues(state).find(value => value.key === key)
      if (!issue) throw new DiagnosticRepositoryError('issue-not-found')
      if (issue.revision !== expectedRevision) throw new DiagnosticRepositoryError('issue-conflict')
      if (issue.status === status) return { state, value: issue }
      if (issue.revision >= Number.MAX_SAFE_INTEGER) throw new DiagnosticRepositoryError('depot-capacity')
      const record = { key, status, revision: issue.revision + 1, updatedAtMs: Math.max(now, issue.updatedAtMs ?? 0) }
      const next = { ...state, triage: [...state.triage.filter(value => value.key !== key), record] }
      return { state: next, value: Object.freeze({ ...issue, ...record }) }
    })
  }

  /** TTL pruning is performed on each accepted operation/inspection; no idle
   * process timer survives shutdown. Deployments may schedule inspect as a job. */
  private prune(state: DiagnosticDepotState, now: number): DiagnosticDepotState {
    const groups = state.groups.filter(g => g.expiresAtMs > now).map(g => g.example && g.exampleExpiresAtMs <= now ? { ...g, example: null } : g)
    const keys = new Set(groups.map(group => diagnosticIssueKey(group.summary)))
    return { schemaVersion: 2, receipts: state.receipts.filter(r => r.expiresAtMs > now), groups,
      triage: state.triage.filter(value => keys.has(value.key)) }
  }

  /** Reject invalid/overflowing server clocks rather than writing invalid TTL. */
  private now(): number {
    const now = this.clock()
    if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000 - 90 * DAY) throw new DiagnosticRepositoryError('depot-unavailable')
    return now
  }
}
