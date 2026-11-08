import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserVisualDecoder } from './browserVisualDecoder'

/** Minimal native ports with explicit decode completion. These prove adapter
 * promise/event ownership, not browser codec behavior or physical RAM usage. */
function deferred() {
  let resolve!: () => void, reject!: (reason: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject }
}
function imagePort(decode?: () => Promise<void>) {
  const image = { naturalWidth: 12, naturalHeight: 34, src: '', decoding: '', crossOrigin: '',
    onload: null as null | (() => void), onerror: null as null | (() => void), removeAttribute: vi.fn(), decode }
  vi.stubGlobal('Image', class { constructor() { return image } })
  return image
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('browser visual native settlement', () => {
  it('requests source reset on abort but keeps ready pending until Image.decode actually rejects', async () => {
    const gate = deferred(), image = imagePort(() => gate.promise), abort = new AbortController()
    const native = browserVisualDecoder({ kind: 'image', url: 'image' }, abort.signal)
    let settled = false
    const pending = native.ready.finally(() => { settled = true })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort(); await Promise.resolve()
    expect(image.removeAttribute).toHaveBeenCalledWith('src'); expect(settled).toBe(false)
    gate.reject(new Error('native decode reset')); await rejected
    expect(image.onerror).toBeNull(); expect(image.onload).toBeNull()
    native.dispose()
  })

  it('does not publish a late successful decode after cancellation, or admit its frame', async () => {
    const gate = deferred(), image = imagePort(() => gate.promise), abort = new AbortController(), admit = vi.fn()
    const native = browserVisualDecoder({ kind: 'image', url: 'image', admitFrame: admit }, abort.signal)
    const rejected = expect(native.ready).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort(); gate.resolve(); await rejected
    expect(admit).not.toHaveBeenCalled(); expect(image.onerror).toBeNull(); native.dispose()
  })

  it('validates dimensions before publication and propagates failed owner admission', async () => {
    const image = imagePort(async () => {}), admit = vi.fn(() => { throw new RangeError('frame budget refused') })
    const native = browserVisualDecoder({ kind: 'image', url: 'image', admitFrame: admit }, new AbortController().signal)
    await expect(native.ready).rejects.toThrow('frame budget refused')
    expect(admit).toHaveBeenCalledWith(12, 34); expect(image.onerror).toBeNull(); native.dispose()
  })

  it('keeps a timed-out decode promise owned until actual completion', async () => {
    vi.useFakeTimers()
    const gate = deferred(), image = imagePort(() => gate.promise)
    const native = browserVisualDecoder({ kind: 'image', url: 'image' }, new AbortController().signal)
    let settled = false
    const pending = native.ready.finally(() => { settled = true }), rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(15000)
    expect(settled).toBe(false); expect(image.removeAttribute).toHaveBeenCalledWith('src')
    gate.resolve(); await rejected; expect(vi.getTimerCount()).toBe(0); native.dispose()
  })

  it('supports an event-only legacy image port and synchronous decode errors', async () => {
    const image = imagePort(), native = browserVisualDecoder({ kind: 'image', url: 'image' }, new AbortController().signal)
    image.onload!(); await native.ready; expect(native.width).toBe(12); native.dispose()
    imagePort(() => { throw new Error('decode invocation failed') })
    const failed = browserVisualDecoder({ kind: 'image', url: 'image' }, new AbortController().signal)
    await expect(failed.ready).rejects.toThrow('decode invocation failed'); failed.dispose()
  })

  it('admits video metadata before requesting first-frame preload and resets failed work', async () => {
    const video = { videoWidth: 1920, videoHeight: 1080, preload: '', src: '', muted: false, playsInline: false, crossOrigin: '',
      onload: null, onerror: null, onloadedmetadata: null as null | (() => void), onloadeddata: null as null | (() => void),
      pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn() }
    vi.stubGlobal('document', { createElement: () => video })
    const admit = vi.fn(() => { expect(video.preload).toBe('metadata'); throw new RangeError('video frame refused') })
    const native = browserVisualDecoder({ kind: 'video', url: 'movie', admitFrame: admit }, new AbortController().signal)
    const rejected = expect(native.ready).rejects.toThrow('video frame refused')
    expect(video.preload).toBe('metadata'); video.onloadedmetadata!(); await rejected
    expect(video.preload).toBe('metadata'); expect(video.onloadeddata).toBeNull()
    native.dispose(); expect(video.pause).toHaveBeenCalledOnce(); expect(video.removeAttribute).toHaveBeenCalledWith('src')
  })
})
