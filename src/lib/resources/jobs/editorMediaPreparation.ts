import { BoundedJobQueue, type JobExecutor, type JobOptions, type JobQueueSnapshot } from './BoundedJobQueue'

/** Read-only diagnostics for the same executor that admits actual preparation.
 * Active includes fetch/decode and settlement cleanup, not CPU utilization. */
export interface MediaPreparationExecutor extends JobExecutor {
  getSnapshot(): JobQueueSnapshot
}

const queue = new BoundedJobQueue({ concurrency: 2, maxQueued: 128 })

/** Editor-realm composition root for aggregate audio/visual/font preparation.
 * Local services borrow submit capacity; they cannot cancelAll/dispose another
 * owner's work. Their own signals cancel only their submitted jobs. No native
 * object or timer is created on import. This singleton lives for the realm;
 * source/byte ownership and consumer pins remain with the domain services.
 * Private hosts can inject another JobExecutor instead of using this policy. */
export const editorMediaPreparation: MediaPreparationExecutor = Object.freeze({
  submit: <T>(work: (signal: AbortSignal) => Promise<T> | T, options?: JobOptions<T>) => queue.submit(work, options),
  getSnapshot: () => queue.getSnapshot(),
})
