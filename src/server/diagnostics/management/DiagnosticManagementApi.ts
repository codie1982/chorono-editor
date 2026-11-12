import type { DiagnosticIssueRepository } from '@/lib/diagnostics/management'
import { DiagnosticAdmission } from '../DiagnosticAdmission'
import { readDiagnosticBody } from '../readDiagnosticBody'
import { DiagnosticRepositoryError } from '../types'
import { managementQuery, managementUpdate } from './conversion'
import { authorizeManagement, managementResponse } from './http'
import type { DiagnosticManagementConfiguration } from './configuration'

/** Finite administrative HTTP adapter. Authentication/origin checks precede
 * body/depot access, and a separate process-wide admission gate bounds all
 * attempts. No public-ingest marker, JWT/account data, raw errors or credentials
 * are stored. The caller composes one instance per configured private depot. */
export class DiagnosticManagementApi {
  constructor(private readonly repository: DiagnosticIssueRepository,
    private readonly admission = new DiagnosticAdmission()) {}

  /** List one validated bounded page. The token is never a query parameter. */
  get(request: Request, configuration: DiagnosticManagementConfiguration): Promise<Response> {
    return this.execute(request, configuration, async () => managementResponse(200,
      await this.repository.listIssues(managementQuery(request.url))))
  }

  /** Apply one exact <=1KiB JSON command using repository CAS. Returns the
   * committed row;409 tells a stale editor to reload rather than overwrite. */
  patch(request: Request, configuration: DiagnosticManagementConfiguration): Promise<Response> {
    return this.execute(request, configuration, async () => {
      if (new URL(request.url).search) return managementResponse(400, { error: 'invalid-issue-update' })
      if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') ?? '') ||
        !['', 'identity'].includes(request.headers.get('content-encoding') ?? '')) return managementResponse(415, { error: 'json-required' })
      const abort = new AbortController(), onAbort = () => abort.abort()
      request.signal.addEventListener('abort', onAbort, { once: true })
      if (request.signal.aborted) abort.abort()
      const timeout = setTimeout(() => abort.abort(), 10_000)
      try {
        const update = managementUpdate(await readDiagnosticBody(request, abort.signal, 1024))
        if (!update) return managementResponse(400, { error: 'invalid-issue-update' })
        if (abort.signal.aborted) return managementResponse(408, { error: 'request-timeout' })
        const issue = await this.repository.setIssueStatus(update.key, update.status, update.expectedRevision)
        return managementResponse(200, { issue })
      } catch (error) {
        if (abort.signal.aborted) return managementResponse(408, { error: 'request-timeout' })
        throw error
      } finally { clearTimeout(timeout); request.signal.removeEventListener('abort', onAbort) }
    })
  }

  /** Keep disabled configuration and rate/auth failure free of depot access.
   * Slots release after actual IO completion; errors expose only fixed codes. */
  private async execute(request: Request, configuration: DiagnosticManagementConfiguration,
    action: () => Promise<Response>): Promise<Response> {
    if (!configuration.enabled) return managementResponse(404, { error: 'management-not-configured' })
    if (!configuration.valid) return managementResponse(503, { error: 'management-unavailable' })
    const lease = this.admission.acquire()
    if (!lease) return managementResponse(429, { error: 'rate-limited' }, { 'Retry-After': '60' })
    try {
      const denied = authorizeManagement(request, configuration)
      return denied ?? await action()
    } catch (error) {
      if (error instanceof RangeError) return managementResponse(413, { error: 'payload-limit' })
      if (error instanceof SyntaxError) return managementResponse(400, { error: 'invalid-json' })
      if (error instanceof DiagnosticRepositoryError) {
        if (error.code === 'issue-conflict') return managementResponse(409, { error: error.code })
        if (error.code === 'issue-not-found') return managementResponse(404, { error: error.code })
        if (error.code === 'invalid-issue-query') return managementResponse(400,
          { error: request.method === 'PATCH' ? 'invalid-issue-update' : error.code })
      }
      return managementResponse(503, { error: 'management-unavailable' })
    } finally { lease.release() }
  }
}
