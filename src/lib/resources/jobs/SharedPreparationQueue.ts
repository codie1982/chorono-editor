import { BoundedJobQueue, cancelledJobError, type JobExecutor, type JobQueueSnapshot } from './BoundedJobQueue'

interface Pending<T> {
  controller: AbortController; promise: Promise<T>; consumers: number; settled: boolean
  result?: T; hasResult: boolean
}
export interface SharedPreparationOptions<T> {
  concurrency?: number; maxQueued?: number; label: string
  /** Borrow aggregate execution capacity after local admission. This owner
   * never disposes/cancels the executor itself, only its individual requests. */
  executor?: JobExecutor
  /** Release one protected delivery result after all synchronous consumer
   * projections, or when native work finishes after its last caller cancelled. */
  release(result: T): void
  /** Optional stale-result invalidation plus release. Called instead of release
   * when cancellation won after prepare returned but before native settlement. */
  discard?(key: string, result: T): void
}

/** Local active retains its legacy admitted-work meaning, including executor
 * wait and delivery handoff. executing counts producer bodies; waitingForExecutor
 * counts locally admitted requests waiting to enter shared capacity. These are
 * stage markers, not a partition to sum into native jobs or CPU utilization. */
export interface PreparationQueueSnapshot extends JobQueueSnapshot {
  executing: number
  waitingForExecutor: number
}

/**
 * Keyed in-flight dedupe and independent cancellation over BoundedJobQueue.
 * This extracts the audio decoder's existing delivery workflow for visual/native
 * preparation too. The queue owns requests and delivery results, not domain
 * cache identity, scene generations, byte estimates or browser/source handles.
 * A producer may hold external input until ACTUAL settlement via holdInput.
 *
 * A cancelled last consumer detaches the old key immediately; a fresh request
 * queues behind non-abortable work until it really settles. Each caller projects
 * its own retained lease synchronously before shared delivery ownership ends.
 * Forgetting lookups preserves old callers without letting stale completion
 * delete a newer same-key request. Optional borrowed executor limits aggregate
 * producers across owners; local dedupe/cancellation/delivery remain independent.
 * No owned cross-instance mutable state or timers.
 */
export class SharedPreparationQueue<T> {
  private readonly pending = new Map<string, Pending<T>>()
  private readonly queue: BoundedJobQueue
  private closed = false
  private executing = 0
  private waitingForExecutor = 0
  /** Resource destruction is supplied by the producing domain. */
  constructor(private readonly options: SharedPreparationOptions<T>) { this.queue = new BoundedJobQueue(options) }
  /** Join/create one key. prepare executes once inside the bounded slot;
   * project must synchronously fork any ownership it returns. holdInput runs
   * only for a new request and returns an idempotent release, including overflow
   * and queued cancellation. Caller cancellation rejects promptly; underlying
   * native work/charge cannot be claimed stopped until actual settlement. */
  request<R>(key: string, prepare: (signal: AbortSignal) => Promise<T>, project: (result: T) => R,
    signal?: AbortSignal, holdInput?: () => (() => void)): Promise<R> {
    if (this.closed) return Promise.reject(new Error(`${this.options.label} is disposed.`))
    if (signal?.aborted) return Promise.reject(cancelledJobError())
    let entry = this.pending.get(key)
    if (!entry) {
      let release: (() => void) | undefined
      try { release = holdInput?.() } catch (error) { return Promise.reject(error) }
      entry = { controller: new AbortController(), promise: null!, consumers: 0, settled: false, hasResult: false }
      const current = entry
      entry.promise = this.queue.submit(signal => this.execute(key, prepare, signal), { signal: entry.controller.signal,
        discard: result => this.discard(key, result) }).then(result => {
        current.result = result; current.hasResult = true; return result
      }).finally(() => {
        release?.(); current.settled = true
        if (this.pending.get(key) === current) this.pending.delete(key)
        if (!current.consumers) this.releaseDelivery(current)
      })
      this.pending.set(key, entry)
    }
    return this.consume(key, entry, project, signal)
  }
  /** Current dedupe entries only; cancelled native work remains in active count. */
  get size(): number { return this.pending.size }
  /** Diagnostic lookup never starts work or promotes cached data. */
  has(key: string): boolean { return this.pending.has(key) }
  /** Detach this generation's keys without cancelling already promised results. */
  forget(): void { this.pending.clear() }
  /** Request actual queued/active cancellation; future requests remain allowed. */
  cancelAll(): void { this.queue.cancelAll(); this.forget() }
  /** Stop admission and request cancellation; snapshot retains unsettled work. */
  dispose(): void { this.closed = true; this.queue.dispose(); this.forget() }
  /** Read local admission and producer-stage counters without creating work. */
  getSnapshot(): PreparationQueueSnapshot {
    return { ...this.queue.getSnapshot(), executing: this.executing, waitingForExecutor: this.waitingForExecutor }
  }
  /** Enter borrowed shared capacity only after local FIFO admission. A queued
   * shared cancellation or admission failure starts no domain allocation. An
   * active cancellation retains BOTH slots and holdInput until actual settlement.
   * Each queue cleans up only results it still owns: the shared queue discards
   * before rejecting, or the local queue discards a delivered result if abort
   * wins during handoff. It must never be released by both queues. */
  private async execute(key: string, prepare: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    const run = async (nativeSignal: AbortSignal) => {
      this.executing++
      try { return await prepare(nativeSignal) } finally { this.executing-- }
    }
    const executor = this.options.executor
    if (!executor) return run(signal)
    let waiting = true
    this.waitingForExecutor++
    try {
      return await executor.submit(nativeSignal => {
        waiting = false; this.waitingForExecutor--
        return run(nativeSignal)
      }, { signal, discard: result => this.discard(key, result) })
    } finally { if (waiting) this.waitingForExecutor-- }
  }
  /** Domain-owned exact-value invalidation/release, at one delivery boundary. */
  private discard(key: string, result: T): void {
    if (this.options.discard) this.options.discard(key, result)
    else this.options.release(result)
  }
  /** Last consumer cancellation cannot release an active native slot early. */
  private consume<R>(key: string, entry: Pending<T>, project: (value: T) => R, signal?: AbortSignal): Promise<R> {
    entry.consumers++
    return new Promise((resolve, reject) => {
      let finished = false
      const finish = () => {
        if (finished) return false
        finished = true; signal?.removeEventListener('abort', abort); entry.consumers--
        if (!entry.settled && !entry.consumers) {
          entry.controller.abort(); if (this.pending.get(key) === entry) this.pending.delete(key)
        }
        if (entry.settled && !entry.consumers) this.releaseDelivery(entry)
        return true
      }
      const abort = () => { if (finish()) reject(cancelledJobError()) }
      entry.promise.then(result => {
        if (finished) return
        try { const value = project(result); finish(); resolve(value) } catch (error) { finish(); reject(error) }
      }, error => { if (finish()) reject(this.closed ? new Error(`${this.options.label} is disposed.`) : error) })
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
  }
  /** Release delivery exactly once; consumers own independently retained output. */
  private releaseDelivery(entry: Pending<T>): void {
    if (!entry.hasResult) return
    const result = entry.result!
    entry.hasResult = false; entry.result = undefined; this.options.release(result)
  }
}
