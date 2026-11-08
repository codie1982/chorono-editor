import { describe, expect, it, vi } from 'vitest'
import { RuntimeFrameScheduler, type RuntimeFrameSignal } from './RuntimeFrameScheduler'

/** Deterministic deferred frame service; callbacks queued during a turn wait
 * until the next turn, matching RAF without depending on wall-clock timing. */
function frames() {
  let id = 0
  const pending = new Map<number, FrameRequestCallback>()
  return {
    schedule: (callback: FrameRequestCallback) => { pending.set(++id, callback); return id },
    cancel: (key: number) => { pending.delete(key) },
    run: () => { const callbacks = Array.from(pending.values()); pending.clear(); callbacks.forEach(callback => callback(0)) },
    get size() { return pending.size },
  }
}

describe('RuntimeFrameScheduler', () => {
  it('allocates no idle task and coalesces input publication without replaying it', () => {
    const queue = frames(), publish = vi.fn(), owner = new RuntimeFrameScheduler(publish, queue.schedule, queue.cancel)
    owner.start(); owner.start()
    expect(queue.size).toBe(0)
    for (let i = 0; i < 100; i++) owner.invalidate()
    expect(queue.size).toBe(1)
    queue.run()
    expect(publish).toHaveBeenCalledExactlyOnceWith({ frameRevision: 1, segmentTick: 0, smTestTick: 0 })
    expect(queue.size).toBe(0)
    queue.run(); expect(publish).toHaveBeenCalledTimes(1)
  })

  it('publishes both continuous sources once per frame through one pending task', () => {
    const queue = frames(), signals: RuntimeFrameSignal[] = []
    const owner = new RuntimeFrameScheduler(signal => signals.push(signal), queue.schedule, queue.cancel)
    owner.setDemand(true, true); owner.start()
    for (let i = 0; i < 10; i++) {
      owner.invalidate(); expect(queue.size).toBe(1); queue.run(); expect(queue.size).toBe(1)
    }
    expect(signals).toHaveLength(10)
    expect(signals[9]).toEqual({ frameRevision: 10, segmentTick: 10, smTestTick: 10 })
    expect(signals[0]).toEqual({ frameRevision: 1, segmentTick: 1, smTestTick: 1 })
    owner.setDemand(false, false)
    expect(queue.size).toBe(0)
  })

  it('preserves queued input when continuous demand stops and retains inactive counters', () => {
    const queue = frames(), signals: RuntimeFrameSignal[] = []
    const owner = new RuntimeFrameScheduler(signal => signals.push(signal), queue.schedule, queue.cancel)
    owner.start(); owner.setDemand(true, false); queue.run()
    owner.invalidate(); owner.setDemand(false, false)
    expect(queue.size).toBe(1)
    queue.run(); expect(signals[1]).toEqual({ frameRevision: 2, segmentTick: 1, smTestTick: 0 })
    expect(queue.size).toBe(0)
    owner.setDemand(false, true); queue.run()
    expect(signals[2]).toEqual({ frameRevision: 3, segmentTick: 1, smTestTick: 1 })
    owner.stop()
  })

  it('cancels on stop but preserves dirty intent across StrictMode effect replay', () => {
    const queue = frames(), publish = vi.fn(), owner = new RuntimeFrameScheduler(publish, queue.schedule, queue.cancel)
    owner.invalidate(); expect(queue.size).toBe(0)
    owner.start(); expect(queue.size).toBe(1)
    owner.stop(); owner.stop(); queue.run()
    expect(publish).not.toHaveBeenCalled()
    owner.start(); queue.run()
    expect(publish).toHaveBeenCalledTimes(1)
    owner.stop(); owner.invalidate(); queue.run()
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('defers reentrant feedback and honors stop inside the publication callback', () => {
    const queue = frames(), revisions: number[] = []
    const owner = new RuntimeFrameScheduler(signal => {
      revisions.push(signal.frameRevision)
      if (signal.frameRevision === 1) owner.invalidate()
      else owner.stop()
    }, queue.schedule, queue.cancel)
    owner.start(); owner.invalidate(); queue.run()
    expect(revisions).toEqual([1]); expect(queue.size).toBe(1)
    queue.run(); expect(revisions).toEqual([1, 2]); expect(queue.size).toBe(0)
  })

  it('borrows the host playback clock without losing input at pause boundaries', () => {
    const queue = frames(), publish = vi.fn(), owner = new RuntimeFrameScheduler(publish, queue.schedule, queue.cancel)
    owner.start(); owner.setDemand(true, true, true); owner.invalidate()
    expect(queue.size).toBe(0)
    owner.acknowledge() // host evaluates/drains the current input
    owner.invalidate() // feedback produced during that evaluation
    owner.setDemand(false, false, false) // host stops before the next frame
    expect(queue.size).toBe(1)
    queue.run(); expect(publish).toHaveBeenCalledExactlyOnceWith({ frameRevision: 1, segmentTick: 0, smTestTick: 0 })
    owner.setDemand(false, false, true); owner.invalidate(); owner.acknowledge()
    owner.setDemand(false, false, false)
    expect(queue.size).toBe(0) // already-consumed input is not replayed at pause
  })
})
