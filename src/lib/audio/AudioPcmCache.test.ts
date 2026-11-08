import { describe, expect, it, vi } from 'vitest'
import { AudioPcmCache } from './AudioPcmCache'
import { AudioAssetService } from './AudioAssetService'
import { ResourceBudget } from '../resources/budget'

const pcm = (bytes: number) => ({ length: bytes / 4, numberOfChannels: 1, duration: bytes / 4 / 48000, sampleRate: 48000 }) as AudioBuffer

describe('owned PCM admission and leases', () => {
  it('preserves the existing positive-reservation rule at zero capacity before native decoding', async () => {
    const buffer = pcm(16), decodeAudioData = vi.fn(async () => buffer), service = new AudioAssetService({ maxBytes: 0,
      fetch: vi.fn(async () => new Response(new Uint8Array(1))),
      createContext: () => ({ state: 'closed', decodeAudioData } as unknown as AudioContext) })
    await expect(service.loadUrl('legacy')).rejects.toThrow('positive')
    await expect(service.acquireUrl('owned')).rejects.toThrow('positive')
    expect(decodeAudioData).not.toHaveBeenCalled()
    expect(service.getMemorySnapshot().residency!.chargedBytes).toBe(0)
    await service.dispose()
  })
  it('deduplicates resident bytes, protects delivery/consumer pins, and retires until final release', () => {
    const budget = new ResourceBudget({ maxBytes: 128 }), cache = new AudioPcmCache({ maxBytes: 128, budget })
    const pending = cache.reserve(64)
    expect(budget.getSnapshot()).toMatchObject({ reservedBytes: 64, protectedBytes: 64 })
    const delivery = cache.admit('a', pcm(16), pending), consumer = delivery.retain(), second = cache.acquire('a')!
    expect(consumer.buffer).toBe(second.buffer)
    delivery.release(); cache.clear(); budget.reclaimIdle()
    expect(cache.getSnapshot()).toMatchObject({ residentBytes: 16, retiredEntries: 1, protectedBytes: 16 })
    expect(cache.acquire('a')).toBeUndefined(); expect(consumer.buffer.length).toBe(4)
    expect(cache.describeSources().get('a')).toBe(16)
    consumer.release(); expect(budget.getSnapshot().chargedBytes).toBe(16)
    second.release(); second.release()
    expect(budget.getSnapshot().chargedBytes).toBe(0)
    expect(cache.describeSources().has('a')).toBe(false)
    expect(() => second.buffer).toThrow('released'); expect(() => second.retain()).toThrow('released')
  })

  it('allows global pressure to release idle PCM while active PCM survives', () => {
    const budget = new ResourceBudget({ maxBytes: 64 }), cache = new AudioPcmCache({ maxBytes: 64, budget })
    const warm = cache.admit('warm', pcm(16), cache.reserve(16)), active = cache.admit('active', pcm(16), cache.reserve(16))
    warm.release()
    const scratch = budget.reserve('scratch', 40)!
    expect(scratch).not.toBeNull(); expect(cache.peek('warm')).toBeUndefined()
    expect(active.buffer.length).toBe(4); expect(budget.getSnapshot().chargedBytes).toBe(56)
    scratch.release(); active.release(); cache.clearIdle()
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })

  it('retains native pending reservations across clear and bounds records including retired pins', () => {
    const cache = new AudioPcmCache({ maxBytes: 128, maxEntries: 2 })
    const a = cache.admit('a', pcm(16), cache.reserve(16)), pending = cache.reserve(16)
    cache.clear()
    expect(cache.getSnapshot()).toMatchObject({ chargedBytes: 32, reservedBytes: 16, retiredEntries: 1 })
    expect(() => cache.reserve(1)).toThrow('budget')
    a.release(); pending.release(); expect(cache.getSnapshot().chargedBytes).toBe(0)
    expect(() => cache.admit('bad', pcm(16), pending)).toThrow('budget')
  })

  it('expires unused PCM after the warm grace without expiring a pinned consumer', () => {
    vi.useFakeTimers()
    try {
      const cache = new AudioPcmCache({ maxBytes: 128 })
      const warm = cache.admit('warm', pcm(16), cache.reserve(16)), active = cache.admit('active', pcm(16), cache.reserve(16))
      warm.release(); vi.advanceTimersByTime(1999)
      expect(cache.peek('warm')).toBeDefined()
      vi.advanceTimersByTime(1)
      expect(cache.peek('warm')).toBeUndefined(); expect(active.buffer.length).toBe(4)
      active.release(); vi.advanceTimersByTime(2000)
      expect(cache.getSnapshot().chargedBytes).toBe(0)
    } finally { vi.useRealTimers() }
  })

  it('refuses preparation before fetch when another protected owner fills the shared budget', async () => {
    const budget = new ResourceBudget({ maxBytes: 64 }), scratch = budget.reserve('scratch', 48)!, fetcher = vi.fn()
    const service = new AudioAssetService({ budget, decodeReserveBytes: 32, fetch: fetcher })
    await expect(service.acquireUrl('a')).rejects.toThrow('budget')
    expect(fetcher).not.toHaveBeenCalled(); expect(budget.getSnapshot().chargedBytes).toBe(48)
    scratch.release(); await service.dispose()
  })

  it('rejects an oversize decoded lease, unwinds charge, and preserves the explicit legacy raw API', async () => {
    const budget = new ResourceBudget({ maxBytes: 128 }), buffer = pcm(32)
    const service = new AudioAssetService({ maxBytes: 16, budget, decodeReserveBytes: 8,
      fetch: vi.fn(async () => new Response(new Uint8Array(1))),
      createContext: () => ({ state: 'closed', decodeAudioData: async () => buffer } as unknown as AudioContext) })
    await expect(service.acquireUrl('a')).rejects.toThrow('Decoded audio')
    expect(budget.getSnapshot().chargedBytes).toBe(0); expect(service.peek('a')).toBeUndefined()
    expect(await service.loadUrl('a')).toBe(buffer)
    expect(budget.getSnapshot().chargedBytes).toBe(0); expect(service.getMemorySnapshot().bufferCount).toBe(0)
    await service.dispose()
  })

  it('protects each deduplicated service consumer without duplicating global charge', async () => {
    const budget = new ResourceBudget({ maxBytes: 128 }), buffer = pcm(16)
    const fetcher = vi.fn(async () => new Response(new Uint8Array(1)))
    const service = new AudioAssetService({ maxBytes: 128, budget, decodeReserveBytes: 32, fetch: fetcher,
      createContext: () => ({ state: 'closed', decodeAudioData: async () => buffer } as unknown as AudioContext) })
    const [a, b] = await Promise.all([service.acquireUrl('a'), service.acquireUrl('a')])
    expect(fetcher).toHaveBeenCalledOnce(); expect(a.buffer).toBe(b.buffer)
    service.clear(); a.release(); budget.reclaimIdle()
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 16, protectedBytes: 16 })
    b.release(); expect(budget.getSnapshot().chargedBytes).toBe(0)
    await service.dispose()
  })
})
