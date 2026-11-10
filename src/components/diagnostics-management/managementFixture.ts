import type { DiagnosticIssue, DiagnosticIssuePage, DiagnosticIssueStatus } from '@/lib/diagnostics/management'

/** Code-only row shared by controller/wire/UI checks, never a real report.
 * This fixture is imported only by tests and is not a runtime data source. */
export function issueFixture(status: DiagnosticIssueStatus = 'new', revision = 0): DiagnosticIssue {
  return Object.freeze({ key: 'a'.repeat(64), appVersion: '0.2.0', buildId: 'local', channel: 'local',
    errorCode: 'EDIT_COMMIT_FAILED', module: 'viewport', failureSite: 'viewport.object-move.commit',
    classification: 'known', severity: 'error', occurrenceCount: 143,
    firstSeenAtMs: Date.UTC(2026, 10, 9, 8), lastSeenAtMs: Date.UTC(2026, 10, 10, 8),
    status, revision, updatedAtMs: revision ? Date.UTC(2026, 10, 10, 9) : null,
    example: Object.freeze({ operation: 'move', outcome: 'commit-failed' }) })
}

/** One issue with honest counters for its current manual status. */
export function pageFixture(issue = issueFixture()): DiagnosticIssuePage {
  return Object.freeze({ items: Object.freeze([issue]), total: 1, offset: 0, limit: 50,
    counts: Object.freeze({ new: issue.status === 'new' ? 1 : 0, investigating: issue.status === 'investigating' ? 1 : 0, fixed: issue.status === 'fixed' ? 1 : 0 }) })
}
