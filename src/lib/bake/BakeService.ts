import { BoundedJobQueue, type JobExecutor } from '@/lib/resources/jobs'
import type { BakeJobHandle, BakeJobSpec } from './BakeContracts'
import { BakeJob } from './BakeJob'

export interface BakeServiceOptions {
  executor?: JobExecutor
  concurrency?: number
  maxQueued?: number
}

/**
 * Creates typed bake jobs over a shared bounded executor.
 *
 * The service owns its queue only when no executor is injected. It does not own
 * scene data, adapters, worker implementations or committed artifacts. Mutable
 * state is limited to active runtime handles and a monotonic local id counter.
 */
export class BakeService {
  private readonly executor: JobExecutor
  private readonly ownedQueue?: BoundedJobQueue
  private readonly jobs = new Set<BakeJob<unknown>>()
  private nextId = 1
  private disposed = false

  constructor(options: BakeServiceOptions = {}) {
    if (options.executor && (options.concurrency !== undefined || options.maxQueued !== undefined)) {
      throw new Error('BakeService queue limits cannot be combined with an injected executor.')
    }
    this.ownedQueue = options.executor ? undefined : new BoundedJobQueue({
      concurrency: options.concurrency ?? 1,
      maxQueued: options.maxQueued ?? 32,
    })
    this.executor = options.executor ?? this.ownedQueue!
  }

  /** Creates but does not start one typed job. Each handle may run only once. */
  createJob<TPreview>(spec: BakeJobSpec<TPreview>): BakeJobHandle<TPreview> {
    if (this.disposed) throw new Error('Bake service is disposed.')
    if (!spec.kind.trim() || !spec.label.trim() || !spec.source.kind.trim() || !spec.source.ownerId.trim()) {
      throw new Error('Bake jobs require non-empty kind, label and source identity.')
    }
    const id = `bake-job-${this.nextId++}`
    let job: BakeJob<TPreview>
    job = new BakeJob(id, spec, this.executor, () => this.jobs.delete(job as BakeJob<unknown>))
    this.jobs.add(job as BakeJob<unknown>)
    return job
  }

  /** Cancels unpublished work. Injected executors retain their independent lifetime. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const job of Array.from(this.jobs)) job.dispose()
    this.jobs.clear()
    this.ownedQueue?.dispose()
  }
}
