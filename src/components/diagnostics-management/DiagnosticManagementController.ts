import { createBuildInfo } from '@/lib/version'
import type { DiagnosticIssue, DiagnosticIssuePage, DiagnosticIssueQuery, DiagnosticIssueStatus,
  ResolvedDiagnosticIssueQuery } from '@/lib/diagnostics/management'
import { DiagnosticManagementError } from './DiagnosticManagementApi'

interface Client {
  list(token: string, query: DiagnosticIssueQuery, signal: AbortSignal): Promise<DiagnosticIssuePage>
  update(token: string, key: string, status: DiagnosticIssueStatus, revision: number, signal: AbortSignal): Promise<DiagnosticIssue>
}
export interface DiagnosticManagementSnapshot {
  readonly connected: boolean
  readonly loading: boolean
  readonly page: DiagnosticIssuePage | null
  readonly query: ResolvedDiagnosticIssueQuery
  readonly pendingKeys: readonly string[]
  readonly rowErrors: Readonly<Record<string, string>>
  readonly error: string
  readonly message: string
  readonly lastLoadedAt: number | null
}
const DEFAULT_QUERY: ResolvedDiagnosticIssueQuery = Object.freeze({ status: 'all', sort: 'recent', offset: 0, limit: 50 })
const EMPTY: DiagnosticManagementSnapshot = Object.freeze({ connected: false, loading: false, page: null,
  query: DEFAULT_QUERY, pendingKeys: Object.freeze([]), rowErrors: Object.freeze({}), error: '', message: '', lastLoadedAt: null })

/** Small in-memory administrative session owner. The credential never appears
 * in a snapshot, URL, storage or observer message. Every query/edit is pinned
 * to the active login generation; logout cancels all requests and clears data.
 * A separate query generation rejects late filter responses. There is no poll
 * timer. Each row permits one reversible CAS status edit; failures preserve the
 * previous server value. Constructor and snapshot reads perform no network IO.
 */
export class DiagnosticManagementController {
  private token = ''
  private generation = 0
  private queryGeneration = 0
  private queryController?: AbortController
  private readonly edits = new Map<string, AbortController>()
  private readonly listeners = new Set<() => void>()
  private snapshot = EMPTY

  /** Borrow the narrow HTTP client and epoch-millisecond UI refresh clock. */
  constructor(private readonly client: Client, private readonly clock: () => number = Date.now) {}
  /** Stable immutable external-store view, suitable for useSyncExternalStore. */
  readonly getSnapshot = (): DiagnosticManagementSnapshot => this.snapshot
  /** Subscribe to actual state transitions; unsubscription is idempotent. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener); return () => { this.listeners.delete(listener) }
  }

  /** Accept an explicit token for this mounted session only, then load a page.
   * Invalid tokens never reach HTTP. Reconnecting cancels the previous login. */
  async connect(token: string): Promise<void> {
    this.disconnect()
    if (token.length < 32 || token.length > 256 || /[^\x21-\x7e]/.test(token)) {
      this.publish({ ...EMPTY, error: 'Enter a valid admin token (32–256 characters).' }); return
    }
    this.token = token
    this.publish({ ...EMPTY, connected: true })
    await this.refresh()
  }

  /** Cancel IO synchronously and forget the credential plus all visible rows.
   * Reused StrictMode lifetimes may connect again; no persistent session exists. */
  disconnect(message = ''): void {
    this.generation++; this.queryGeneration++; this.token = ''
    this.queryController?.abort(); this.queryController = undefined
    for (const edit of Array.from(this.edits.values())) edit.abort()
    this.edits.clear(); this.publish({ ...EMPTY, message })
  }

  /** Apply validated controls and reset pagination. Invalid version text stays
   * visible as a fixed UI error without sending an invalid request. */
  async setQuery(patch: Partial<ResolvedDiagnosticIssueQuery>): Promise<void> {
    const next = { ...this.snapshot.query, ...patch }
    try {
      if (next.appVersion) createBuildInfo(next.appVersion)
      if (!['all', 'new', 'investigating', 'fixed'].includes(next.status) || !['recent', 'occurrences'].includes(next.sort) ||
        !Number.isSafeInteger(next.offset) || next.offset < 0 || next.offset > 10000 ||
        !Number.isSafeInteger(next.limit) || next.limit < 1 || next.limit > 100) throw Error()
    } catch { this.publish({ ...this.snapshot, error: 'Enter a valid application version.' }); return }
    this.publish({ ...this.snapshot, query: Object.freeze(next), page: null, error: '', message: '' })
    await this.refresh()
  }

