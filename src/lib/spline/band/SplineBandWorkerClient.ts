import { BoundedJobQueue, OneShotWorkerClient, type OneShotWorkerHandle } from '../../resources/jobs'
import type { SplineBandRequest, SplineBandResult } from './types'
const queue = new BoundedJobQueue({ concurrency: 1, maxQueued: 2 })
/** Existing one-shot transport and bounded CPU admission. Every preview owns a
 * short-lived worker; abort/deadline terminates it before releasing its slot.
 * No dense geometry or source ownership survives settlement. */
export class SplineBandWorkerClient {
  private readonly worker: OneShotWorkerClient<SplineBandRequest, SplineBandResult>
  constructor(options: { createWorker?: () => OneShotWorkerHandle<SplineBandRequest, SplineBandResult>; timeoutMs?: number } = {}) {
    this.worker = new OneShotWorkerClient({ label: 'Outline band', timeoutMs: options.timeoutMs ?? 10000,
      createWorker: options.createWorker ?? (() => new Worker(new URL('./band.worker.ts', import.meta.url))) })
  }
  execute(request: SplineBandRequest, signal: AbortSignal): Promise<SplineBandResult> { return queue.submit(active => this.worker.execute(request, active), { signal }) }
}
