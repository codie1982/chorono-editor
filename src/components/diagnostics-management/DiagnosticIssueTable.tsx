import type { DiagnosticIssue, DiagnosticIssueStatus } from '@/lib/diagnostics/management'
import { diagnosticIssueTime, diagnosticIssueTitle, ISSUE_STATUS_LABELS } from './managementLabels'
import styles from './DiagnosticManagement.module.css'

interface Props {
  items: readonly DiagnosticIssue[]
  pendingKeys: readonly string[]
  errors: Readonly<Record<string, string>>
  loading: boolean
  onStatus(key: string, status: DiagnosticIssueStatus): void
}

/** Semantic finite issue table. Each aggregate has exactly one row and one
 * reversible status control. Static codes/details are progressive disclosure;
 * occurrence counts never imply unique users. No interaction mutates a scene. */
export function DiagnosticIssueTable({ items, pendingKeys, errors, loading, onStatus }: Props) {
  return <div className={styles.tableScroll} role="region" aria-label="Error issues" tabIndex={0}>
    <table className={styles.table} aria-busy={loading}>
      <caption className={styles.srOnly}>Grouped error summaries with occurrence counts and triage status</caption>
      <thead><tr><th scope="col">Error</th><th scope="col">Version</th><th scope="col">Occurrences</th><th scope="col">Last seen</th><th scope="col">Status</th></tr></thead>
      <tbody>{items.map(issue => {
        const title = diagnosticIssueTitle(issue), pending = pendingKeys.includes(issue.key)
        return <tr key={issue.key} data-issue-key={issue.key}>
          <td>
            <div className={styles.issueHeading}><strong>{title}</strong>
              {issue.severity === 'fatal' && <span className={styles.fatal}>Fatal</span>}
              {issue.classification === 'unclassified' && <span className={styles.badge}>Unclassified</span>}
            </div>
            <span className={styles.subtle}>{issue.module} · {issue.errorCode}</span>
            <details className={styles.details}><summary>Details</summary>
              <dl><div><dt>Failure point</dt><dd><code>{issue.failureSite}</code></dd></div>
                <div><dt>First seen</dt><dd><time dateTime={new Date(issue.firstSeenAtMs).toISOString()}>{diagnosticIssueTime(issue.firstSeenAtMs)}</time></dd></div>
                <div><dt>Build</dt><dd><code>{issue.buildId}</code> · {issue.channel}</dd></div>
                <div><dt>Example</dt><dd>{issue.example ? `${issue.example.operation} · ${issue.example.outcome}` : 'Expired'}</dd></div>
              </dl>
              {issue.classification === 'unclassified' && <p>These occurrences are an unclassified category, not one confirmed root cause.</p>}
            </details>
          </td>
          <td><span className={styles.version}>{issue.appVersion}</span><span className={styles.subtle}><code>{issue.buildId}</code></span></td>
          <td><strong className={styles.count}>{issue.occurrenceCount.toLocaleString('en')}</strong></td>
          <td><time className={styles.nowrap} dateTime={new Date(issue.lastSeenAtMs).toISOString()} title={new Date(issue.lastSeenAtMs).toISOString()}>{diagnosticIssueTime(issue.lastSeenAtMs)}</time></td>
          <td className={styles.statusCell}>
            <select aria-label={`Status for ${title} (${issue.appVersion}, ${issue.failureSite})`}
              value={issue.status} disabled={pending || loading} onChange={event => onStatus(issue.key, event.target.value as DiagnosticIssueStatus)}>
              {Object.entries(ISSUE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {pending && <span className={styles.subtle} role="status">Saving…</span>}
            {errors[issue.key] && <p className={styles.rowError} role="alert">{errors[issue.key]}</p>}
          </td>
        </tr>
      })}</tbody>
    </table>
  </div>
}
