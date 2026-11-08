import { GifBackendUnavailable, type GifSheetComposer, type GifSheetPlan, type GifLimits, type DecodedGifSheet } from '../gif/types'
import type { GifWorkerHandle, GifWorkerReply } from '../gif/workerProtocol'
import { checkImportExecution, type ImportExecution } from '../resources/ImportExecution'
import { cancelledJobError } from '../../resources/jobs'
export type { DecodedGifSheet } from '../gif/types'

export interface GifWorkerClientOptions { createWorker?: () => GifWorkerHandle; timeoutMs?: number }

/** One-shot worker transport, borrowing an already admitted GIF workset. A ready
 * handshake avoids transferring input to unsupported workers. Capacity/decode/
 * timeout/abort never cause a retry. Cooperative cancellation retains ownership
 * until the worker acknowledges native cleanup; deadline/error termination is
 * an explicit worker-handle boundary, not proof of immediate OS memory reclaim.
 * Every exit detaches callbacks/listeners and clears its timer exactly once. */
export class GifDecodeWorkerClient implements GifSheetComposer {
  private readonly createWorker: () => GifWorkerHandle
  private readonly timeoutMs: number

  /** Lazy worker creation; injected factories adapt standalone QA packaging. */
  constructor(options: GifWorkerClientOptions = {}) {
    this.createWorker = options.createWorker ?? (() => new Worker(new URL('./gifDecode.worker.ts', import.meta.url)))
    this.timeoutMs = options.timeoutMs ?? 30000
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 0x7fffffff) throw new RangeError('Invalid GIF worker deadline.')
  }
  /** Worker-local codec/canvas support is checked by the handshake, not assumed. */
  static isSupported(): boolean { return typeof Worker !== 'undefined' }

  /** Consume input by transfer only after readiness. The caller keeps its logical
   * input/workspace reservations through this promise's actual settlement. */
  async compose(buffer: ArrayBuffer, plan: GifSheetPlan, limits: GifLimits, execution?: ImportExecution): Promise<DecodedGifSheet> {
    checkImportExecution(execution)
    let worker: GifWorkerHandle
    try { worker = this.createWorker() } catch (error) { return Promise.reject(new GifBackendUnavailable(`GIF worker setup failed: ${String(error)}`)) }
    return new Promise((resolve, reject) => {
      let finished = false, transferred = false
      const signal = execution?.signal
      const finish = (error?: Error, sheet?: DecodedGifSheet) => {
        if (finished) return
        finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort)
        worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null
        worker.terminate()
        if (signal?.aborted) reject(cancelledJobError()); else if (error) reject(error); else resolve(sheet!)
      }
      const abort = () => {
        if (!transferred) { finish(cancelledJobError()); return }
        try { worker.postMessage({ kind: 'cancel' }) } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
      }
      const timer = setTimeout(() => { const error = new Error('GIF decode worker timed out.'); error.name = 'TimeoutError'; finish(error) }, this.timeoutMs)
      worker.onmessage = (event: MessageEvent<GifWorkerReply>) => {
        if (finished) return
        const message = event.data
        if (!message || typeof message.kind !== 'string') { finish(new Error('Invalid GIF worker response.')); return }
        if (message.kind === 'ready') {
          if (transferred) { finish(new Error('Duplicate GIF worker ready message.')); return }
          if (!message.supported) { finish(new GifBackendUnavailable('Worker GIF codec/canvas is unavailable.')); return }
          if (signal?.aborted) { abort(); return }
          try { worker.postMessage({ kind: 'decode', buffer, plan, limits }, [buffer]); transferred = true }
          catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
        } else if (message.kind === 'result') {
          if (!transferred) finish(new Error('GIF worker returned output before input.'))
          else finish(undefined, message.sheet)
        } else if (message.kind === 'error') {
          const error = new Error(message.message); error.name = message.name; finish(error)
        } else finish(new Error('Invalid GIF worker response.'))
      }
      worker.onerror = event => finish(transferred ? new Error(event.message || 'GIF worker failed.') : new GifBackendUnavailable(event.message || 'GIF worker setup failed.'))
      worker.onmessageerror = () => finish(new Error('GIF worker message could not be decoded.'))
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
  }
}

export const gifDecodeWorkerClient = new GifDecodeWorkerClient()
