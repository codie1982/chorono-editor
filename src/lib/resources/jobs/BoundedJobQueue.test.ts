import { describe, expect, it, vi } from 'vitest'
import { BoundedJobQueue } from './BoundedJobQueue'

/** Controllable native completion; no timers or microtask-count assumptions. */
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('bounded resource jobs', () => {
  it('keeps FIFO, caps active and pending work, and rejects before invoking excess jobs', async () => {
    const queue = new BoundedJobQueue({ concurrency: 2, maxQueued: 1 })
    const one = deferred<number>(), two = deferred<number>(), order: string[] = []
    const a = queue.submit(() => { order.push('a'); return one.promise })
    const b = queue.submit(() => { order.push('b'); return two.promise })
    const c = queue.submit(() => { order.push('c'); return 3 })
    const excess = vi.fn()
    await expect(queue.submit(excess)).rejects.toThrow('full')
    expect(queue.getSnapshot()).toMatchObject({ active: 2, queued: 1, denied: 1 })
    expect(order).toEqual(['a', 'b']); expect(excess).not.toHaveBeenCalled()
    two.resolve(2); expect(await b).toBe(2); expect(await c).toBe(3)
    expect(order).toEqual(['a', 'b', 'c'])
    one.resolve(1); await a
    expect(queue.getSnapshot()).toMatchObject({ active: 0, queued: 0, completed: 3 })
  })

  it('does not free a non-abortable active slot until settlement and discards late owned results', async () => {
    const queue = new BoundedJobQueue(), native = deferred<{ dispose(): void }>()
    const started = deferred<void>()
    const cancel = new AbortController(), dispose = vi.fn(), next = vi.fn(() => 'next')
    const active = queue.submit(() => { started.resolve(); return native.promise }, { signal: cancel.signal, discard: result => result.dispose() })
    const rejected = expect(active).rejects.toMatchObject({ name: 'AbortError' })
    const pending = queue.submit(next)
    await started.promise
    cancel.abort(); cancel.abort()
    expect(queue.getSnapshot()).toMatchObject({ active: 1, queued: 1, cancelled: 1 })
    expect(next).not.toHaveBeenCalled(); expect(dispose).not.toHaveBeenCalled()
    native.resolve({ dispose }); await rejected
    expect(dispose).toHaveBeenCalledOnce(); expect(await pending).toBe('next')
    expect(queue.getSnapshot()).toMatchObject({ active: 0, completed: 1, failed: 0, cancelled: 1 })
  })

  it('removes queued cancellation and detaches listeners without starting it', async () => {
    const queue = new BoundedJobQueue(), native = deferred<void>(), cancel = new AbortController()
    const remove = vi.spyOn(cancel.signal, 'removeEventListener'), work = vi.fn()
    const active = queue.submit(() => native.promise)
    const pending = queue.submit(work, { signal: cancel.signal })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    cancel.abort(); await rejected
    expect(queue.getSnapshot()).toMatchObject({ active: 1, queued: 0, cancelled: 1 })
    expect(remove).toHaveBeenCalledOnce(); expect(work).not.toHaveBeenCalled()
    native.resolve(); await active
  })

  it('cancels a generation, permits new work after native settlement, and closes idempotently', async () => {
    const queue = new BoundedJobQueue(), native = deferred<void>()
    const active = queue.submit(() => native.promise)
    const rejectedActive = expect(active).rejects.toMatchObject({ name: 'AbortError' })
    const pending = queue.submit(() => 'old')
    const rejectedPending = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    queue.cancelAll(); queue.cancelAll()
    const fresh = queue.submit(() => 'new')
    expect(queue.getSnapshot()).toMatchObject({ active: 1, queued: 1, cancelled: 2 })
    native.resolve(); await Promise.all([rejectedActive, rejectedPending]); expect(await fresh).toBe('new')
    queue.dispose(); queue.dispose()
    await expect(queue.submit(vi.fn())).rejects.toThrow('disposed')
    expect(queue.getSnapshot()).toMatchObject({ active: 0, queued: 0, closed: true })
  })

  it('handles sync failure, cleanup failure and pre-aborted inputs without poisoning the queue', async () => {
    const queue = new BoundedJobQueue({ maxQueued: 0 })
    await expect(queue.submit(() => { throw new Error('sync failure') })).rejects.toThrow('sync failure')
    const abort = new AbortController(); abort.abort()
    const never = vi.fn()
    await expect(queue.submit(never, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(never).not.toHaveBeenCalled()
    const native = deferred<number>(), cancel = new AbortController(), started = deferred<void>()
    const task = queue.submit(() => { started.resolve(); return native.promise }, { signal: cancel.signal, discard: () => { throw new Error('cleanup failure') } })
    const rejected = expect(task).rejects.toThrow('cleanup failure')
    await started.promise
    cancel.abort(); native.resolve(1); await rejected
    expect(await queue.submit(() => 4)).toBe(4)
    expect(queue.getSnapshot()).toMatchObject({ active: 0, failed: 2 })
  })

  it('validates finite integer limits and snapshots have no mutable queue state', async () => {
    for (const options of [{ concurrency: 0 }, { concurrency: 1.5 }, { maxQueued: -1 }, { maxQueued: Infinity }]) {
      expect(() => new BoundedJobQueue(options)).toThrow(RangeError)
    }
    const queue = new BoundedJobQueue(), snapshot = queue.getSnapshot()
    snapshot.active = 99
    expect(queue.getSnapshot().active).toBe(0)
    expect(await queue.submit(() => 1)).toBe(1)
  })
})
