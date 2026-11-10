import { createHash, timingSafeEqual } from 'node:crypto'
import type { DiagnosticManagementConfiguration } from './configuration'
import { diagnosticTransportAllowed } from '../configuration'

/** Fixed no-store management response; no CORS grant, input echo or secret.
 * The browser never stores a session cookie for this API. */
export function managementResponse(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json',
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    Vary: 'Authorization, Origin', ...extra } })
}

/** Authenticate one memory-only Bearer token using fixed-size digest compare.
 * Mutation also requires the actual request origin; GET permits the ordinary
 * same-origin browser omission of Origin but rejects an explicit foreign origin.
 * The policy header used by public ingestion never grants administrative access.
 */
export function authorizeManagement(request: Request, configuration: DiagnosticManagementConfiguration): Response | undefined {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer ([\x21-\x7e]{32,256})$/.exec(header)
  const supplied = match?.[0] === header ? match[1] : ''
  const digest = createHash('sha256').update(supplied).digest()
  if (!configuration.tokenDigest || configuration.tokenDigest.length !== digest.length || !timingSafeEqual(digest, configuration.tokenDigest)) {
    return managementResponse(401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer realm="Chorono diagnostics"' })
  }
  const origin = request.headers.get('origin'), expected = managementRequestOrigin(request)
  if (!expected || (request.method === 'PATCH' ? origin !== expected : origin !== null && origin !== expected)) {
    return managementResponse(403, { error: 'origin-denied' })
  }
}

/** Resolve the actual served Host without trusting Forwarded headers. Next may
 * normalize a127.0.0.1 request URL to localhost, so URL.origin alone can reject a
 * legitimate same-origin PATCH. Only a hostname/IPv6+optional port is accepted;
 * credentials, whitespace, lists and URL path syntax cannot become an origin.
 * Request-only unit/adapter hosts without Host use their ordinary URL origin. */
function managementRequestOrigin(request: Request): string | undefined {
  try {
    const url = new URL(request.url), host = request.headers.get('host')
    if (!['http:', 'https:'].includes(url.protocol)) return
    if (host === null) return diagnosticTransportAllowed(url) ? url.origin : undefined
    if (host.length > 255 || !/^(?:\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9.-]+)(?::\d{1,5})?$/.test(host)) return
    const served = new URL(`${url.protocol}//${host}`)
    return diagnosticTransportAllowed(served) ? served.origin : undefined
  } catch { return undefined }
}
