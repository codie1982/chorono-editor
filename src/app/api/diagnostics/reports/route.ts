import { diagnosticOptions, receiverGuard } from '@/server/diagnostics/DiagnosticReceiver'
import { receiverConfiguration } from '@/server/diagnostics/configuration'
import { diagnosticReceiver } from '@/server/diagnostics/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Explicit opt-in receiver deployment; unrelated project/account APIs are not
 * used. Human consent is enforced by the browser, not inferred from this route. */
export async function POST(request: Request): Promise<Response> {
  const config = receiverConfiguration(), early = receiverGuard(request, config)
  return early ?? diagnosticReceiver(config).post(request, config)
}

/** Credential-free CORS preflight for the one supported report mutation. */
export function OPTIONS(request: Request): Response {
  return diagnosticOptions(request, receiverConfiguration(), 'POST')
}
