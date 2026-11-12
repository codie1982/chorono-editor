import { FileDiagnosticRepository } from '../FileDiagnosticRepository'
import { DiagnosticManagementApi } from './DiagnosticManagementApi'
import type { DiagnosticManagementConfiguration } from './configuration'

let current: { directory: string; api: DiagnosticManagementApi } | undefined

/** Lazy server composition; disabled routes never create a repository. The
 * independent management admission budget persists across individual requests.
 * Secrets are supplied per request for rotation, not captured by the service. */
export function diagnosticManagementApi(configuration: DiagnosticManagementConfiguration): DiagnosticManagementApi {
  if (!current || current.directory !== configuration.directory) {
    current = { directory: configuration.directory, api: new DiagnosticManagementApi(new FileDiagnosticRepository(configuration.directory)) }
  }
  return current.api
}
