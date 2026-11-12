import { validateDiagnosticReport } from '@/lib/diagnostics/conversion/validateDiagnosticReport'
import { DiagnosticAdmission } from './DiagnosticAdmission'
import { DIAGNOSTIC_POLICY, type ReceiverConfiguration } from './configuration'
import { readDiagnosticBody } from './readDiagnosticBody'
import { DiagnosticRepositoryError, type DiagnosticRepository } from './types'

/** Stateless HTTP adaptation around a finite ingress gate/repository. No JWT,
 * cookies, raw error text or request metadata enters persistence. The policy
 * header is an explicit client protocol marker, not proof of human consent or
 * authentication; the browser's persistent consent remains client-owned.
 */
export class DiagnosticReceiver {
  constructor(private readonly repository: DiagnosticRepository,
    private readonly admission = new DiagnosticAdmission()) {}

  /** POST accepts one exact16KiB report and ACKs only committed data. CORS is
   * explicit and credential-free; invalid origins never reach the body/depot. */
  async post(request: Request, config: ReceiverConfiguration): Promise<Response> {
    const early = receiverGuard(request, config)
    if (early) return early
    if (request.headers.get('x-chorono-diagnostics-policy') !== DIAGNOSTIC_POLICY) return receiverResponse(request, config, 403, { error: 'consent-policy-required' })
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') ?? '') ||
      !['', 'identity'].includes(request.headers.get('content-encoding') ?? '')) return receiverResponse(request, config, 415, { error: 'json-required' })
    const lease = this.admission.acquire()
    if (!lease) return receiverResponse(request, config, 429, { error: 'rate-limited' }, { 'Retry-After': '60' })
    const abort = new AbortController(), onAbort = () => abort.abort()
    request.signal.addEventListener('abort', onAbort, { once: true })
    if (request.signal.aborted) abort.abort()
    const timeout = setTimeout(() => abort.abort(), 15_000)
    try {
      const report = validateDiagnosticReport(await readDiagnosticBody(request, abort.signal))
      if (!report) return receiverResponse(request, config, 400, { error: 'invalid-report' })
      if (abort.signal.aborted) return receiverResponse(request, config, 408, { error: 'request-timeout' })
      return receiverResponse(request, config, 200, await this.repository.accept(report))
    } catch (error) {
      if (abort.signal.aborted) return receiverResponse(request, config, 408, { error: 'request-timeout' })
      if (error instanceof RangeError) return receiverResponse(request, config, 413, { error: 'payload-limit' })
      if (error instanceof SyntaxError) return receiverResponse(request, config, 400, { error: 'invalid-json' })
      if (error instanceof DiagnosticRepositoryError && error.code === 'report-conflict') return receiverResponse(request, config, 409, { error: error.code })
      return receiverResponse(request, config, 503, { error: 'receiver-unavailable' }, { 'Retry-After': '60' })
    } finally {
      clearTimeout(timeout); request.signal.removeEventListener('abort', onAbort); lease.release()
    }
  }
}

/** Shared disabled/config/origin checks; no depot operation or raw error echo. */
export function receiverGuard(request: Request, config: ReceiverConfiguration, allowNoOrigin = false): Response | undefined {
  if (!config.enabled) return receiverResponse(request, config, 404, { error: 'not-configured' })
  if (!config.valid) return receiverResponse(request, config, 503, { error: 'receiver-unavailable' })
  const origin = request.headers.get('origin')
  if ((!origin && !allowNoOrigin) || (origin && !config.allowedOrigins.includes(origin))) return receiverResponse(request, config, 403, { error: 'origin-denied' })
}

/** OPTIONS response exposes only fixed protocol headers/methods, no credentials. */
export function diagnosticOptions(request: Request, config: ReceiverConfiguration, method: 'POST' | 'GET'): Response {
  const early = receiverGuard(request, config)
  if (early) return early
  const requested = (request.headers.get('access-control-request-headers') ?? '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean)
  if (request.headers.get('access-control-request-method') !== method ||
    requested.some(header => !['content-type', 'x-chorono-diagnostics-policy'].includes(header))) return receiverResponse(request, config, 403, { error: 'preflight-denied' })
  return receiverResponse(request, config, 204, undefined, { 'Access-Control-Allow-Methods': method,
    'Access-Control-Allow-Headers': 'Content-Type, X-Chorono-Diagnostics-Policy', 'Access-Control-Max-Age': '600' })
}

/** Public-safe JSON/no-store response; a disallowed origin gets no CORS grant. */
export function receiverResponse(request: Request, config: ReceiverConfiguration, status: number, body?: unknown,
  extra: Record<string, string> = {}): Response {
  const origin = request.headers.get('origin'), headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin', ...extra })
  if (origin && config.allowedOrigins.includes(origin)) headers.set('Access-Control-Allow-Origin', origin)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers })
}
