import { afterEach, expect, it, vi } from 'vitest'
import { GifDecodeWorkerClient } from '../../workers/GifDecodeWorkerClient'
import type { GifWorkerHandle, GifWorkerReply, GifWorkerRequest } from '../workerProtocol'
import { GifBackendUnavailable, resolveGifLimits } from '../types'
import { planGifSheet } from '../planGifSheet'
import { animatedGif } from './gifFixtures'

const limits = resolveGifLimits(), plan = planGifSheet({ width: 4, height: 4, frameCount: 3 }, limits)
const sheet = () => ({ blob: new Blob(['PNG']), sheetWidth: 8, sheetHeight: 8, frameWidth: 4, frameHeight: 4, frameCount: 3, columns: 2, rows: 2, avgFrameMs: 200 })

/** Deterministic Worker port with REAL ArrayBuffer transfer/detachment, but no
 * codec: this tests transport cleanup/protocol, not native decoding/pixels. */
class FakeWorker implements GifWorkerHandle {
  onmessage: GifWorkerHandle['onmessage'] = null
  onerror: GifWorkerHandle['onerror'] = null
  onmessageerror: GifWorkerHandle['onmessageerror'] = null
  readonly sent: GifWorkerRequest[] = []
  readonly terminate = vi.fn()
  failPost = false
  postMessage(message: GifWorkerRequest, transfer: Transferable[] = []) {
    if (this.failPost) throw new Error('postMessage failed')
    this.sent.push(structuredClone(message, { transfer }))
  }
  emit(reply: GifWorkerReply) { this.onmessage?.(new MessageEvent('message', { data: reply })) }
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('waits for support before transferring and detaches every callback/timer at result handoff', async () => {
  vi.useFakeTimers()
  const worker = new FakeWorker(), client = new GifDecodeWorkerClient({ createWorker: () => worker }), buffer = animatedGif().buffer
  const pending = client.compose(buffer, plan, limits)
  expect(buffer.byteLength).toBe(147); expect(worker.sent).toHaveLength(0)
  worker.emit({ kind: 'ready', supported: true }); expect(buffer.byteLength).toBe(0)
  worker.emit({ kind: 'result', sheet: sheet() }); expect((await pending).frameCount).toBe(3)
  expect(worker.terminate).toHaveBeenCalledOnce(); expect(worker.onmessage).toBeNull(); expect(worker.onerror).toBeNull(); expect(vi.getTimerCount()).toBe(0)
})

it('unsupported setup never consumes input and pre-abort starts no worker', async () => {
  const worker = new FakeWorker(), create = vi.fn(() => worker), client = new GifDecodeWorkerClient({ createWorker: create }), buffer = animatedGif().buffer
  const pending = client.compose(buffer, plan, limits)
  worker.emit({ kind: 'ready', supported: false }); await expect(pending).rejects.toBeInstanceOf(GifBackendUnavailable)
  expect(buffer.byteLength).toBe(147); expect(worker.sent).toHaveLength(0); expect(worker.terminate).toHaveBeenCalledOnce()
  const abort = new AbortController(); abort.abort()
  await expect(client.compose(buffer, plan, limits, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(create).toHaveBeenCalledOnce()
})

it('cooperative abort retains the worker until actual cleanup acknowledgement', async () => {
  const worker = new FakeWorker(), client = new GifDecodeWorkerClient({ createWorker: () => worker }), abort = new AbortController()
  const detach = vi.spyOn(abort.signal, 'removeEventListener')
  const pending = client.compose(animatedGif().buffer, plan, limits, { signal: abort.signal }), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  worker.emit({ kind: 'ready', supported: true }); abort.abort()
  expect(worker.sent.map(x => x.kind)).toEqual(['decode', 'cancel']); expect(worker.terminate).not.toHaveBeenCalled()
  worker.emit({ kind: 'error', name: 'AbortError', message: 'native cleanup settled' }); await rejected
  expect(worker.terminate).toHaveBeenCalledOnce(); expect(detach).toHaveBeenCalledOnce()
})

it('timeout terminates once; postMessage throw, message decode failure and setup failures leak no timer/listener', async () => {
  vi.useFakeTimers()
  for (const timeoutMs of [Infinity, 0, 0.5, 2147483648]) expect(() => new GifDecodeWorkerClient({ timeoutMs })).toThrow(RangeError)
  const worker = new FakeWorker(), client = new GifDecodeWorkerClient({ createWorker: () => worker, timeoutMs: 100 })
  const pending = client.compose(animatedGif().buffer, plan, limits), rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
  await vi.advanceTimersByTimeAsync(100); await rejected
  expect(worker.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  const bad = new FakeWorker(); bad.failPost = true
  const abort = new AbortController(), remove = vi.spyOn(abort.signal, 'removeEventListener')
  const failed = new GifDecodeWorkerClient({ createWorker: () => bad }).compose(animatedGif().buffer, plan, limits, { signal: abort.signal })
  bad.emit({ kind: 'ready', supported: true }); await expect(failed).rejects.toThrow('postMessage failed')
  expect(bad.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalledOnce()
  const message = new FakeWorker(), broken = new GifDecodeWorkerClient({ createWorker: () => message }).compose(animatedGif().buffer, plan, limits)
  message.onmessageerror?.(new MessageEvent('messageerror')); await expect(broken).rejects.toThrow('message')
  expect(message.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  await expect(new GifDecodeWorkerClient({ createWorker: () => { throw new Error('CSP') } }).compose(animatedGif().buffer, plan, limits)).rejects.toBeInstanceOf(GifBackendUnavailable)
  expect(vi.getTimerCount()).toBe(0)
})
