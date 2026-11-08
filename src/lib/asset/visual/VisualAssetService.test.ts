import { describe, expect, it, vi } from 'vitest'
import { VisualAssetService } from './VisualAssetService'
import type { VisualDecoder, VisualResource } from './types'
import { ResourceBudget } from '../../resources/budget'
import { assetSourcePool } from '../sources'
import type { Asset } from '../../types'

/** Fake native settlement for deterministic scheduling races; browser QA uses
 * actual image/video decoding separately. No claimed native RAM measurement. */
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const asset = (url: string, type: Asset['type'] = 'image', width = 2, height = 2): Asset => ({ id: url, name: url, type, url, width, height })
function decoded(ready = Promise.resolve(), width = 2, height = 2): VisualResource {
  return { element: { currentTime: 0 } as HTMLVideoElement, width, height, ready, dispose: vi.fn() }
}

describe('owned visual preparation', () => {
  it('retires delivery if cancellation wins after admission but before bounded native settlement', async () => {
    const abort = new AbortController(), destroyed = deferred<void>(), native = decoded()
    let once = false
    Object.defineProperty(native, 'width', { get: () => { if (!once) { once = true; queueMicrotask(() => abort.abort()) } return 2 } })
    vi.mocked(native.dispose).mockImplementation(() => destroyed.resolve())
    const service = new VisualAssetService({ decoder: () => native })
    await expect(service.acquire(asset('delivery'), { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await destroyed.promise
    expect(service.getSnapshot().residency.chargedBytes).toBe(0)
    expect(service.describeSources().size).toBe(0); service.dispose()
  })
  it('refuses zero retained capacity with unknown metadata before creating a decoder', async () => {
    const decoder = vi.fn(() => decoded()), service = new VisualAssetService({ maxBytes: 0, decoder })
    const unknown = { ...asset('unknown'), width: undefined, height: undefined }
    await expect(service.acquire(unknown)).rejects.toThrow('budget')
    expect(decoder).not.toHaveBeenCalled(); service.dispose()
  })
  it('shares images/sheets by URL across asset IDs, preserves independent pins, and disposes once', async () => {
    const native = decoded(), decoder = vi.fn(() => native), budget = new ResourceBudget({ maxBytes: 128 })
    const service = new VisualAssetService({ decoder, budget, maxBytes: 128 })
    const [a, b] = await Promise.all([service.acquire(asset('same')), service.acquire({ ...asset('same', 'spriteSheet'), id: 'other' })])
    expect(decoder).toHaveBeenCalledOnce(); expect(a.value.element).toBe(b.value.element)
    expect(service.getSnapshot().residency.chargedBytes).toBe(16)
    service.clear(); a.release(); budget.reclaimIdle()
    expect(b.value).toBe(native); expect(native.dispose).not.toHaveBeenCalled()
    b.release(); expect(native.dispose).toHaveBeenCalledOnce(); expect(budget.getSnapshot().chargedBytes).toBe(0)
    service.dispose()
  })
  it('requires scoped video clip identity, sharing a clock only when explicitly requested', async () => {
    const decoder = vi.fn(() => decoded()), service = new VisualAssetService({ decoder })
    await expect(service.acquire(asset('movie', 'video'))).rejects.toThrow('consumerId')
    expect(decoder).not.toHaveBeenCalled()
    const [a, b, same] = await Promise.all([service.acquire(asset('movie', 'video'), { consumerId: 'doc1:a' }),
      service.acquire(asset('movie', 'video'), { consumerId: 'doc1:b' }), service.acquire(asset('movie', 'video'), { consumerId: 'doc1:a' })])
    expect(decoder).toHaveBeenCalledTimes(2); expect(a.value.element).not.toBe(b.value.element)
    expect(a.value.element).toBe(same.value.element)
    ;(a.value.element as HTMLVideoElement).currentTime = 7
    expect((b.value.element as HTMLVideoElement).currentTime).toBe(0)
    expect(service.getSnapshot().residency.categories.video.residentBytes).toBe(32)
    a.release(); b.release(); same.release(); service.dispose()
  })
  it('refuses protected shared-budget overflow before native construction and cleans measured oversize results', async () => {
    const budget = new ResourceBudget({ maxBytes: 32 }), protectedTicket = budget.reserve('scratch', 24)!, native = decoded(Promise.resolve(), 4, 4)
    const decoder = vi.fn(() => native), service = new VisualAssetService({ decoder, budget, maxBytes: 32 })
    await expect(service.acquire(asset('first'))).rejects.toThrow('budget'); expect(decoder).not.toHaveBeenCalled()
    protectedTicket.release()
    await expect(service.acquire(asset('wrong-metadata'))).rejects.toThrow('budget')
    expect(native.dispose).toHaveBeenCalledOnce(); expect(budget.getSnapshot().chargedBytes).toBe(0)
    service.dispose()
  })
  it('keeps a cancelled unabortable decode in its slot, disposes late data, and does not delete a newer same-source request', async () => {
    const gate = deferred<void>(), started = deferred<void>(), oldNative = decoded(gate.promise), current = decoded()
    const decoder: VisualDecoder = vi.fn(() => { started.resolve(); return oldNative }).mockReturnValueOnce(oldNative).mockReturnValue(current)
    const service = new VisualAssetService({ decoder: (input, signal) => { started.resolve(); return decoder(input, signal) }, maxConcurrent: 1 })
    const abort = new AbortController(), old = service.acquire(asset('same'), { signal: abort.signal })
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise; abort.abort(); await rejected
    const fresh = service.acquire(asset('same'))
    expect(service.getSnapshot()).toMatchObject({ pendingCount: 1, preparation: { active: 1, queued: 1 } })
    gate.resolve(); const a = await fresh
    expect(oldNative.dispose).toHaveBeenCalledOnce(); expect(a.value).toBe(current)
    expect(service.getSnapshot().preparation).toMatchObject({ active: 0, cancelled: 1, completed: 1 })
    a.release(); service.dispose()
  })
  it('cancels one shared consumer independently and releases original input only at actual settlement', async () => {
    const source = assetSourcePool.create(new Blob(['native input'])), gate = deferred<void>(), started = deferred<void>(), native = decoded(gate.promise)
    const service = new VisualAssetService({ decoder: () => { started.resolve(); return native } }), abort = new AbortController()
    const a = service.acquire(asset(source.url), { signal: abort.signal }), b = service.acquire(asset(source.url))
    const rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise; abort.abort(); source.release(); await rejected
    expect((await fetch(source.url)).ok).toBe(true)
    gate.resolve(); const pin = await b
    await expect(fetch(source.url)).rejects.toThrow(); expect(pin.value).toBe(native)
    pin.release(); service.dispose()
  })
  it('preserves promised clear callers as retired pins, bounds warm lifetime, and discards errors without leaked charges', async () => {
    vi.useFakeTimers()
    try {
      const gate = deferred<void>(), started = deferred<void>(), native = decoded(gate.promise)
      const service = new VisualAssetService({ decoder: () => { started.resolve(); return native } })
      const pending = service.acquire(asset('old')); await started.promise; service.clear(); gate.resolve()
      const a = await pending
      expect(service.getSnapshot().residency).toMatchObject({ retiredEntries: 1, protectedBytes: 16 })
      a.release(); expect(native.dispose).toHaveBeenCalledOnce()
      const b = await service.acquire(asset('warm')); b.release(); vi.advanceTimersByTime(1999)
      expect(service.getSnapshot().residency.chargedBytes).toBe(16)
      vi.advanceTimersByTime(1); expect(service.getSnapshot().residency.chargedBytes).toBe(0)
      service.dispose()
      const broken = decoded(Promise.reject(new Error('bad image'))), bad = new VisualAssetService({ decoder: () => broken })
      await expect(bad.acquire(asset('bad'))).rejects.toThrow('bad image')
      expect(broken.dispose).toHaveBeenCalledOnce(); expect(bad.getSnapshot().residency.chargedBytes).toBe(0); bad.dispose()
    } finally { vi.useRealTimers() }
  })
  it('bounds queued records, cleans cancelled queue input, and never invokes a decoder after disposal', async () => {
    const gate = deferred<void>(), started = deferred<void>(), native = decoded(gate.promise)
    const decoder = vi.fn(() => { started.resolve(); return native })
    const service = new VisualAssetService({ decoder, maxConcurrent: 1, maxQueued: 1 })
    const a = service.acquire(asset('a')), b = service.acquire(asset('b'))
    const rejected = [expect(a).rejects.toThrow('disposed'), expect(b).rejects.toThrow('disposed')]
    await expect(service.acquire(asset('overflow'))).rejects.toThrow('full')
    await started.promise; service.dispose(); gate.resolve(); await Promise.all(rejected)
    expect(decoder).toHaveBeenCalledOnce(); expect(service.getSnapshot().residency.chargedBytes).toBe(0)
    await expect(service.acquire(asset('later'))).rejects.toThrow('disposed')
  })
})
