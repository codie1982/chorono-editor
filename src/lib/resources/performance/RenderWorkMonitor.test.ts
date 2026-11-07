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
})
