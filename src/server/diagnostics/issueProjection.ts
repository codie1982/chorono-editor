import { createHash } from 'node:crypto'
import { createBuildInfo } from '@/lib/version'
import type { DiagnosticIssue, DiagnosticIssuePage, DiagnosticIssueQuery, DiagnosticIssueStatus,
  ResolvedDiagnosticIssueQuery } from '@/lib/diagnostics/management'
import type { DiagnosticDepotState, StoredDiagnosticGroup } from './types'
import { DiagnosticRepositoryError } from './types'

/** Day-independent identity. Only already allowlisted release/code/static-site
 * fields participate; neither sample, timestamps nor manual status changes it. */
export function diagnosticIssueKey(summary: StoredDiagnosticGroup['summary']): string {
  return createHash('sha256').update(JSON.stringify([summary.appVersion, summary.buildId, summary.channel,
    summary.errorCode, summary.module, summary.failureSite])).digest('hex')
}

/** Reconstruct one immutable issue per release/site across retained daily
 * groups. Counts saturate at MAX_SAFE_INTEGER, first/last receipt timestamps
 * span the retained groups, and the first available code-only sample is kept.
 * Manual status is independent of incoming report counts; new is virtualrev0.
 * Source state is borrowed without mutation. O(groups+triage), bounded by depot.
 */
export function projectDiagnosticIssues(state: DiagnosticDepotState): readonly DiagnosticIssue[] {
  const statuses = new Map(state.triage.map(value => [value.key, value]))
  const issues = new Map<string, DiagnosticIssue>()
  for (const group of state.groups) {
    const key = diagnosticIssueKey(group.summary), previous = issues.get(key), status = statuses.get(key)
    const { day: _day, occurrenceCount, ...meaning } = group.summary
    if (!previous) issues.set(key, Object.freeze({ ...meaning, key, occurrenceCount,
      firstSeenAtMs: group.firstSeenAtMs, lastSeenAtMs: group.lastSeenAtMs,
      status: status?.status ?? 'new', revision: status?.revision ?? 0, updatedAtMs: status?.updatedAtMs ?? null,
      example: group.example ? Object.freeze({ ...group.example }) : null }))
    else issues.set(key, Object.freeze({ ...previous,
      occurrenceCount: Math.min(Number.MAX_SAFE_INTEGER, previous.occurrenceCount + occurrenceCount),
      firstSeenAtMs: Math.min(previous.firstSeenAtMs, group.firstSeenAtMs),
      lastSeenAtMs: Math.max(previous.lastSeenAtMs, group.lastSeenAtMs),
      example: previous.example ?? (group.example ? Object.freeze({ ...group.example }) : null) }))
  }
  return Object.freeze(Array.from(issues.values()))
}

/** Validate the shared query contract, rejecting unknown or malformed fields.
 * Pagination uses finite row counts; appVersion is exact SemVer, never a regex.
 * Default sorting is latest receipt descending with a stable key tie-breaker.
 */
export function validateDiagnosticIssueQuery(input: DiagnosticIssueQuery = {}): ResolvedDiagnosticIssueQuery {
  const prototype = input && typeof input === 'object' ? Object.getPrototypeOf(input) : undefined
  if ((prototype !== Object.prototype && prototype !== null) ||
    Object.keys(input).some(key => !['status', 'appVersion', 'sort', 'offset', 'limit'].includes(key))) invalid()
  const status = input.status ?? 'all', sort = input.sort ?? 'recent', offset = input.offset ?? 0, limit = input.limit ?? 50
  if (!['all', 'new', 'investigating', 'fixed'].includes(status) || !['recent', 'occurrences'].includes(sort) ||
    !Number.isSafeInteger(offset) || offset < 0 || offset > 10000 ||
    !Number.isSafeInteger(limit) || limit < 1 || limit > 100) invalid()
  if (input.appVersion !== undefined) {
    try { createBuildInfo(input.appVersion) } catch { invalid() }
  }
  return Object.freeze({ status, sort, offset, limit, ...(input.appVersion !== undefined ? { appVersion: input.appVersion } : {}) })
}

/** Produce a finite page. Header counts honor version filtering but not status;
 * total honors both. Source/group order never changes and returned data freezes. */
export function queryDiagnosticIssues(state: DiagnosticDepotState, input: DiagnosticIssueQuery = {}): DiagnosticIssuePage {
  const query = validateDiagnosticIssueQuery(input)
  const matchingVersion = projectDiagnosticIssues(state).filter(issue => query.appVersion === undefined || issue.appVersion === query.appVersion)
  const counts: Record<DiagnosticIssueStatus, number> = { new: 0, investigating: 0, fixed: 0 }
  matchingVersion.forEach(issue => { counts[issue.status]++ })
  const filtered = matchingVersion.filter(issue => query.status === 'all' || issue.status === query.status)
  filtered.sort((a, b) => (query.sort === 'occurrences' ? b.occurrenceCount - a.occurrenceCount : b.lastSeenAtMs - a.lastSeenAtMs) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return Object.freeze({ items: Object.freeze(filtered.slice(query.offset, query.offset + query.limit)),
    total: filtered.length, counts: Object.freeze(counts), offset: query.offset, limit: query.limit })
}

/** Invalid public domain input always yields the same non-sensitive category. */
function invalid(): never { throw new DiagnosticRepositoryError('invalid-issue-query') }
