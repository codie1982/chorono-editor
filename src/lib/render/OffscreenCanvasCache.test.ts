import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OffscreenCanvasCache } from './OffscreenCanvasCache'

// Stub HTMLCanvasElement creation for node test environment
function fakeCanvas(w: number, h: number): HTMLCanvasElement {
  return { width: w, height: h } as unknown as HTMLCanvasElement
}

describe('OffscreenCanvasCache', () => {
  let cache: OffscreenCanvasCache
  beforeEach(() => { cache = new OffscreenCanvasCache({ maxBytes: 4 * 100 * 100 * 4 }) })

  it('returns null on cache miss', () => {
    expect(cache.get('a', 1)).toBeNull()
  })

  it('returns cached canvas on hit with matching version', () => {
    const c = fakeCanvas(100, 100)
    cache.set('a', 1, c)
    expect(cache.get('a', 1)).toBe(c)
  })

  it('returns null and evicts on version mismatch', () => {
    cache.set('a', 1, fakeCanvas(50, 50))
    expect(cache.get('a', 2)).toBeNull()
    // After version-mismatch get, the stale entry should have been evicted
    expect(cache.count()).toBe(0)
  })

  it('invalidate drops the entry', () => {
    cache.set('a', 1, fakeCanvas(50, 50))
    cache.invalidate('a')
    expect(cache.get('a', 1)).toBeNull()
  })

  it('tracks memory accounting', () => {
    const c = fakeCanvas(100, 100)   // 100*100*4 = 40000 bytes
    cache.set('a', 1, c)
    expect(cache.size()).toBe(40000)
  })

  it('LRU eviction kicks in when over budget', () => {
    // budget = 4 * 100*100*4 = 160_000 bytes (4 canvases of 100×100)
    cache.set('a', 1, fakeCanvas(100, 100))
    cache.set('b', 1, fakeCanvas(100, 100))
    cache.set('c', 1, fakeCanvas(100, 100))
    cache.set('d', 1, fakeCanvas(100, 100))
    // Touch 'a' so 'b' is the LRU
    cache.get('a', 1)
    // Add 'e' → over budget → 'b' (oldest unused) evicted
    cache.set('e', 1, fakeCanvas(100, 100))

    expect(cache.get('b', 1)).toBeNull()
    expect(cache.get('a', 1)).not.toBeNull()
    expect(cache.get('e', 1)).not.toBeNull()
  })

  it('clear empties cache and resets accounting', () => {
    cache.set('a', 1, fakeCanvas(100, 100))
    cache.clear()
    expect(cache.count()).toBe(0)
    expect(cache.size()).toBe(0)
  })

  it('re-set on same key replaces previous canvas', () => {
    const a = fakeCanvas(100, 100)
    const b = fakeCanvas(50, 50)
    cache.set('k', 1, a)
    cache.set('k', 2, b)
    // After re-set, only the newer (b, version 2) entry remains
    expect(cache.get('k', 2)).toBe(b)
    expect(cache.size()).toBe(50 * 50 * 4)
    // Asking for old version now both misses AND evicts (contract)
    expect(cache.get('k', 1)).toBeNull()
    expect(cache.size()).toBe(0)
  })
})

