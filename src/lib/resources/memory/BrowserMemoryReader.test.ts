import { describe, expect, it, vi } from 'vitest'
import { BrowserMemoryReader } from './BrowserMemoryReader'

describe('browser memory capabilities', () => {
  it('keeps unsupported/invalid heap unavailable and never requests page memory without isolation', async () => {
    const measure = vi.fn()
    const reader = new BrowserMemoryReader(() => ({ secure: true, isolated: false, measure,
      heap: { usedJSHeapSize: NaN, totalJSHeapSize: 1, jsHeapSizeLimit: 2 } }))
    expect(reader.getSnapshot()).toMatchObject({ heap: null, page: { status: 'unsupported', bytes: null } })
    await reader.requestSample()
    expect(measure).not.toHaveBeenCalled()
  })
  it('deduplicates pending manual samples and keeps heap/page scope separate', async () => {
    let complete!: (value: { bytes: number }) => void
    const measure = vi.fn(() => new Promise<{ bytes: number }>(resolve => { complete = resolve }))
    const reader = new BrowserMemoryReader(() => ({ secure: true, isolated: true, measure,
      heap: { usedJSHeapSize: 20, totalJSHeapSize: 40, jsHeapSizeLimit: 80 } }))
    const first = reader.requestSample(), second = reader.requestSample()
    expect(first).toBe(second)
    expect(reader.getSnapshot().page.status).toBe('pending')
    await Promise.resolve()
    complete({ bytes: 200 }); await first
    expect(measure).toHaveBeenCalledTimes(1)
    expect(reader.getSnapshot()).toMatchObject({ heap: { used: 20, allocated: 40, limit: 80 }, page: { status: 'complete', bytes: 200 } })
  })
  it('reports rejected or invalid results without replacing them with zero', async () => {
    const measure = vi.fn().mockRejectedValueOnce(new Error('SecurityError')).mockResolvedValueOnce({ bytes: Infinity })
    const reader = new BrowserMemoryReader(() => ({ secure: true, isolated: true, measure }))
    await reader.requestSample()
    expect(reader.getSnapshot().page).toMatchObject({ status: 'error', bytes: null })
    await reader.requestSample()
    expect(reader.getSnapshot().page).toMatchObject({ status: 'error', bytes: null })
  })
})
