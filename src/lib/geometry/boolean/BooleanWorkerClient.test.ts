import { it, expect, vi, afterEach } from 'vitest'
import { BooleanWorkerClient } from './BooleanWorkerClient'
import type { BooleanWorkerHandle } from './workerProtocol'
import type { BooleanRequest, BooleanResult } from './types'

const request: BooleanRequest = { operation: 'union', reverse: false, tolerancePx: .25, operands: [] }
const result: BooleanResult = { path: { commands: [], closed: false }, polygons: 0, holes: 0, inputVertices: 0, outputVertices: 0, tolerancePx: .25 }
/** Transport fake tests lifecycle, not the geometry algorithm or native worker. */
function handle() {
  const worker: BooleanWorkerHandle = { onmessage: null, onerror: null, onmessageerror: null, postMessage: () => {}, terminate: () => {} }
  return { ...worker, postMessage: vi.fn<(request: BooleanRequest) => void>(), terminate: vi.fn<() => void>() }
}
afterEach(() => vi.useRealTimers())
it('releases a successful worker exactly once and detaches handlers', async () => {
  const worker = handle(), client = new BooleanWorkerClient({ createWorker: () => worker }), controller = new AbortController()
  const pending = client.execute(request, controller.signal)
  worker.onmessage!({ data: { kind: 'result', result } } as MessageEvent)
  expect(await pending).toEqual(result); controller.abort()
  expect(worker.terminate).toHaveBeenCalledTimes(1); expect(worker.onmessage).toBeNull()
})
it('handles pre-abort, in-flight abort and late replies without retaining workers', async () => {
  const worker = handle(), factory = vi.fn(() => worker), client = new BooleanWorkerClient({ createWorker: factory }), controller = new AbortController()
  controller.abort(); await expect(client.execute(request, controller.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(factory).not.toHaveBeenCalled()
  const active = new AbortController(), pending = client.execute(request, active.signal), reply = worker.onmessage!
  active.abort(); reply({ data: { kind: 'result', result } } as MessageEvent)
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(worker.terminate).toHaveBeenCalledTimes(1)
})
it('terminates timeout/error/post failures without retries', async () => {
  vi.useFakeTimers()
  const worker = handle(), client = new BooleanWorkerClient({ createWorker: () => worker, timeoutMs: 20 })
  const pending = client.execute(request, new AbortController().signal), expectation = expect(pending).rejects.toThrow(/deadline/)
  await vi.advanceTimersByTimeAsync(20); await expectation; expect(worker.terminate).toHaveBeenCalledTimes(1)
  const broken = handle(); broken.postMessage.mockImplementation(() => { throw new Error('post failed') })
  await expect(new BooleanWorkerClient({ createWorker: () => broken }).execute(request, new AbortController().signal)).rejects.toThrow('post failed')
  expect(broken.terminate).toHaveBeenCalledTimes(1)
  const invalid = handle(), rejected = new BooleanWorkerClient({ createWorker: () => invalid }).execute(request, new AbortController().signal)
  invalid.onmessage!({ data: { kind: 'error', message: 'Invalid contour' } } as MessageEvent)
  await expect(rejected).rejects.toThrow('Invalid contour'); expect(invalid.terminate).toHaveBeenCalledTimes(1)
})
