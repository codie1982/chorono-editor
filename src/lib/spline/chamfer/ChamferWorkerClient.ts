import { BoundedJobQueue, OneShotWorkerClient, type OneShotWorkerHandle } from '../../resources/jobs'
import type { ChamferExecutor, ChamferRequest, ChamferResult } from './types'

const queue = new BoundedJobQueue({ concurrency: 1, maxQueued: 2 })
/** One short-lived worker per bounded preview. Shared transport owns abort,
 * deadline, message validation and terminate cleanup; no source/frame cache. */
export class ChamferWorkerClient implements ChamferExecutor {
  private readonly worker: OneShotWorkerClient<ChamferRequest, ChamferResult>
  constructor(options: { createWorker?: () => OneShotWorkerHandle<ChamferRequest, ChamferResult>; timeoutMs?: number } = {}) {
    this.worker = new OneShotWorkerClient({ label: 'Chamfer', timeoutMs: options.timeoutMs ?? 5000,
      createWorker: options.createWorker ?? (() => new Worker(new URL('./chamfer.worker.ts', import.meta.url))) })
  }
  /** Abortable admission; active cancellation terminates CPU before slot release. */
  execute(request: ChamferRequest, signal: AbortSignal): Promise<ChamferResult> {
    return queue.submit(active => this.worker.execute(request, active), { signal })
  }
}
