'use client'
import { useEffect, useState, type FormEvent } from 'react'
import type { DiagnosticIssueStatus, ResolvedDiagnosticIssueQuery } from '@/lib/diagnostics/management'
import type { DiagnosticManagementSnapshot } from './DiagnosticManagementController'
import { DiagnosticIssueTable } from './DiagnosticIssueTable'
import { diagnosticIssueTime, ISSUE_STATUS_LABELS } from './managementLabels'
import styles from './DiagnosticManagement.module.css'

interface Props {
  snapshot: DiagnosticManagementSnapshot
  onConnect(token: string): void
  onDisconnect(): void
  onRefresh(): void
  onQuery(query: Partial<ResolvedDiagnosticIssueQuery>): void
  onStatus(key: string, status: DiagnosticIssueStatus): void
}

/** Presentational administrative surface. Token input is component memory only,
 * accepts paste/password managers and is cleared on submit. The form has no
 * named credential field and uses POST as a no-JS fallback, preventing URL leaks.
 * Nothing is requested until the explicit Connect action. */
export function DiagnosticManagementView({ snapshot, onConnect, onDisconnect, onRefresh, onQuery, onStatus }: Props) {
  const [token, setToken] = useState(''), [showToken, setShowToken] = useState(false)
  const [version, setVersion] = useState(snapshot.query.appVersion ?? '')
  useEffect(() => setVersion(snapshot.query.appVersion ?? ''), [snapshot.query.appVersion])
  /** Submit only a deliberate in-memory login; clear the password field immediately. */
  function connect(event: FormEvent) { event.preventDefault(); const credential = token; setToken(''); setShowToken(false); onConnect(credential) }
  /** Apply the version draft as a finite query, rather than fetching each keystroke. */
  function filterVersion(event: FormEvent) { event.preventDefault(); onQuery({ appVersion: version || undefined, offset: 0 }) }
  const { page, query } = snapshot
  const total = page ? page.counts.new + page.counts.investigating + page.counts.fixed : 0
  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.header}>
        <div><a className={styles.back} href="/">Chorono editor</a><p className={styles.eyebrow}>Diagnostics</p>
          <h1>Error management</h1><p className={styles.lead}>Repeated errors, one row. Review and track each issue.</p></div>
        {snapshot.connected && <button type="button" className={styles.button} onClick={onDisconnect}>Disconnect</button>}
      </header>
      {!snapshot.connected ? <section className={styles.login} aria-labelledby="management-connect-title">
        <h2 id="management-connect-title">Connect to the receiver</h2>
        <p>Use the receiver's admin token. It stays in memory for this page and is cleared when you disconnect.</p>
        <form method="post" action="/diagnostics" onSubmit={connect}>
          <label htmlFor="diagnostics-admin-token">Admin token</label>
          <div className={styles.tokenRow}><input id="diagnostics-admin-token" type={showToken ? 'text' : 'password'}
            autoComplete="current-password" autoCapitalize="off" spellCheck={false} value={token}
            onChange={event => setToken(event.target.value)} maxLength={256} aria-describedby="admin-token-help" required />
            <button type="button" className={styles.button} aria-pressed={showToken} onClick={() => setShowToken(value => !value)}>{showToken ? 'Hide token' : 'Show token'}</button></div>
          <p id="admin-token-help" className={styles.subtle}>Configured on the receiver with CHORONO_DIAGNOSTICS_ADMIN_TOKEN.</p>
          <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={token.length < 32}>Connect</button>
        </form>
      </section> : <>
        <div className={styles.filters}>
          <div role="group" aria-label="Filter issues by status" className={styles.statusFilters}>
            <button type="button" aria-pressed={query.status === 'all'} onClick={() => onQuery({ status: 'all', offset: 0 })}>All <span>{total}</span></button>
            {Object.entries(ISSUE_STATUS_LABELS).map(([status, label]) => <button type="button" key={status}
              aria-pressed={query.status === status} onClick={() => onQuery({ status: status as DiagnosticIssueStatus, offset: 0 })}>
              {label} <span>{page?.counts[status as DiagnosticIssueStatus] ?? 0}</span></button>)}
          </div>
          <button type="button" className={styles.button} onClick={onRefresh} disabled={snapshot.loading}>{snapshot.loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
        <div className={styles.secondaryFilters}>
          <form onSubmit={filterVersion} className={styles.versionFilter}><label htmlFor="diagnostics-version">Version</label>
            <input id="diagnostics-version" placeholder="All versions" value={version} maxLength={96} onChange={event => setVersion(event.target.value)} />
            <button className={styles.button} type="submit">Apply</button></form>
          <label className={styles.sort}>Sort<select value={query.sort} onChange={event => onQuery({ sort: event.target.value as ResolvedDiagnosticIssueQuery['sort'], offset: 0 })}>
            <option value="recent">Most recent</option><option value="occurrences">Most frequent</option></select></label>
        </div>
        <p className={styles.caption}>One row per version, build and failure point. Counts are occurrences, not users. Times use your browser's timezone.{snapshot.lastLoadedAt !== null ? ` Updated ${diagnosticIssueTime(snapshot.lastLoadedAt)}.` : ''}</p>
        {snapshot.loading && !page && <div className={styles.empty} role="status">Loading issues…</div>}
        {!snapshot.loading && page?.items.length === 0 && <div className={styles.empty}><h2>No errors match these filters</h2><p>Try All or remove the version filter.</p></div>}
        {page && page.items.length > 0 && <DiagnosticIssueTable items={page.items} pendingKeys={snapshot.pendingKeys}
          errors={snapshot.rowErrors} loading={snapshot.loading} onStatus={onStatus} />}
        {page && <nav aria-label="Issue pages" className={styles.pagination}><span>{page.items.length ? `${page.offset + 1}–${page.offset + page.items.length}` : '0'} of {page.total} issues</span>
          <div><button type="button" className={styles.button} disabled={snapshot.loading || page.offset === 0} onClick={() => onQuery({ offset: Math.max(0, page.offset - page.limit) })}>Previous</button>
            <button type="button" className={styles.button} disabled={snapshot.loading || page.offset + page.limit >= page.total} onClick={() => onQuery({ offset: page.offset + page.limit })}>Next</button></div></nav>}
      </>}
      {snapshot.error && <p className={styles.error} role="alert">{snapshot.error}</p>}
      <p className={styles.message} role="status">{snapshot.message}</p>
    </div>
  </main>
}
