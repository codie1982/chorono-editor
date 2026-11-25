import { expect, it, vi } from 'vitest'
import { OutlineWorkerClient } from './OutlineWorkerClient'
import type { OneShotWorkerHandle } from '../../resources/jobs/OneShotWorkerClient'
import type { OutlineRequest, OutlineResult } from './types'

const request: OutlineRequest = { inputs: [], distancePx: 20, side: 'left', join: 'miter', miterLimit: 4, tolerancePx: .25 }
const result: OutlineResult = { objects: [], inputVertices: 0, outputVertices: 0, bevelFallbacks: 0, tolerancePx: .25 }

/** Exercise actual bounded admission and one-shot lifecycle using transport
 * handles; geometry and real Worker execution have separate native tests. */
it('serializes Outline CPU workers, cancels queued requests before allocation and releases active workers', async () => {
  const workers: Array<OneShotWorkerHandle<OutlineRequest, OutlineResult>> = []
  const client = new OutlineWorkerClient({ createWorker: () => {
    const worker = { onmessage: null, onerror: null, onmessageerror: null, postMessage: vi.fn(), terminate: vi.fn() } as OneShotWorkerHandle<OutlineRequest, OutlineResult>
    workers.push(worker); return worker
  } })
  const first = new AbortController(), queued = new AbortController()
  const a = client.execute(request, first.signal), b = client.execute(request, queued.signal), rejected = expect(b).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(workers).toHaveLength(1)); queued.abort(); await rejected
  workers[0].onmessage!({ data: { kind: 'result', result } } as MessageEvent)
  expect(await a).toEqual(result); expect(workers[0].terminate).toHaveBeenCalledTimes(1)
  const active = client.execute(request, first.signal)
  await vi.waitFor(() => expect(workers).toHaveLength(2)); first.abort()
  await expect(active).rejects.toMatchObject({ name: 'AbortError' }); expect(workers[1].terminate).toHaveBeenCalledTimes(1)
  expect(workers[1].onmessage).toBeNull()
})
