import { afterEach, expect, it, vi } from 'vitest'
import { RigidBodyWorkerClient } from '../rigid/RigidBodyWorkerClient'
import type {
  RigidBodyWorkerHandle,
  RigidBodyWorkerReply,
  RigidBodyWorkerRequest,
} from '../rigid/RigidBodyWorkerProtocol'
import { rigidBakeFixture } from './RigidBodyBakeFixture'

/** Deterministic Worker port for transport/lifecycle tests, not Matter output. */
class FakeWorker implements RigidBodyWorkerHandle {
  onmessage: RigidBodyWorkerHandle['onmessage'] = null
  onerror: RigidBodyWorkerHandle['onerror'] = null
  onmessageerror: RigidBodyWorkerHandle['onmessageerror'] = null
  readonly sent: RigidBodyWorkerRequest[] = []
  readonly terminate = vi.fn()
  failPost = false

  postMessage(message: RigidBodyWorkerRequest): void {
    if (this.failPost) throw new Error('postMessage failed')
    this.sent.push(structuredClone(message))
  }

  emit(reply: RigidBodyWorkerReply): void {
    this.onmessage?.(new MessageEvent('message', { data: reply }))
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('handshakes, forwards monotonic solver progress and accepts transferred dense buffers', async () => {
  vi.useFakeTimers()
  const worker = new FakeWorker()
  const client = new RigidBodyWorkerClient({ createWorker: () => worker })
  const { recipe } = rigidBakeFixture()
  const progress = vi.fn()
  const pending = client.simulate(recipe, { signal: new AbortController().signal, reportProgress: progress })

  expect(worker.sent).toHaveLength(0)
  worker.emit({ kind: 'ready', supported: true })
  expect(worker.sent).toHaveLength(1)
  expect(worker.sent[0]).toMatchObject({ kind: 'simulate', recipe: { recipeHash: recipe.recipeHash } })
  worker.emit({ kind: 'progress', tick: 64, totalTicks: 360 })
  const sampleTimes = new Float64Array(91)
  const poses = new Float64Array(91 * 2 * 3)
  worker.emit({
    kind: 'result',
    sampleTimesBuffer: sampleTimes.buffer,
    posesBuffer: poses.buffer,
    events: [{ kind: 'contact-start', tick: 120, timeMs: 1000, bodyIds: ['rigid:box', 'rigid:floor'] }],
  })

  await expect(pending).resolves.toMatchObject({ execution: 'worker', events: [
    { kind: 'contact-start', tick: 120, timeMs: 1000 },
  ] })
  expect(progress).toHaveBeenCalledWith({ tick: 64, totalTicks: 360 })
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(worker.onmessage).toBeNull()
  expect(worker.onerror).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

it('retains a running worker until cooperative cancellation is acknowledged', async () => {
  const worker = new FakeWorker()
  const client = new RigidBodyWorkerClient({ createWorker: () => worker })
  const controller = new AbortController()
  const remove = vi.spyOn(controller.signal, 'removeEventListener')
  const pending = client.simulate(rigidBakeFixture().recipe, {
    signal: controller.signal,
    reportProgress: () => {},
  })
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })

  worker.emit({ kind: 'ready', supported: true })
  controller.abort()
  expect(worker.sent.map(message => message.kind)).toEqual(['simulate', 'cancel'])
  expect(worker.terminate).not.toHaveBeenCalled()
  worker.emit({ kind: 'error', name: 'AbortError', message: 'solver cleanup settled' })

  await rejected
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(remove).toHaveBeenCalledOnce()
})

it('rejects invalid output and cleans timeout, setup and message failures', async () => {
  vi.useFakeTimers()
  for (const timeoutMs of [Infinity, 0, 0.5, 2147483648]) {
    expect(() => new RigidBodyWorkerClient({ timeoutMs })).toThrow(RangeError)
  }
  const { recipe } = rigidBakeFixture()
  const timeoutWorker = new FakeWorker()
  const timeout = new RigidBodyWorkerClient({ createWorker: () => timeoutWorker, timeoutMs: 100 })
    .simulate(recipe, { signal: new AbortController().signal, reportProgress: () => {} })
  const timedOut = expect(timeout).rejects.toMatchObject({ name: 'TimeoutError' })
  await vi.advanceTimersByTimeAsync(100)
  await timedOut
  expect(timeoutWorker.terminate).toHaveBeenCalledOnce()

  const invalidWorker = new FakeWorker()
  const invalid = new RigidBodyWorkerClient({ createWorker: () => invalidWorker })
    .simulate(recipe, { signal: new AbortController().signal, reportProgress: () => {} })
  invalidWorker.emit({ kind: 'ready', supported: true })
  invalidWorker.emit({
    kind: 'result',
    sampleTimesBuffer: new Float64Array(1).buffer,
    posesBuffer: new Float64Array(1).buffer,
    events: [],
  })
  await expect(invalid).rejects.toThrow(/dimensions/)
  expect(invalidWorker.terminate).toHaveBeenCalledOnce()

  const postWorker = new FakeWorker()
  postWorker.failPost = true
  const post = new RigidBodyWorkerClient({ createWorker: () => postWorker })
    .simulate(recipe, { signal: new AbortController().signal, reportProgress: () => {} })
  postWorker.emit({ kind: 'ready', supported: true })
  await expect(post).rejects.toThrow('postMessage failed')
  expect(postWorker.terminate).toHaveBeenCalledOnce()

  await expect(new RigidBodyWorkerClient({ createWorker: () => { throw new Error('CSP') } })
    .simulate(recipe, { signal: new AbortController().signal, reportProgress: () => {} }))
    .rejects.toMatchObject({ name: 'RigidBodyWorkerUnavailable' })
  expect(vi.getTimerCount()).toBe(0)
})

it('rejects untrusted solver events with invalid time, identity, cardinality or ordering', async () => {
  const { recipe } = rigidBakeFixture()
  const invalidEvents: Array<Extract<RigidBodyWorkerReply, { kind: 'result' }>['events']> = [
    [{ kind: 'contact-start', tick: 0, timeMs: 0, bodyIds: ['rigid:box', 'rigid:floor'] }],
    [{ kind: 'contact-start', tick: 120, timeMs: 999, bodyIds: ['rigid:box', 'rigid:floor'] }],
    [{ kind: 'sleep-start', tick: 120, timeMs: 1000, bodyIds: ['unknown'] }],
    [{ kind: 'contact-start', tick: 120, timeMs: 1000, bodyIds: ['rigid:box'] }],
    [{ kind: 'sleep-start', tick: 120, timeMs: 1000, bodyIds: ['rigid:box', 'rigid:floor'] }],
    [{ kind: 'contact-start', tick: 120, timeMs: 1000, bodyIds: ['rigid:floor', 'rigid:box'] }],
    [
      { kind: 'sleep-start', tick: 200, timeMs: 5000 / 3, bodyIds: ['rigid:box'] },
      { kind: 'sleep-end', tick: 100, timeMs: 2500 / 3, bodyIds: ['rigid:box'] },
    ],
  ]

  for (const events of invalidEvents) {
    const worker = new FakeWorker()
    const pending = new RigidBodyWorkerClient({ createWorker: () => worker })
      .simulate(recipe, { signal: new AbortController().signal, reportProgress: () => {} })
    worker.emit({ kind: 'ready', supported: true })
    worker.emit({
      kind: 'result',
      sampleTimesBuffer: new Float64Array(91).buffer,
      posesBuffer: new Float64Array(91 * 2 * 3).buffer,
      events,
    })
    await expect(pending).rejects.toThrow(/event payload/)
    expect(worker.terminate).toHaveBeenCalledOnce()
  }
})
