import { describe, expect, it } from 'vitest'
import { RenderWorkMonitor } from './RenderWorkMonitor'

describe('render work measurement', () => {
  it('bounds each stage, keeps independent scope, and expires static work from recent rates', () => {
    const monitor = new RenderWorkMonitor()
    for (let i = 0; i < 3000; i++) monitor.record('viewport', 2, 1000)
    monitor.record('evaluation', 3, 1000)
    const snapshot = monitor.getSnapshot(1500)
    expect(snapshot.viewport).toMatchObject({ count: 120, meanMs: 2, p95Ms: 2, measuredMsPerSecond: 240 })
    expect(snapshot.evaluation).toMatchObject({ count: 1, meanMs: 3 })
    expect(monitor.getSnapshot(7000).viewport).toMatchObject({ count: 0, recentPerSecond: 0, meanMs: null, lastMs: 2 })
  })
  it('records failing synchronous work and preserves its exception/value', () => {
    const monitor = new RenderWorkMonitor()
    expect(monitor.measure('evaluation', () => 42)).toBe(42)
    expect(() => monitor.measure('viewport', () => { throw new Error('render failed') })).toThrow('render failed')
    expect(monitor.getSnapshot().viewport.count).toBe(1)
    expect(monitor.getSnapshot().evaluation.count).toBe(1)
  })
  it('exposes detached last samples independently of expired rate windows', () => {
    const monitor = new RenderWorkMonitor()
    expect(monitor.getLastSample('viewport')).toBeNull()
    monitor.record('viewport', 12, 100)
    Object.assign(monitor.getLastSample('viewport')!, { ms: 999 })
    expect(monitor.getLastSample('viewport')).toEqual({ ms: 12, at: 100 })
    expect(monitor.getSnapshot(10000).viewport.recentPerSecond).toBe(0)
    expect(monitor.getLastSample('viewport')?.ms).toBe(12)
  })
  it('notifies only actual stage samples and owns duplicate subscriptions independently', () => {
    const monitor = new RenderWorkMonitor()
    let calls = 0
    const changed = () => { calls++ }
    const releaseA = monitor.subscribe('viewport', changed), releaseB = monitor.subscribe('viewport', changed)
    expect(calls).toBe(0)
    monitor.record('evaluation', 1); monitor.record('viewport', NaN)
    expect(calls).toBe(0)
    monitor.record('viewport', 2)
    expect(calls).toBe(2)
    releaseA(); releaseA(); monitor.record('viewport', 3)
    expect(calls).toBe(3)
    releaseB(); monitor.record('viewport', 4)
    expect(calls).toBe(3)
  })
  it('isolates observer errors while preserving drawing failures and other observers', () => {
    const monitor = new RenderWorkMonitor()
    let notified = 0
    monitor.subscribe('viewport', () => { throw new Error('observer failure') })
    monitor.subscribe('viewport', () => { notified++ })
    expect(() => monitor.measure('viewport', () => { throw new Error('drawing failure') })).toThrow('drawing failure')
    expect(notified).toBe(1)
    expect(monitor.getSnapshot().viewport.count).toBe(1)
  })
})
