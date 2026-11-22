import { BoundedJobQueue, OneShotWorkerClient, type OneShotWorkerHandle } from '../../resources/jobs'
import type { OutlineExecutor, OutlineRequest, OutlineResult } from './types'

// One CPU solver at a time per editor realm, at most two pending requests.
const queue = new BoundedJobQueue({ concurrency: 1, maxQueued: 2 })
/** Bounded outline CPU adapter. Each job owns one short-lived worker; cancellation
 * and deadlines reuse the Boolean transport's shared lifecycle. No dense frame
 * cache or source buffers are retained. A factory supports standalone native QA. */
export class OutlineWorkerClient implements OutlineExecutor {
  private readonly worker: OneShotWorkerClient<OutlineRequest, OutlineResult>
  constructor(options: { createWorker?: () => OneShotWorkerHandle<OutlineRequest, OutlineResult>; timeoutMs?: number } = {}) {
    this.worker = new OneShotWorkerClient({ label: 'Offset', timeoutMs: options.timeoutMs ?? 5000,
      createWorker: options.createWorker ?? (() => new Worker(new URL('./outline.worker.ts', import.meta.url))) })
  }
  /** Admission is abortable; active cancellation terminates CPU work before the
   * queue slot is released. Plain result ownership transfers to the caller. */
  execute(request: OutlineRequest, signal: AbortSignal): Promise<OutlineResult> {
    return queue.submit(active => this.worker.execute(request, active), { signal })
  }
}
