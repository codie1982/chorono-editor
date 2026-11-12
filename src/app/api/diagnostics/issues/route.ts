import { diagnosticManagementConfiguration } from '@/server/diagnostics/management/configuration'
import { diagnosticManagementApi } from '@/server/diagnostics/management/service'
import { managementResponse } from '@/server/diagnostics/management/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Private token-protected management read, separate from anonymous ingestion. */
export function GET(request: Request): Promise<Response> | Response {
  const configuration = diagnosticManagementConfiguration()
  if (!configuration.enabled) return managementResponse(404, { error: 'management-not-configured' })
  return diagnosticManagementApi(configuration).get(request, configuration)
}

/** Private same-origin status command; body/revision validation is centralized. */
export function PATCH(request: Request): Promise<Response> | Response {
  const configuration = diagnosticManagementConfiguration()
  if (!configuration.enabled) return managementResponse(404, { error: 'management-not-configured' })
  return diagnosticManagementApi(configuration).patch(request, configuration)
}
