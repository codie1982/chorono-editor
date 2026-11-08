export interface JobQueueSnapshot {
  active: number; queued: number; concurrency: number; maxQueued: number
  completed: number; failed: number; cancelled: number; denied: number; closed: boolean
}
export interface JobOptions<T> {
  signal?: AbortSignal
  /** Dispose an owned result if cancellation occurred during non-abortable work.
   * Plain values/GC-only buffers need no callback. Runs before the slot is freed. */
  discard?: (result: T) => void
}

/** Borrowed execution capacity, without lifecycle control over other owners.
 * Implementations reject admission failures without invoking work. Cancellation
 * removes waiting work promptly but MUST await actual running settlement and
 * discard a late owned result exactly once before releasing its slot. Work
 * receives the executor's signal; returned results transfer ownership to caller.
 * This contract neither estimates bytes nor moves work onto a worker thread. */
export interface JobExecutor {
  submit<T>(work: (signal: AbortSignal) => Promise<T> | T, options?: JobOptions<T>): Promise<T>
}
interface Job {
  controller: AbortController
  start(): Promise<void>
  reject(error: Error): void
  detach(): void
}

/** Portable cancellation error; not tied to a DOMException constructor. */
export function cancelledJobError(): Error {
  const error = new Error('Resource preparation was cancelled.')
  error.name = 'AbortError'
  return error
}

/**
 * FIFO orchestration for a bounded number of async resource jobs. Queue metadata
 * is bounded independently of native work concurrency. This does not move CPU
 * work off the main thread, estimate bytes or own an application-wide singleton:
 * the concrete resource service supplies work, admission and its queue lifetime.
 *
 * Cancellation removes queued work immediately. Running work receives an abort
 * signal but retains its slot until it ACTUALLY settles, including native APIs
 * that ignore cancellation. Its late result is discarded before freeing the
 * slot. Resource-producing work supplies `discard` when dropping references is
 * insufficient. There are no timers, listeners outside submitted job signals,
 * scene objects or browser handles. Snapshot is detached numeric diagnostics.
 */
export class BoundedJobQueue implements JobExecutor {
  private readonly pending: Job[] = []
  private readonly running = new Set<Job>()
  private readonly concurrency: number
  private readonly maxQueued: number
  private closed = false
  private completed = 0
  private failed = 0
  private cancelled = 0
  private denied = 0

  /** Limits are positive concurrency and nonnegative pending capacity, both safe
   * integers. Zero pending capacity permits only immediately runnable jobs. */
  constructor(options: { concurrency?: number; maxQueued?: number } = {}) {
    this.concurrency = options.concurrency ?? 1
    this.maxQueued = options.maxQueued ?? 128
    if (!Number.isSafeInteger(this.concurrency) || this.concurrency < 1
      || !Number.isSafeInteger(this.maxQueued) || this.maxQueued < 0) throw new RangeError('Invalid resource job queue limits.')
  }

  /** Submit once. FIFO starts in a microtask; sync throws become rejections.
   * Full/closed queues reject without calling work. An aborted active request's
   * promise settles only after native work/late-result cleanup has completed. */
  submit<T>(work: (signal: AbortSignal) => Promise<T> | T, options: JobOptions<T> = {}): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Resource job queue is disposed.'))
    if (options.signal?.aborted) return Promise.reject(cancelledJobError())
    if (this.running.size >= this.concurrency && this.pending.length >= this.maxQueued) {
      this.denied++
      return Promise.reject(new RangeError('Resource preparation queue is full. Retry after pending work completes.'))
    }
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController()
      const onAbort = () => this.cancel(job)
      const job: Job = { controller, reject,
        detach: () => options.signal?.removeEventListener('abort', onAbort),
        start: async () => {
          try {
            if (controller.signal.aborted) throw cancelledJobError()
            const result = await work(controller.signal)
            if (controller.signal.aborted) {
              options.discard?.(result)
              throw cancelledJobError()
            }
            this.completed++; resolve(result)
          } catch (error) {
            if (!controller.signal.aborted || !(error instanceof Error) || error.name !== 'AbortError') this.failed++
            reject(error)
          } finally {
            job.detach(); this.running.delete(job); this.pump()
          }
        },
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.push(job)
      this.pump()
    })
  }

  /** Cancel this generation without closing the queue. Already running native
   * work still counts against concurrency; future submissions wait for it. */
  cancelAll(): void {
    for (const job of [...this.pending, ...Array.from(this.running)]) this.cancel(job)
  }

  /** Idempotently stop admission and request cancellation. No async cleanup is
   * pretended complete: getSnapshot().active stays nonzero until work settles. */
  dispose(): void { this.closed = true; this.cancelAll() }

  /** Does not promote jobs or expose inputs, URLs, results or abort handles. */
  getSnapshot(): JobQueueSnapshot {
    return { active: this.running.size, queued: this.pending.length, concurrency: this.concurrency,
      maxQueued: this.maxQueued, completed: this.completed, failed: this.failed,
      cancelled: this.cancelled, denied: this.denied, closed: this.closed }
  }

  /** Cancel once. Abort callbacks cannot free the running native work's slot. */
  private cancel(job: Job): void {
    if (job.controller.signal.aborted) return
    this.cancelled++
    const index = this.pending.indexOf(job)
    if (index >= 0) {
      this.pending.splice(index, 1); job.detach(); job.reject(cancelledJobError())
    }
    job.controller.abort()
  }

  /** Only settlement can open an active slot; reserve it before invoking work. */
  private pump(): void {
    while (!this.closed && this.running.size < this.concurrency && this.pending.length) {
      const job = this.pending.shift()!
      this.running.add(job)
      void Promise.resolve().then(() => job.start())
    }
  }
}
