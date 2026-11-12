import styles from './DiagnosticSharing.module.css'

/** Shared progressive disclosure for both first-run and later settings consent.
 * The scopes, schedule and retention must remain identical across entry points. */
export function DiagnosticSharingDisclosure() {
  return <details className={styles.details}>
    <summary>Data and retention</summary>
    <p>Error summaries are sent at most once every five minutes. Update checks run at most daily.</p>
    <p>One cleaned example is kept for up to 7 days; daily totals for up to 90 days. Reports exclude names, project content, object IDs, coordinates, file paths and raw error messages.</p>
    <p>The receiving server can see your network IP during transfer. It is not part of the error report.</p>
  </details>
}
