import { createRectangleSpline } from '../index'
import { expect, it, vi } from 'vitest'
import { ChamferWorkerClient } from './ChamferWorkerClient'
import type { OneShotWorkerHandle } from '../../resources/jobs/OneShotWorkerClient'
import type { ChamferRequest, ChamferResult } from './types'

const request: ChamferRequest = { data: createRectangleSpline({ width: 100, height: 80 }), pointIds: [], distancePx: 10, matrix: [1, 0, 0, 1, 0, 0] }
const result: ChamferResult = { data: request.data, path: { commands: [], closed: false }, cuts: [], markers: [] }

/** Exercise actual bounded admission and one-shot lifecycle using transport
 * handles; geometry and real Worker execution have separate native tests. */
it('serializes Chamfer CPU workers, cancels queued requests before allocation and releases active workers', async () => {
  const workers: Array<OneShotWorkerHandle<ChamferRequest, ChamferResult>> = []
  const client = new ChamferWorkerClient({ createWorker: () => {
    const worker = { onmessage: null, onerror: null, onmessageerror: null, postMessage: vi.fn(), terminate: vi.fn() } as OneShotWorkerHandle<ChamferRequest, ChamferResult>
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
