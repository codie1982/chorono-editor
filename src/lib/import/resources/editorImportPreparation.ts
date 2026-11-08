import { BoundedJobQueue, type JobExecutor, type JobQueueSnapshot, type JobOptions } from '../../resources/jobs'

const queue = new BoundedJobQueue({ concurrency: 2, maxQueued: 128 })

/** Outer File/URL/clipboard/preflight admission for the editor realm. This queue
 * is separate from native media preparation: import may await that inner queue,
 * but media services never await this one. Sharing a queue would deadlock.
 * Waiting work starts no IO. Cancelled active work retains capacity through real
 * settlement. Consumers borrow submit and numeric diagnostics, not cancelAll.
 * Counts overlap media jobs and are never added as native CPU concurrency. */
export const editorImportPreparation: JobExecutor & { getSnapshot(): JobQueueSnapshot } = Object.freeze({
  submit: <T>(work: (signal: AbortSignal) => Promise<T> | T, options?: JobOptions<T>) => queue.submit(work, options),
  getSnapshot: () => queue.getSnapshot(),
})
