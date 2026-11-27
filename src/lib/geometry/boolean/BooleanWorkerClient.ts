import type { BooleanExecutor, BooleanRequest, BooleanResult } from './types'
import type { BooleanWorkerHandle } from './workerProtocol'
import { OneShotWorkerClient } from '../../resources/jobs'

/** Compatible Boolean executor over the shared one-shot worker lifecycle.
 * Domain URL/factory/deadline stay here; no retained scene, result or cache. */
export class BooleanWorkerClient implements BooleanExecutor {
  private readonly worker: OneShotWorkerClient<BooleanRequest, BooleanResult>
  constructor(options: { createWorker?: () => BooleanWorkerHandle; timeoutMs?: number } = {}) {
    this.worker = new OneShotWorkerClient({ label: 'Boolean', timeoutMs: options.timeoutMs ?? 5000,
      createWorker: options.createWorker ?? (() => new Worker(new URL('./boolean.worker.ts', import.meta.url))) })
  }
  /** Existing cancellation/result ownership and error messages are preserved. */
  execute(request: BooleanRequest, signal: AbortSignal): Promise<BooleanResult> { return this.worker.execute(request, signal) }
}
