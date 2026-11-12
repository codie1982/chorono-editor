import { convertDiagnosticFailure } from '@/lib/diagnostics'
import type { DiagnosticIssue, DiagnosticIssueStatus } from '@/lib/diagnostics/management'

export const ISSUE_STATUS_LABELS: Readonly<Record<DiagnosticIssueStatus, string>> = Object.freeze({
  new: 'New', investigating: 'Investigating', fixed: 'Fixed',
})

/** A readable label is derived only from the static failure catalogue; raw
 * messages are neither present nor needed. Unknown buckets stay identifiable. */
export function diagnosticIssueTitle(issue: DiagnosticIssue): string {
  const sample = convertDiagnosticFailure({ failureSite: issue.failureSite })?.sample
  const operation = sample?.operation.replaceAll('-', ' ') ?? 'application'
  if (issue.errorCode === 'EDIT_COMMIT_FAILED') return capitalize(operation) + ' commit failed'
  if (issue.errorCode === 'EDIT_PREVIEW_FAILED') return capitalize(operation) + ' preview failed'
  if (issue.errorCode === 'UNEXPECTED_ROLLBACK') return capitalize(operation) + ' rolled back unexpectedly'
  if (issue.errorCode === 'RENDER_FAILED') return 'Application render failed'
  if (issue.errorCode === 'UNHANDLED_REJECTION') return 'Unhandled application rejection'
  return 'Unhandled application error'
}

/** Fixed English presentation casing; no authored text is transformed. */
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1) }

/** Format receipt time in the viewer's timezone; ISO remains available in a
 * time element tooltip. Data is validated before this presentation helper. */
export function diagnosticIssueTime(value: number): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(value)
}