describe('owned pre-allocation admission', () => {
  function allocator() {
    const outputs: HTMLCanvasElement[] = []
    const createCanvas = vi.fn((width: number, height: number) => {
      const canvas = { width, height, getContext: () => ({}) } as unknown as HTMLCanvasElement
      outputs.push(canvas); return canvas
    })
    return { createCanvas, outputs }
  }
  it('denies oversized pixel/signature reservations BEFORE allocation; zero budget falls back', () => {
    const { createCanvas } = allocator(), paint = vi.fn()
    const cache = new OffscreenCanvasCache({ maxBytes: 100, createCanvas })
    expect(cache.getOrCreate('a', 'version', 10, 10, paint)).toBeNull()
    expect(cache.getOrCreate('a', 'x'.repeat(100), 1, 1, paint)).toBeNull()
    expect(createCanvas).not.toHaveBeenCalled(); expect(paint).not.toHaveBeenCalled()
    expect(cache.getSnapshot()).toMatchObject({ budgetDenials: 2, residentBytes: 0, pendingBytes: 0 })
  })
  it('charges signatures, refreshes LRU hits and shrinks owned stores on pressure/invalidation/clear', () => {
    const { createCanvas, outputs } = allocator()
    const cache = new OffscreenCanvasCache({ maxBytes: 850, createCanvas })
    cache.getOrCreate('a', 'v', 10, 10, () => {})
    cache.getOrCreate('b', 'v', 10, 10, () => {})
    expect(cache.getOrCreate('a', 'v', 10, 10, () => { throw new Error('must hit') })?.created).toBe(false)
    cache.getOrCreate('c', 'v', 10, 10, () => {})
    expect(outputs[1].width).toBe(0)
    expect(outputs[0].width).toBe(10)
    cache.invalidate('a'); expect(outputs[0].width).toBe(0)
    expect(cache.getSnapshot().metadataBytes).toBe(4)
    cache.clear(); expect(outputs[2].height).toBe(0); expect(cache.size()).toBe(0)
  })
  it('unwinds failed paints and context failures without committing buffers', () => {
    const { createCanvas, outputs } = allocator()
    const cache = new OffscreenCanvasCache({ maxBytes: 1000, createCanvas })
    expect(() => cache.getOrCreate('a', 1, 10, 10, () => { throw new Error('paint failed') })).toThrow('paint failed')
    expect(outputs[0].width).toBe(0)
    expect(cache.getSnapshot()).toMatchObject({ pendingBytes: 0, residentBytes: 0, entries: 0 })
    const failed = new OffscreenCanvasCache({ createCanvas: () => ({ width: 10, height: 10, getContext: () => null }) as unknown as HTMLCanvasElement })
    expect(failed.getOrCreate('a', 1, 10, 10, () => {})).toBeNull()
    expect(failed.getSnapshot().allocationFailures).toBe(1)
  })
  it('counts pending reservations during reentrant creation and refuses a cleared generation', () => {
    const { createCanvas, outputs } = allocator()
    const cache = new OffscreenCanvasCache({ maxBytes: 500, createCanvas })
    expect(cache.getOrCreate('a', 'v', 10, 10, () => {
      expect(cache.getSnapshot().pendingBytes).toBe(404)
      expect(cache.getOrCreate('b', 'v', 10, 10, () => {})).toBeNull()
      cache.clear()
    })).toBeNull()
    expect(outputs[0].width).toBe(0)
    expect(cache.getSnapshot()).toMatchObject({ pendingBytes: 0, residentBytes: 0 })
  })
  it('expires only idle owned entries with one timer and protects a refreshed hit', () => {
    vi.useFakeTimers()
    try {
      const { createCanvas, outputs } = allocator()
      const cache = new OffscreenCanvasCache({ createCanvas, maxIdleMs: 2000, now: () => Date.now() })
      cache.getOrCreate('a', 'v', 10, 10, () => {})
      vi.advanceTimersByTime(1500); cache.get('a', 'v')
      vi.advanceTimersByTime(1000); expect(outputs[0].width).toBe(10)
      vi.advanceTimersByTime(1000); expect(outputs[0].width).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
})

it('allows valid hits while deferring an inadmissible cold bake before allocation', () => {
  const allocate = vi.fn((width: number, height: number) => ({ width, height, getContext: () => ({}) }) as unknown as HTMLCanvasElement)
  const cache = new OffscreenCanvasCache({ createCanvas: allocate })
  expect(cache.getOrCreate('cold', 1, 10, 10, () => {}, false)).toBeNull()
  expect(allocate).not.toHaveBeenCalled()
  cache.getOrCreate('warm', 1, 10, 10, () => {})
  expect(cache.getOrCreate('warm', 1, 10, 10, () => { throw new Error('must hit') }, false)?.created).toBe(false)
  expect(allocate).toHaveBeenCalledTimes(1)
  expect(cache.getSnapshot().pendingBytes).toBe(0)
  cache.clear()
})
