import { FileDiagnosticRepository } from './FileDiagnosticRepository'
import { DiagnosticReceiver } from './DiagnosticReceiver'
import type { ReceiverConfiguration } from './configuration'

let service: { directory: string; receiver: DiagnosticReceiver; cleanup: ReturnType<typeof setInterval> } | undefined

/** Compose one process-local receiver only after an enabled request. A single
 * unref'd hourly cleanup job removes expired code examples/receipts/aggregates
 * while the service is running. Configuration replacement drops its old job.
 * Persistent hosts may additionally schedule repository.inspect() while idle;
 * a stopped/serverless process cannot promise wall-clock physical deletion.
 */
export function diagnosticReceiver(config: ReceiverConfiguration): DiagnosticReceiver {
  if (!service || service.directory !== config.directory) {
    if (service) clearInterval(service.cleanup)
    const repository = new FileDiagnosticRepository(config.directory)
    const cleanup = setInterval(() => { void repository.inspect().catch(() => {}) }, 60 * 60 * 1000)
    cleanup.unref()
    service = { directory: config.directory, receiver: new DiagnosticReceiver(repository), cleanup }
  }
  return service.receiver
}
