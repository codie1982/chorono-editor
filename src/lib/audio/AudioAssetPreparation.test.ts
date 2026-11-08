import { describe, expect, it, vi } from 'vitest'
import { AudioAssetService } from './AudioAssetService'
import { AudioEngine } from '../audioEngine'
import type { Asset } from '../types'

/** Explicit native/fetch completion gates make cancellation races reproducible. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
const response = () => new Response(new Uint8Array(1))
const pcm = () => ({ length: 48, numberOfChannels: 2, duration: 0.001 }) as AudioBuffer
const asset = (id: string, url = id): Asset => ({ id, url, type: 'audio', name: id })

describe('audio preparation backpressure and ownership', () => {
  it('caps real fetch+decode jobs, rejects queue overflow, and dedupes before counting capacity', async () => {
    const gate = deferred<void>(), started = deferred<void>()
    let fetches = 0
    const fetcher = vi.fn(async () => { if (++fetches === 2) started.resolve(); await gate.promise; return response() })
    const decodeAudioData = vi.fn(async () => pcm())
    const service = new AudioAssetService({ fetch: fetcher, maxConcurrent: 2, maxQueued: 1,
      createContext: () => ({ state: 'running', decodeAudioData } as unknown as AudioContext) })
    const a = service.loadUrl('a'), b = service.loadUrl('b'), c = service.loadUrl('c'), shared = service.loadUrl('a')
    await expect(service.loadUrl('excess')).rejects.toThrow('queue is full')
    await started.promise
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(service.getMemorySnapshot().preparation).toMatchObject({ active: 2, queued: 1, denied: 1 })
    gate.resolve(); const buffers = await Promise.all([a, b, c, shared])
    expect(buffers[0]).toBe(buffers[3]); expect(fetcher).toHaveBeenCalledTimes(3)
    expect(decodeAudioData).toHaveBeenCalledTimes(3)
    expect(service.getMemorySnapshot()).toMatchObject({ pendingCount: 0, preparation: { active: 0, queued: 0 } })
  })

  it('cancels one deduplicated consumer without aborting another, then releases its abort listener', async () => {
    const fetching = deferred<Response>(), started = deferred<void>(), cancel = new AbortController()
    let signal!: AbortSignal
    const fetcher = vi.fn((_url, options) => { signal = options!.signal!; started.resolve(); return fetching.promise })
    const decodeAudioData = vi.fn(async () => pcm()), remove = vi.spyOn(cancel.signal, 'removeEventListener')
    const service = new AudioAssetService({ fetch: fetcher, createContext: () => ({ state: 'running', decodeAudioData } as unknown as AudioContext) })
    const first = service.loadUrl('shared', { signal: cancel.signal }), second = service.loadUrl('shared')
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise; cancel.abort(); await rejected
    expect(signal.aborted).toBe(false); expect(remove).toHaveBeenCalledOnce()
    fetching.resolve(response()); const buffer = await second
    expect(service.peek('shared')).toBe(buffer); expect(fetcher).toHaveBeenCalledOnce()
  })

  it('holds a cancelled native decode slot, removes stale dedupe, and never caches its late result', async () => {
    const first = deferred<AudioBuffer>(), decoding = deferred<void>(), secondStarted = deferred<void>()
    let count = 0
    const decodeAudioData = vi.fn(() => {
      if (++count === 1) { decoding.resolve(); return first.promise }
      secondStarted.resolve(); return Promise.resolve(pcm())
    })
    const service = new AudioAssetService({ maxConcurrent: 1, fetch: vi.fn(async () => response()),
      createContext: () => ({ state: 'running', decodeAudioData } as unknown as AudioContext) })
    const cancel = new AbortController(), old = service.loadUrl('same', { signal: cancel.signal })
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' })
    await decoding.promise; cancel.abort(); await rejected
    const current = service.loadUrl('same')
    expect(service.getMemorySnapshot()).toMatchObject({ pendingCount: 1, preparation: { active: 1, queued: 1 } })
    expect(service.peek('same')).toBeUndefined(); expect(decodeAudioData).toHaveBeenCalledOnce()
    first.resolve(pcm()); await secondStarted.promise
    const buffer = await current
    expect(service.peek('same')).toBe(buffer); expect(decodeAudioData).toHaveBeenCalledTimes(2)
    expect(service.getMemorySnapshot().preparation).toMatchObject({ active: 0, completed: 1, cancelled: 1 })
  })

  it('cancels queued work before fetch and can restart after a service generation cancellation', async () => {
    const fetching = deferred<Response>(), started = deferred<void>(), fetcher = vi.fn(() => { started.resolve(); return fetching.promise })
    const decodeAudioData = vi.fn(async () => pcm())
    const service = new AudioAssetService({ maxConcurrent: 1, fetch: fetcher,
      createContext: () => ({ state: 'running', decodeAudioData } as unknown as AudioContext) })
    const old = service.loadUrl('old'), queued = service.loadUrl('queued')
    const rejected = [expect(old).rejects.toMatchObject({ name: 'AbortError' }), expect(queued).rejects.toMatchObject({ name: 'AbortError' })]
    await started.promise; service.cancelPending()
    const fresh = service.loadUrl('fresh')
    expect(service.getMemorySnapshot().preparation).toMatchObject({ active: 1, queued: 1 })
    fetching.resolve(response()); await Promise.all(rejected); await fresh
    expect(fetcher).toHaveBeenCalledTimes(2); expect(decodeAudioData).toHaveBeenCalledOnce()
    expect(service.peek('old')).toBeUndefined(); expect(service.peek('queued')).toBeUndefined()
    expect(service.getMemorySnapshot().preparation).toMatchObject({ active: 0, queued: 0, cancelled: 2 })
  })

  it('keeps clear compatible with existing callers without allowing stale cache or newer-request deletion', async () => {
    const oldNative = deferred<AudioBuffer>(), decoding = deferred<void>()
    let count = 0
    const service = new AudioAssetService({ maxConcurrent: 1, fetch: vi.fn(async () => response()),
      createContext: () => ({ state: 'running', decodeAudioData: () => {
        if (++count === 1) { decoding.resolve(); return oldNative.promise }
        return Promise.resolve(pcm())
      } } as unknown as AudioContext) })
    const old = service.loadUrl('same'); await decoding.promise; service.clear()
    const fresh = service.loadUrl('same'), stale = pcm(); oldNative.resolve(stale)
    expect(await old).toBe(stale)
    const current = await fresh
    expect(current).not.toBe(stale); expect(service.peek('same')).toBe(current)
    expect(service.getMemorySnapshot().pendingCount).toBe(0)
  })

  it('engine removal/re-add with identical id and URL cannot revive a cancelled loading consumer', async () => {
    const gate = deferred<Response>(), started = deferred<void>()
    const fetcher = vi.fn(async () => { started.resolve(); await gate.promise; return response() })
    const service = new AudioAssetService({ fetch: fetcher,
      createContext: () => ({ state: 'running', decodeAudioData: async () => pcm() } as unknown as AudioContext) })
    const engine = new AudioEngine(service), source = asset('same')
    const external = service.load(source) // Independent waveform holds shared work.
    const old = engine.loadAsset(source); await started.promise
    engine.removeAsset(source.id)
    const fresh = engine.loadAsset(source)
    await old
    expect(engine.getState().loadingAssetIds).toEqual([source.id])
    gate.resolve(response()); await Promise.all([external, fresh])
    expect(engine.getResourceSnapshot().assets).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledOnce()
    engine.dispose(); expect(engine.getState().loadingAssetIds).toEqual([])
  })

  it('engine disposal cancels its consumer while a waveform request still completes', async () => {
    const gate = deferred<Response>(), started = deferred<void>()
    const service = new AudioAssetService({ fetch: vi.fn(async () => { started.resolve(); await gate.promise; return response() }),
      createContext: () => ({ state: 'running', decodeAudioData: async () => pcm() } as unknown as AudioContext) })
    const engine = new AudioEngine(service), source = asset('same')
    const loading = engine.loadAsset(source), waveform = service.load(source)
    await started.promise; engine.dispose(); await loading
    gate.resolve(response()); expect(await waveform).toBeDefined()
    expect(engine.getResourceSnapshot().assets).toEqual([]); expect(engine.getState().errors).toEqual({})
  })
})
