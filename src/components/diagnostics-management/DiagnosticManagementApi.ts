import { BoundedBinaryReader } from '@/lib/resources/io'
import type { DiagnosticIssue, DiagnosticIssuePage, DiagnosticIssueQuery, DiagnosticIssueStatus } from '@/lib/diagnostics/management'
import { readManagementIssue, readManagementPage } from './managementResponse'

/** Fixed public categories only; raw server/body/token text is never exposed. */
export class DiagnosticManagementError extends Error {
  constructor(readonly status: number) { super('diagnostic-management-request-failed') }
}

/** Same-origin authenticated HTTP adapter. The token is borrowed for one call,
 * never stored by this adapter, placed in URLs or passed through cookies. Each
 * operation owns a10s abort timeout and a128KiB bounded response lease. Fetch is
 * injected for tests; constructing/importing starts no network work. */
export class DiagnosticManagementApi {
  private readonly reader = new BoundedBinaryReader({ maxBytes: 128 * 1024 })
  /** Borrow transport and current origin without accessing browser globals. */
  constructor(private readonly fetch: (url: string, init: RequestInit) => Promise<Response>,
    private readonly origin: () => string) {}

  /** List one finite page; no automatic polling or browser storage is used. */
  async list(token: string, query: DiagnosticIssueQuery, signal: AbortSignal): Promise<DiagnosticIssuePage> {
    const parameters = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') parameters.set(key, String(value))
    return readManagementPage(await this.request(token, 'GET', '/api/diagnostics/issues?' + parameters, signal))
  }

  /** Compare-and-set one status. Expected revision prevents one operator from
   * silently overwriting another operator's newer decision. */
  async update(token: string, key: string, status: DiagnosticIssueStatus,
    expectedRevision: number, signal: AbortSignal): Promise<DiagnosticIssue> {
    const value = await this.request(token, 'PATCH', '/api/diagnostics/issues', signal, { key, status, expectedRevision })
    if (!value || typeof value !== 'object') throw new DiagnosticManagementError(502)
    const issue = readManagementIssue((value as Record<string, unknown>).issue)
    if (issue.key !== key || issue.status !== status) throw new DiagnosticManagementError(502)
    return issue
  }

  /** Own/clean a cancellation bridge through actual response settlement. */
  private async request(token: string, method: 'GET' | 'PATCH', url: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
    if (!secureManagementOrigin(this.origin())) throw new DiagnosticManagementError(403)
    const controller = new AbortController(), abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort()
    const timer = setTimeout(abort, 10000)
    try {
      const response = await this.fetch(url, { method, credentials: 'omit', referrerPolicy: 'no-referrer',
        redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      if (!response.ok) { await response.body?.cancel(); throw new DiagnosticManagementError(response.status) }
      if (!response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new DiagnosticManagementError(502) }
      const lease = await this.reader.readResponse(response, { signal: controller.signal })
      try { return JSON.parse(new TextDecoder().decode(lease.buffer)) }
      finally { lease.release() }
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
  }
}

/** Reject plaintext remote transport before constructing credential headers.
 * Loopback HTTP is restricted to local development. The origin is supplied by
 * the mounted browser adapter, never read at import/SSR or taken from a URL query. */
export function secureManagementOrigin(origin: unknown): boolean {
  if (typeof origin !== 'string') return false
  try {
    const url = new URL(origin)
    return origin === url.origin && (url.protocol === 'https:' || url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  } catch { return false }
}
