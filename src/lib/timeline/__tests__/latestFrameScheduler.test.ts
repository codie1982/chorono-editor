import { describe, expect, it, vi } from 'vitest'
import { createLatestFrameScheduler } from '../latestFrameScheduler'

function frameQueue() {
  let id = 0
  const queue = new Map<number, FrameRequestCallback>()
  return {
    schedule: (cb: FrameRequestCallback) => { queue.set(++id, cb); return id },
    cancel: (key: number) => { queue.delete(key) },
    run: () => { const entries = Array.from(queue.values()); queue.clear(); entries.forEach(cb => cb(16)) },
    get size() { return queue.size },
  }
}

describe('latest pointer sample per frame', () => {
  it('renders the last of several mouse moves before a frame', () => {
    const frames = frameQueue()
    const preview = vi.fn()
    const scheduler = createLatestFrameScheduler(preview, frames.schedule, frames.cancel)
    scheduler.push({ delta: 10, snap: 100 })
    scheduler.push({ delta: 90, snap: null })
    expect(frames.size).toBe(1)
    frames.run()
    expect(preview).toHaveBeenCalledExactlyOnceWith({ delta: 90, snap: null })
  })

  it('flushes the final sample before pointerup commits without a later stale frame', () => {
    const frames = frameQueue()
    const events: string[] = []
    const scheduler = createLatestFrameScheduler<number>(delta => events.push(`preview:${delta}`), frames.schedule, frames.cancel)
    scheduler.push(10)
    scheduler.push(90)
    scheduler.flush()
    events.push('commit:90')
    frames.run()
    expect(events).toEqual(['preview:90', 'commit:90'])
  })

  it('cancels pending work on Escape/unmount and cannot leak into the next drag', () => {
    const frames = frameQueue()
    const preview = vi.fn()
    const scheduler = createLatestFrameScheduler(preview, frames.schedule, frames.cancel)
    scheduler.push(90)
    scheduler.cancel()
    scheduler.push(5)
    frames.run()
    expect(preview).toHaveBeenCalledExactlyOnceWith(5)
  })
})
