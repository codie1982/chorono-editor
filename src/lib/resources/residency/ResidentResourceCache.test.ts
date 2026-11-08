import { describe, expect, it, vi } from 'vitest'
import { ResidentResourceCache } from './ResidentResourceCache'
import { ResourceBudget } from '../budget'

/** Explicit destructor lets tests verify release ordering, not just counters. */
function owner(dispose = vi.fn(), budget = new ResourceBudget({ maxBytes: 64 })) {
  return { budget, dispose, cache: new ResidentResourceCache<object>({ category: 'image', label: 'image', maxBytes: 64,
    maxEntries: 3, budget, dispose }) }
}

describe('shared resident resource ownership', () => {
  it('offers nullable reader admission without changing strict reserve or ticket ownership',()=>{
    const {cache,budget}=owner(),ticket=cache.tryReserve(64,'input')!
    expect(ticket).not.toBeNull();expect(cache.tryReserve(1,'input')).toBeNull()
    expect(()=>cache.reserve(1,'input')).toThrow('budget')
    for(const size of [0,-1,NaN,.5])expect(()=>cache.tryReserve(size,'input')).toThrow()
    ticket.commit();ticket.release();expect(budget.getSnapshot().chargedBytes).toBe(0)
    const next=cache.reserve(8),pin=cache.admit(null,{},8,next);pin.release();expect(cache.getSnapshot().chargedBytes).toBe(0)
  })
  it('preserves live/retired pins, performs final destruction before releasing charge, and forbids released access', () => {
    const { cache, budget, dispose } = owner(), value = {}
    const a = cache.admit('key', value, 16, cache.reserve(32)), b = a.retain()
    a.release(); cache.clear(); budget.reclaimIdle()
    expect(cache.getSnapshot()).toMatchObject({ retiredEntries: 1, protectedBytes: 16 })
    expect(b.value).toBe(value); expect(dispose).not.toHaveBeenCalled()
    b.release(); b.release()
    expect(dispose).toHaveBeenCalledExactlyOnceWith(value); expect(budget.getSnapshot().chargedBytes).toBe(0)
    expect(cache.values()).toEqual([]); expect(() => b.value).toThrow('released'); expect(() => b.retain()).toThrow('released')
  })
  it('refuses foreign/reused tickets and unsafe estimates without taking producer ownership', () => {
    const { cache, dispose } = owner(), other = owner().cache, foreign = other.reserve(8)
    expect(() => cache.admit('foreign', {}, 8, foreign)).toThrow('budget'); foreign.release()
    for (const bytes of [0, -1, Infinity, 0.5]) expect(() => cache.reserve(bytes)).toThrow()
    const ticket = cache.reserve(8), a = cache.admit('a', {}, 8, ticket)
    expect(() => cache.admit('b', {}, 8, ticket)).toThrow('budget')
    expect(dispose).not.toHaveBeenCalled(); a.release(); cache.clearIdle()
  })
  it('keeps failed native cleanup charged and quarantined until explicit retry without a timer loop', () => {
    vi.useFakeTimers()
    try {
      const budget = new ResourceBudget({ maxBytes: 64 })
      const dispose = vi.fn<() => void>(() => { expect(budget.getSnapshot().chargedBytes).toBe(16); throw new Error('native failure') })
      const { cache } = owner(dispose, budget), a = cache.admit('a', {}, 16, cache.reserve(16))
      a.release(); vi.advanceTimersByTime(2000)
      expect(cache.getSnapshot()).toMatchObject({ chargedBytes: 16, failedEntries: 1, protectedBytes: 16, retiredEntries: 1 })
      expect(cache.acquire('a')).toBeUndefined(); vi.advanceTimersByTime(20000)
      expect(dispose).toHaveBeenCalledOnce()
      dispose.mockImplementation(() => {}); cache.clearIdle()
      expect(cache.getSnapshot()).toMatchObject({ chargedBytes: 0, failedEntries: 0 }); expect(dispose).toHaveBeenCalledTimes(2)
    } finally { vi.useRealTimers() }
  })
  it('quarantines failed in-flight disposal, preserves estimates, and shares LRU pressure across domains', () => {
    const { cache, budget, dispose } = owner()
    dispose.mockImplementationOnce(() => { throw new Error('reset failed') })
    cache.discard({}, cache.reserve(16, 'video'), 'source')
    expect(cache.getSnapshot()).toMatchObject({ failedEntries: 1, protectedBytes: 16 })
    const warm = cache.admit('warm', {}, 16, cache.reserve(16)); warm.release()
    const active = cache.admit('active', {}, 16, cache.reserve(16))
    const scratch = budget.reserve('scratch', 32)!
    expect(cache.peek('warm')).toBeUndefined(); expect(scratch).not.toBeNull(); expect(active.value).toBeDefined()
    expect(cache.describeSources().get('source')).toBe(16)
    scratch.release(); active.release(); cache.clearIdle(); expect(budget.getSnapshot().chargedBytes).toBe(0)
  })
})
