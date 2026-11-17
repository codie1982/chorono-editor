import { BoundedJobQueue, OneShotWorkerClient, type OneShotWorkerHandle } from '../../resources/jobs'
import type { FilletExecutor, FilletRequest, FilletResult } from './types'

const queue = new BoundedJobQueue({ concurrency: 1, maxQueued: 2 })
/** One short-lived worker per bounded preview. Shared transport owns abort,
 * deadline, message validation and terminate cleanup; no source/frame cache. */
export class FilletWorkerClient implements FilletExecutor {
  private readonly worker: OneShotWorkerClient<FilletRequest, FilletResult>
  constructor(options: { createWorker?: () => OneShotWorkerHandle<FilletRequest, FilletResult>; timeoutMs?: number } = {}) {
    this.worker = new OneShotWorkerClient({ label: 'Fillet', timeoutMs: options.timeoutMs ?? 5000,
      createWorker: options.createWorker ?? (() => new Worker(new URL('./fillet.worker.ts', import.meta.url))) })
  }
  /** Abortable admission; active cancellation terminates CPU before slot release. */
  execute(request: FilletRequest, signal: AbortSignal): Promise<FilletResult> {
    return queue.submit(active => this.worker.execute(request, active), { signal })
  }
}
