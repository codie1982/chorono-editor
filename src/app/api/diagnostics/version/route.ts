import { diagnosticOptions, receiverGuard, receiverResponse } from '@/server/diagnostics/DiagnosticReceiver'
import { DIAGNOSTIC_POLICY, diagnosticRelease, receiverConfiguration } from '@/server/diagnostics/configuration'
import { DiagnosticAdmission } from '@/server/diagnostics/DiagnosticAdmission'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const admission = new DiagnosticAdmission()

/** Read only trusted release metadata, without any current-version query or
 * client identity. Browser calls only after the same sharing consent. Missing
 * release config returns204; malformed config returns a generic503. */
export function GET(request: Request): Response {
  const config = receiverConfiguration(), early = receiverGuard(request, config, true)
  if (early) return early
  if (request.headers.get('x-chorono-diagnostics-policy') !== DIAGNOSTIC_POLICY) return receiverResponse(request, config, 403, { error: 'consent-policy-required' })
  const lease = admission.acquire()
  if (!lease) return receiverResponse(request, config, 429, { error: 'rate-limited' }, { 'Retry-After': '60' })
  try {
    const release = diagnosticRelease()
    return release ? receiverResponse(request, config, 200, release) : receiverResponse(request, config, 204)
  } catch { return receiverResponse(request, config, 503, { error: 'release-unavailable' }) }
  finally { lease.release() }
}

/** Same explicit origins/header boundary as report delivery. */
export function OPTIONS(request: Request): Response {
  return diagnosticOptions(request, receiverConfiguration(), 'GET')
}
