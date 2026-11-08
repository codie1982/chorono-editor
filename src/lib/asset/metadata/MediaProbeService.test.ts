import { describe, expect, it, vi } from 'vitest'
import { MediaProbeService } from './MediaProbeService'
import { MediaMetadataUnavailable } from './browserMetadataDecoder'
import { ResourceBudget } from '../../resources/budget'
import { BoundedJobQueue } from '../../resources/jobs'
import { assetSourcePool } from '../sources'
import type { VisualResource } from '../visual/types'
import type { ImageMetadataSource } from './ImageMetadataReader'
import type { ImageHeader } from './image/types'

/** Explicit settlement gates distinguish pending native work from a cancelled
 * consumer. Fake ports test ownership; real native decoding is separate QA. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve }
}
function headers(header: ImageHeader = { format: 'png', width: 2, height: 3 }): ImageMetadataSource {
  return { readBlob: vi.fn(async () => header), readUrl: vi.fn(async () => header) }
}
function frame(ready = Promise.resolve(), width = 2, height = 3): VisualResource {
  return { element: {} as HTMLImageElement, width, height, ready, dispose: vi.fn() }
}
const file = () => new File(['encoded source'], 'image.png', { type: 'image/png' })

describe('native media probe admission and ownership', () => {
  it('refuses oversized supported headers before creating a source or native decoder', async () => {
    const baseline = assetSourcePool.getSnapshot(), decoder = vi.fn(() => frame())
    const service = new MediaProbeService({ imageMetadata: headers({ format: 'png', width: 16385, height: 1 }), imageDecoder: decoder })
    await expect(service.image(file())).rejects.toThrow('pixel')
    expect(decoder).not.toHaveBeenCalled(); expect(assetSourcePool.getSnapshot()).toEqual(baseline)
    expect(service.getSnapshot().residency.chargedBytes).toBe(0)
  })

  it('admits real frame policy before native construction and releases transient results', async () => {
    const budget = new ResourceBudget({ maxBytes: 24 }), native = frame()
    const decoder = vi.fn(() => { expect(budget.getSnapshot().chargedBytes).toBe(24); return native })
    const service = new MediaProbeService({ budget, imageMetadata: headers(), imageDecoder: decoder })
    expect(await service.image(file())).toEqual({ width: 2, height: 3, durationMs: 0 })
    expect(native.dispose).toHaveBeenCalledOnce(); expect(budget.getSnapshot().chargedBytes).toBe(0)
    expect(service.getSnapshot().preparation).toMatchObject({ active: 0, queued: 0 })
  })

  it('denies host overflow and reserves an explicit policy for unknown geometry', async () => {
    const budget = new ResourceBudget({ maxBytes: 23 }), decoder = vi.fn(() => frame())
    const service = new MediaProbeService({ budget, imageMetadata: headers(), imageDecoder: decoder })
    await expect(service.image(file())).rejects.toThrow('budget'); expect(decoder).not.toHaveBeenCalled()
    const unknown = new MediaProbeService({ budget: new ResourceBudget({ maxBytes: 100 }), imageDecoder: decoder,
      imageMetadata: headers({ format: 'opaque', width: null, height: null, reason: 'unsupported-format' }) })
    await expect(unknown.image(file())).rejects.toThrow('budget'); expect(decoder).not.toHaveBeenCalled()
  })

  it('owns a sprite preview until final release and invalidates access afterwards', async () => {
    const native = frame(), service = new MediaProbeService({ imageMetadata: headers(), imageDecoder: () => native })
    const preview = await service.preview(file())
    expect(preview.width).toBe(2); expect(native.dispose).not.toHaveBeenCalled()
    expect(service.getSnapshot().residency).toMatchObject({ protectedBytes: 24, retiredEntries: 1 })
    preview.release(); preview.release()
    expect(native.dispose).toHaveBeenCalledOnce(); expect(() => preview.width).toThrow('released')
    expect(service.getSnapshot().residency.chargedBytes).toBe(0)
  })

  it('permits orientation swaps but destroys a decoder that exceeds its supported header', async () => {
    const rotated = frame(Promise.resolve(), 3, 2), wrong = frame(Promise.resolve(), 3, 3)
    const decoder = vi.fn(() => rotated).mockReturnValueOnce(rotated).mockReturnValueOnce(wrong)
    const service = new MediaProbeService({ imageMetadata: headers(), imageDecoder: decoder })
    expect(await service.image(file())).toMatchObject({ width: 3, height: 2 })
    await expect(service.image(file())).rejects.toThrow('exceed its supported header')
    expect(wrong.dispose).toHaveBeenCalledOnce(); expect(service.getSnapshot().residency.chargedBytes).toBe(0)
  })

  it('retains both slots, source leases and policy while aborted native work still runs', async () => {
    const gate = deferred<void>(), started = deferred<void>(), budget = new ResourceBudget({ maxBytes: 1024 })
    const shared = new BoundedJobQueue({ concurrency: 1 }), abort = new AbortController(), native = frame(gate.promise)
    const service = new MediaProbeService({ budget, executor: shared, imageMetadata: headers(), imageDecoder: () => { started.resolve(); return native } })
    let settled = false
    const pending = service.preview(file(), { signal: abort.signal }).finally(() => { settled = true })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise; abort.abort(); await Promise.resolve()
    expect(settled).toBe(false); expect(budget.getSnapshot().chargedBytes).toBe(24)
    expect(service.getSnapshot().preparation.active).toBe(1); expect(shared.getSnapshot().active).toBe(1)
    expect(native.dispose).not.toHaveBeenCalled()
    gate.resolve(); await rejected
    expect(native.dispose).toHaveBeenCalledOnce(); expect(budget.getSnapshot().chargedBytes).toBe(0)
    expect(service.getSnapshot().preparation.active).toBe(0); expect(shared.getSnapshot().active).toBe(0)
  })

  it('cancels shared-slot waiting without starting another native decoder', async () => {
    const gate = deferred<void>(), started = deferred<void>(), shared = new BoundedJobQueue({ concurrency: 1 })
    const blocker = shared.submit(async () => { started.resolve(); await gate.promise })
    await started.promise
    const abort = new AbortController(), decoder = vi.fn(() => frame())
    const service = new MediaProbeService({ executor: shared, imageMetadata: headers(), imageDecoder: decoder })
    const pending = service.image(file(), { signal: abort.signal })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve(); await Promise.resolve()
    abort.abort(); await rejected
    expect(decoder).not.toHaveBeenCalled(); expect(service.getSnapshot().residency.chargedBytes).toBe(0)
    expect(service.getSnapshot().preparation.active).toBe(0)
    gate.resolve(); await blocker
  })

  it('quarantines failed native cleanup with its source and charge until explicit retry', async () => {
    const native = frame(), budget = new ResourceBudget({ maxBytes: 1024 }), baseline = assetSourcePool.getSnapshot().references
    vi.mocked(native.dispose).mockImplementationOnce(() => { throw new Error('native reset failed') }).mockImplementation(() => {})
    const service = new MediaProbeService({ budget, imageMetadata: headers(), imageDecoder: () => native })
    await service.image(file())
    expect(service.getSnapshot().residency).toMatchObject({ failedEntries: 1, chargedBytes: 24 })
    expect(assetSourcePool.getSnapshot().references).toBe(baseline + 1)
    service.clearIdle()
    expect(native.dispose).toHaveBeenCalledTimes(2); expect(budget.getSnapshot().chargedBytes).toBe(0)
    expect(assetSourcePool.getSnapshot().references).toBe(baseline)
  })

  it('preserves expected unknown audio duration but never converts abort/budget failures to success', async () => {
    const unavailable = new MediaProbeService({ metadataDecoder: () => ({
      ready: Promise.reject(new MediaMetadataUnavailable('unavailable')), dispose() {},
    }) })
    expect(await unavailable.audio(file())).toEqual({ width: 0, height: 0, durationMs: 0 })
    const fatal = new MediaProbeService({ metadataDecoder: () => ({ ready: Promise.reject(new RangeError('budget failure')), dispose() {} }) })
    await expect(fatal.audio(file())).rejects.toThrow('budget failure')
    const abort = new AbortController(); abort.abort()
    await expect(unavailable.audio(file(), { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('keeps expired native work charged until it settles, then reports a deadline failure', async () => {
    vi.useFakeTimers()
    try {
      const gate = deferred<void>(), started = deferred<void>(), native = frame(gate.promise)
      const service = new MediaProbeService({ timeoutMs: 100, imageMetadata: headers(), imageDecoder: () => { started.resolve(); return native } })
      const pending = service.image(file()), rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
      await started.promise; await vi.advanceTimersByTimeAsync(100)
      expect(service.getSnapshot().residency.chargedBytes).toBe(24)
      expect(service.getSnapshot().preparation.active).toBe(1)
      gate.resolve(); await rejected
      expect(native.dispose).toHaveBeenCalledOnce(); expect(service.getSnapshot().residency.chargedBytes).toBe(0)
    } finally { vi.useRealTimers() }
  })
})
