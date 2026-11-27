export type WorkerReply<T> = { kind: 'result'; result: T } | { kind: 'error'; message: string }
export interface OneShotWorkerHandle<I, O> {
  onmessage: ((event: MessageEvent<WorkerReply<O>>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(request: I): void
  terminate(): void
}

/** Shared one-job transport extracted from BooleanWorkerClient. Every terminal
 * path terminates its owned worker and removes timer/listeners exactly once.
 * Does not cache, retry, transfer source buffers or implement domain geometry.
 * Admission/concurrency belongs to the caller's JobExecutor. */
export class OneShotWorkerClient<I, O> {
  constructor(private readonly options: { label: string; createWorker(): OneShotWorkerHandle<I, O>; timeoutMs: number }) {
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 0x7fffffff) throw new Error(`Invalid ${options.label} worker deadline.`)
  }
  /** Clone DTOs into one private worker. Pre-abort allocates nothing; in-flight
   * abort/deadline terminate native CPU work. No main-thread fallback. */
  execute(request: I, signal: AbortSignal): Promise<O> {
    const { label, timeoutMs } = this.options
    if (signal.aborted) return Promise.reject(new DOMException(`${label} preview cancelled.`, 'AbortError'))
    return new Promise((resolve, reject) => {
      let worker: OneShotWorkerHandle<I, O>
      try { worker = this.options.createWorker() } catch { reject(new Error(`${label} preview requires an available Worker backend.`)); return }
      let finished = false
      const finish = (error?: Error, result?: O) => {
        if (finished) return
        finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort)
        worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate()
        if (error) reject(error); else resolve(result!)
      }
      const abort = () => finish(new DOMException(`${label} preview cancelled.`, 'AbortError'))
      const timer = setTimeout(() => finish(new Error(`${label} preview exceeded its ${timeoutMs / 1000}-second worker deadline. Simplify inputs.`)), timeoutMs)
      worker.onmessage = event => {
        const reply = event.data
        if (reply?.kind === 'result') finish(undefined, reply.result)
        else finish(new Error(reply?.kind === 'error' ? reply.message : `Invalid ${label} worker response.`))
      }
      worker.onerror = event => finish(new Error(event.message || `${label} worker failed.`))
      worker.onmessageerror = () => finish(new Error(`${label} worker response could not be decoded.`))
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      else try { worker.postMessage(request) } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
    })
  }
}
