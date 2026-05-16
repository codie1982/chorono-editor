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
