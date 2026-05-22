// ── GifDecodeWorkerClient (BL-08b) ────────────────────────────────────────────
//
// Main-thread wrapper around gifDecode.worker. Spawns a one-shot worker, sends
// the GIF bytes (transferred), and resolves with the composited sprite sheet.
// The worker is created lazily inside decode() and wrapped in try/catch so a
// bundling/runtime failure never breaks the caller — GifHandler falls back to
// in-thread decoding.

import type { GifWorkerResult, GifWorkerError } from './gifDecode.worker'

export type DecodedGifSheet = Omit<GifWorkerResult, 'ok'>

export class GifDecodeWorkerClient {
  /** Whether the worker path can run in this environment. */
  static isSupported(): boolean {
    return typeof Worker !== 'undefined'
      && typeof OffscreenCanvas !== 'undefined'
      && typeof (globalThis as { ImageDecoder?: unknown }).ImageDecoder !== 'undefined'
  }

  /** Decode a GIF buffer into a sprite sheet in a worker. Rejects on any failure. */
  decode(buffer: ArrayBuffer, timeoutMs = 30_000): Promise<DecodedGifSheet> {
    return new Promise<DecodedGifSheet>((resolve, reject) => {
      let worker: Worker
      try {
        worker = new Worker(new URL('./gifDecode.worker.ts', import.meta.url))
      } catch (err) {
        reject(err)
        return
      }

      const timer = setTimeout(() => {
        worker.terminate()
        reject(new Error('GIF decode worker timed out'))
      }, timeoutMs)

      const done = () => { clearTimeout(timer); worker.terminate() }

      worker.onmessage = (e: MessageEvent<GifWorkerResult | GifWorkerError>) => {
        done()
        if (e.data.ok) {
          const { ok: _ok, ...sheet } = e.data
          resolve(sheet)
        } else {
          reject(new Error(e.data.error))
        }
      }
      worker.onerror = (e) => {
        done()
        reject(new Error(e.message || 'GIF decode worker error'))
      }

      worker.postMessage({ buffer }, [buffer])
    })
  }
}

export const gifDecodeWorkerClient = new GifDecodeWorkerClient()
