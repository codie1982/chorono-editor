import { expect, it, vi } from 'vitest'
import { BoundedJobQueue, type JobExecutor } from './BoundedJobQueue'
import { SharedPreparationQueue } from './SharedPreparationQueue'

/** Controlled actual settlement; tests never infer release from elapsed time. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}

it('limits producer bodies across three independent owners and retains local FIFO/delivery', async () => {
  const executor = new BoundedJobQueue({ concurrency: 2 }), gates = Array.from({ length: 6 }, () => deferred<number>())
  let active = 0, peak = 0
  const starts: number[] = [], release = vi.fn()
  const owners = Array.from({ length: 3 }, () => new SharedPreparationQueue<number>({ label: 'Owner', concurrency: 2, executor, release }))
  const pending = gates.map((gate, i) => owners[Math.floor(i / 2)].request(String(i), async () => {
    active++; peak = Math.max(peak, active); starts.push(i)
    try { return await gate.promise } finally { active-- }
  }, value => value))
  await vi.waitFor(() => expect(executor.getSnapshot()).toMatchObject({ active: 2, queued: 4 }))
  expect(starts).toEqual([0, 1]); expect(owners[1].getSnapshot()).toMatchObject({ active: 2, executing: 0, waitingForExecutor: 2 })
  gates[0].resolve(0); expect(await pending[0]).toBe(0)
  await vi.waitFor(() => expect(starts).toEqual([0, 1, 2]))
  gates.forEach((gate, i) => gate.resolve(i))
  expect(await Promise.all(pending)).toEqual([0, 1, 2, 3, 4, 5]); expect(peak).toBe(2); expect(release).toHaveBeenCalledTimes(6)
  expect(executor.getSnapshot()).toMatchObject({ active: 0, queued: 0, completed: 6 })
  owners.forEach(owner => { expect(owner.getSnapshot()).toMatchObject({ active: 0, executing: 0, waitingForExecutor: 0 }); owner.dispose() })
})

it('holds both slots and input after active abort/disposal without cancelling another owner', async () => {
  const executor = new BoundedJobQueue({ concurrency: 1 }), native = deferred<object>(), started = deferred<void>()
  const release = vi.fn(), inputRelease = vi.fn(), discard = vi.fn(), abort = new AbortController()
  const a = new SharedPreparationQueue<object>({ label: 'A', executor, release, discard })
  const b = new SharedPreparationQueue<object>({ label: 'B', executor, release })
  const old = a.request('same', async () => { started.resolve(); return native.promise }, value => value, abort.signal, () => inputRelease)
  const cancelled = expect(old).rejects.toMatchObject({ name: 'AbortError' })
  const next = b.request('same', async () => ({}), value => value)
  await started.promise; abort.abort(); await cancelled; a.dispose()
  expect(executor.getSnapshot()).toMatchObject({ active: 1, queued: 1, closed: false })
  expect(a.getSnapshot()).toMatchObject({ active: 1, executing: 1 }); expect(inputRelease).not.toHaveBeenCalled()
  const value = {}; native.resolve(value); await next
  await vi.waitFor(() => expect(inputRelease).toHaveBeenCalledOnce())
  expect(discard).toHaveBeenCalledExactlyOnceWith('same', value); expect(release).toHaveBeenCalledOnce()
  expect(executor.getSnapshot()).toMatchObject({ active: 0, queued: 0, closed: false }); b.dispose()
})

it('deduplicates shared wait, cancels only the last consumer and releases waiting input without starting work', async () => {
  const executor = new BoundedJobQueue({ concurrency: 1 }), block = deferred<void>(), held = executor.submit(() => block.promise)
  const prepare = vi.fn(async () => 3), inputRelease = vi.fn(), release = vi.fn(), a = new AbortController(), b = new AbortController()
  const owner = new SharedPreparationQueue<number>({ label: 'Owner', executor, release })
  const one = owner.request('key', prepare, value => value, a.signal, () => inputRelease)
  const two = owner.request('key', prepare, value => value, b.signal)
  const cancelled = [expect(one).rejects.toMatchObject({ name: 'AbortError' }), expect(two).rejects.toMatchObject({ name: 'AbortError' })]
  await vi.waitFor(() => expect(executor.getSnapshot().queued).toBe(1))
  a.abort(); await cancelled[0]
  expect(executor.getSnapshot().queued).toBe(1); expect(inputRelease).not.toHaveBeenCalled()
  b.abort(); await cancelled[1]
  await vi.waitFor(() => expect(owner.getSnapshot()).toMatchObject({ active: 0, waitingForExecutor: 0 }))
  expect(executor.getSnapshot().queued).toBe(0); expect(prepare).not.toHaveBeenCalled(); expect(inputRelease).toHaveBeenCalledOnce()
  expect(release).not.toHaveBeenCalled(); block.resolve(); await held; owner.dispose()
})

it('discards exactly once when abort wins after shared delivery but before local settlement', async () => {
  const shared = new BoundedJobQueue(), abort = new AbortController(), value = {}, discard = vi.fn(), release = vi.fn()
  const executor: JobExecutor = { async submit(work, options) {
    const result = await shared.submit(work, options)
    abort.abort() // deterministic shared → local ownership handoff race
    return result
  } }
  const owner = new SharedPreparationQueue<object>({ label: 'Race', executor, release, discard })
  await expect(owner.request('key', async () => value, result => result, abort.signal)).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(owner.getSnapshot().active).toBe(0))
  expect(discard).toHaveBeenCalledExactlyOnceWith('key', value); expect(release).not.toHaveBeenCalled()
  expect(shared.getSnapshot()).toMatchObject({ active: 0, queued: 0 }); owner.dispose()
})

it('rejects aggregate overflow before producer work and balances input/wait counters', async () => {
  const executor = new BoundedJobQueue({ concurrency: 1, maxQueued: 0 }), block = deferred<void>(), held = executor.submit(() => block.promise)
  const releaseInput = vi.fn(), prepare = vi.fn(async () => 1), owner = new SharedPreparationQueue<number>({ label: 'Full', executor, release() {} })
  await expect(owner.request('key', prepare, value => value, undefined, () => releaseInput)).rejects.toThrow('full')
  expect(prepare).not.toHaveBeenCalled(); expect(releaseInput).toHaveBeenCalledOnce()
  expect(owner.getSnapshot()).toMatchObject({ active: 0, queued: 0, executing: 0, waitingForExecutor: 0 })
  expect(executor.getSnapshot()).toMatchObject({ active: 1, denied: 1 }); block.resolve(); await held; owner.dispose()
})
