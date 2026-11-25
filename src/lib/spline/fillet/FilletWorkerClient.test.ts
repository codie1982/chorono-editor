import { createRectangleSpline } from '../index'
import { expect, it, vi } from 'vitest'
import { FilletWorkerClient } from './FilletWorkerClient'
import type { OneShotWorkerHandle } from '../../resources/jobs/OneShotWorkerClient'
import type { FilletRequest, FilletResult } from './types'

const request: FilletRequest = { data: createRectangleSpline({ width: 100, height: 80 }), pointIds: [], radiusPx: 10, matrix: [1, 0, 0, 1, 0, 0] }
const result: FilletResult = { data: request.data, path: { commands: [], closed: false }, cuts: [], markers: [], arcs: [] }

/** Exercise actual bounded admission and one-shot lifecycle using transport
 * handles; geometry and real Worker execution have separate native tests. */
it('serializes Fillet CPU workers, cancels queued requests before allocation and releases active workers', async () => {
  const workers: Array<OneShotWorkerHandle<FilletRequest, FilletResult>> = []
  const client = new FilletWorkerClient({ createWorker: () => {
    const worker = { onmessage: null, onerror: null, onmessageerror: null, postMessage: vi.fn(), terminate: vi.fn() } as OneShotWorkerHandle<FilletRequest, FilletResult>
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
