import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasSurfacePool } from '@/lib/render/resources/CanvasSurfacePool'
import { observeResourceMonitor } from './observeResourceMonitor'

/** Page visibility double; emits the same event consumed by the mounted panel. */
class Visibility extends EventTarget {
  hidden = false
  setHidden(hidden: boolean): void {
    this.hidden = hidden
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

afterEach(() => vi.useRealTimers())

describe('resource monitor observation lifecycle', () => {
  it('coalesces pushed changes without polling during idle', () => {
    vi.useFakeTimers()
    let changed = () => {}
    const release = vi.fn(), read = vi.fn(() => ({})), publish = vi.fn()
    const source = { getSnapshot: read, subscribe: (listener: () => void) => { changed = listener; return release } }
    const stop = observeResourceMonitor(source, new Visibility(), publish)
    expect(read).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(10000)
    expect(read).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 100; i++) changed()
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(499); expect(read).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1); expect(read).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
    stop(); stop(); expect(release).toHaveBeenCalledTimes(1)
  })
  it('detaches pushed observation and cancels a pending refresh while hidden or stopped', () => {
    vi.useFakeTimers()
    const visibility = new Visibility(), read = vi.fn(() => ({})), release = vi.fn()
    let changed = () => {}
    const subscribe = vi.fn((listener: () => void) => { changed = listener; return release })
    const stop = observeResourceMonitor({ getSnapshot: read, subscribe }, visibility, () => {})
    changed(); visibility.setHidden(true)
    expect(release).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
    changed(); vi.advanceTimersByTime(1000); expect(read).toHaveBeenCalledTimes(1)
    visibility.setHidden(false)
    expect(read).toHaveBeenCalledTimes(2); expect(subscribe).toHaveBeenCalledTimes(2)
    changed(); stop()
    expect(release).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0)
    changed(); vi.advanceTimersByTime(1000); expect(read).toHaveBeenCalledTimes(2)
  })
  it('releases optional GPU observation while hidden and reacquires only when visible', () => {
    vi.useFakeTimers()
    const release = vi.fn()
    const source = { getSnapshot: () => ({}), observe: vi.fn(() => release) }
    const visibility = new Visibility()
    const stop = observeResourceMonitor(source, visibility, () => {})
    expect(source.observe).toHaveBeenCalledTimes(1)
    visibility.setHidden(true)
    expect(release).toHaveBeenCalledTimes(1)
    visibility.setHidden(false)
    expect(source.observe).toHaveBeenCalledTimes(2)
    stop()
    expect(release).toHaveBeenCalledTimes(2)
  })
  it('polls at 500 ms, stops when hidden, refreshes on resume and detaches on close/pause', () => {
    vi.useFakeTimers()
    const source = new CanvasSurfacePool()
    const get = vi.spyOn(source, 'getSnapshot')
    const visibility = new Visibility()
    const publish = vi.fn()
    const stop = observeResourceMonitor(source, visibility, publish)
    expect(get).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(499)
    expect(publish).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(publish).toHaveBeenCalledTimes(2)
    visibility.setHidden(true)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(5000)
    expect(publish).toHaveBeenCalledTimes(2)
    visibility.setHidden(false)
    expect(publish).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(1)
    stop(); stop()
    expect(vi.getTimerCount()).toBe(0)
    visibility.setHidden(false)
    vi.advanceTimersByTime(5000)
    expect(publish).toHaveBeenCalledTimes(3)
    source.dispose()
  })

  it('creates no timer when mounted in a hidden document, including after a strict-mode remount', () => {
    vi.useFakeTimers()
    const source = new CanvasSurfacePool()
    const visibility = new Visibility()
    visibility.hidden = true
    const publish = vi.fn()
    const first = observeResourceMonitor(source, visibility, publish)
    expect(publish).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    first()
    const second = observeResourceMonitor(source, visibility, publish)
    visibility.setHidden(false)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    second()
    expect(vi.getTimerCount()).toBe(0)
    source.dispose()
  })

  it('reflects actual allocation/reuse/cleanup counters while preserving an active lease', () => {
    vi.useFakeTimers()
    const source = new CanvasSurfacePool({
      maxBytes: 64,
      createCanvas: (width, height) => ({ width, height, getContext: () => ({}) }) as unknown as HTMLCanvasElement,
    })
    const visibility = new Visibility()
    const publish = vi.fn()
    const stop = observeResourceMonitor(source, visibility, publish)
    const active = source.acquire(2, 2)
    const idle = source.acquire(2, 2)
    idle.release()
    vi.advanceTimersByTime(500)
    expect(publish.mock.lastCall?.[0]).toMatchObject({ residentBytes: 32, activeBytes: 16, idleBytes: 16, allocations: 2 })
    const reused = source.acquire(2, 2)
    reused.release()
    source.clearIdle()
    vi.advanceTimersByTime(500)
    expect(publish.mock.lastCall?.[0]).toMatchObject({ residentBytes: 16, activeSurfaces: 1, idleSurfaces: 0, reuses: 1, evictions: 1 })
    expect(active.canvas.width).toBe(2)
    stop()
    active.release()
    source.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})