  /** Replace only the current login/query's page. Old responses are discarded
   * even when a test/transport ignores abort. Existing rows survive refresh errors. */
  async refresh(): Promise<void> {
    if (!this.token) return
    const generation = this.generation, queryGeneration = ++this.queryGeneration, token = this.token
    this.queryController?.abort()
    const controller = new AbortController(); this.queryController = controller
    this.publish({ ...this.snapshot, loading: true, error: '' })
    try {
      const page = await this.client.list(token, this.snapshot.query, controller.signal)
      if (!this.current(generation) || queryGeneration !== this.queryGeneration || controller.signal.aborted) return
      this.publish({ ...this.snapshot, page, loading: false, lastLoadedAt: this.clock() })
    } catch (error) {
      if (!this.current(generation) || queryGeneration !== this.queryGeneration || controller.signal.aborted) return
      if (error instanceof DiagnosticManagementError && error.status === 401) { this.disconnect(''); this.publish({ ...EMPTY, error: 'The admin token was not accepted.' }); return }
      this.publish({ ...this.snapshot, loading: false, error: requestMessage(error, false) })
    } finally { if (this.queryController === controller) this.queryController = undefined }
  }

  /** Change one row using its last observed revision, never an optimistic enum.
   * A conflict refreshes the current query and asks the operator to review it.
   * Incoming occurrences are preserved by the server's atomic status contract. */
  async changeStatus(key: string, status: DiagnosticIssueStatus): Promise<void> {
    const issue = this.snapshot.page?.items.find(row => row.key === key)
    if (!this.token || !issue || this.edits.has(key) || status === issue.status || !['new', 'investigating', 'fixed'].includes(status)) return
    const generation = this.generation, token = this.token, controller = new AbortController()
    this.edits.set(key, controller)
    const errors = { ...this.snapshot.rowErrors }; delete errors[key]
    this.publish({ ...this.snapshot, pendingKeys: Object.freeze(Array.from(this.edits.keys())), rowErrors: Object.freeze(errors), message: '' })
    try {
      const updated = await this.client.update(token, key, status, issue.revision, controller.signal)
      if (!this.current(generation) || controller.signal.aborted) return
      this.replaceIssue(updated)
      await this.refresh()
      if (this.current(generation)) this.publish({ ...this.snapshot, message: 'Status updated.' })
    } catch (error) {
      if (!this.current(generation) || controller.signal.aborted) return
      if (error instanceof DiagnosticManagementError && error.status === 401) { this.disconnect(); this.publish({ ...EMPTY, error: 'The admin token was not accepted.' }); return }
      const conflict = error instanceof DiagnosticManagementError && error.status === 409
      if (conflict || error instanceof DiagnosticManagementError && error.status === 404) await this.refresh()
      if (this.current(generation)) this.publish({ ...this.snapshot,
        rowErrors: Object.freeze({ ...this.snapshot.rowErrors, [key]: requestMessage(error, true) }),
        message: conflict ? 'This issue changed in another session. The list has been refreshed.' : '' })
    } finally {
      if (this.edits.get(key) === controller) {
        this.edits.delete(key)
        if (this.current(generation)) this.publish({ ...this.snapshot, pendingKeys: Object.freeze(Array.from(this.edits.keys())) })
      }
    }
  }

  /** Show an ACKed row even if a subsequent list refresh fails. Filtering and
   * counts are corrected immediately; the next GET remains authoritative. */
  private replaceIssue(issue: DiagnosticIssue): void {
    const page = this.snapshot.page, old = page?.items.find(row => row.key === issue.key)
    if (!page || !old) return
    const visible = this.snapshot.query.status === 'all' || this.snapshot.query.status === issue.status
    const items = page.items.flatMap(row => row.key === issue.key ? visible ? [issue] : [] : [row])
    const counts = { ...page.counts }
    if (old.status !== issue.status) { counts[old.status] = Math.max(0, counts[old.status] - 1); counts[issue.status]++ }
    this.publish({ ...this.snapshot, page: Object.freeze({ ...page, items: Object.freeze(items),
      counts: Object.freeze(counts), total: page.total - (visible ? 0 : 1) }) })
  }
  /** Login generation, not a retained credential, authorizes publishing results. */
  private current(generation: number): boolean { return generation === this.generation && this.token !== '' }
  /** Optional view listeners cannot break cleanup or authenticated mutations. */
  private publish(next: DiagnosticManagementSnapshot): void {
    this.snapshot = Object.freeze(next)
    for (const listener of Array.from(this.listeners)) { try { listener() } catch { /* UI observer. */ } }
  }
}

/** Map only fixed HTTP categories. No server message, secret or stack is shown. */
function requestMessage(error: unknown, edit: boolean): string {
  const status = error instanceof DiagnosticManagementError ? error.status : 0
  if (status === 404) return edit ? 'This issue is no longer retained. The list was refreshed.' : 'Error management is not configured on this server.'
  if (status === 409) return 'Changed in another session. Review the refreshed status and try again.'
  if (status === 429) return 'Too many requests. Wait a moment and try again.'
  if (status === 403) return 'Use HTTPS and connect from the receiver’s own origin.'
  if (status === 400) return 'The request was not accepted. Review the filters and try again.'
  return edit ? 'The status could not be saved. The previous value is unchanged.' : 'The issue list could not be loaded. Try Refresh.'
}
