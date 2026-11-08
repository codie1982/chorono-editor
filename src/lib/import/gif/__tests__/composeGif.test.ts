import { expect, it, vi } from 'vitest'
import { composeGif, type GifFrame, type GifPlatform } from '../composeGif'
import { planGifSheet } from '../planGifSheet'
import { resolveGifLimits } from '../types'
import { browserGifPlatform } from '../browserGifPlatform'

const limits = resolveGifLimits(), plan = planGifSheet({ width: 4, height: 4, frameCount: 3 }, limits)

/** Typed fake native handles exercise lifecycle, not canvas/pixel algorithms. */
function platform(options: { drawError?: boolean; encode?: () => Promise<Blob>; decode?: (i: number) => Promise<GifFrame>; count?: number } = {}) {
  let live = 0, peak = 0
  const close = vi.fn(), dispose = vi.fn(), draw = vi.fn(() => { if (options.drawError) throw new Error('draw failed') })
  const frame = (i: number): GifFrame => {
    live++; peak = Math.max(live, peak)
    return { displayWidth: 4, displayHeight: 4, codedWidth: 4, codedHeight: 4, duration: (i + 1) * 100000,
      close: vi.fn(() => { live-- }) }
  }
  const native: GifPlatform<GifFrame> = { open: () => ({ ready: Promise.resolve(options.count ?? 3), decode: options.decode ?? (async i => frame(i)), close }),
    surface: () => ({ draw, encode: options.encode ?? (async () => new Blob(['PNG'])), dispose }) }
  return { native, close, dispose, draw, frame, get live() { return live }, get peak() { return peak } }
}

it('draws/closes one frame at a time with original ordering, grid and averaged ms timing', async () => {
  const p = platform(), result = await composeGif(new ArrayBuffer(0), plan, limits, p.native)
  expect(result).toMatchObject({ columns: 2, rows: 2, frameCount: 3, avgFrameMs: 200 })
  expect(p.draw.mock.calls.map(call => call.slice(1))).toEqual([[0, 0], [4, 0], [0, 4]])
  expect(p.peak).toBe(1); expect(p.live).toBe(0); expect(p.close).toHaveBeenCalledOnce(); expect(p.dispose).toHaveBeenCalledOnce()
})

it('closes frames/decoder/surface on draw error and rejects mismatched count before allocating a canvas', async () => {
  const p = platform({ drawError: true })
  await expect(composeGif(new ArrayBuffer(0), plan, limits, p.native)).rejects.toThrow('draw failed')
  expect(p.live).toBe(0); expect(p.close).toHaveBeenCalledOnce(); expect(p.dispose).toHaveBeenCalledOnce()
  const wrong = platform({ count: 4 })
  await expect(composeGif(new ArrayBuffer(0), plan, limits, wrong.native)).rejects.toThrow('count')
  expect(wrong.close).toHaveBeenCalledOnce(); expect(wrong.dispose).not.toHaveBeenCalled()
})

it('holds native decode until actual settlement on abort, then closes the late frame before cleanup', async () => {
  const started = Promise.withResolvers<void>(), done = Promise.withResolvers<void>(), abort = new AbortController()
  const p = platform({ decode: async () => { started.resolve(); await done.promise; return p.frame(0) } })
  const pending = composeGif(new ArrayBuffer(0), plan, limits, p.native, { signal: abort.signal })
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await started.promise; abort.abort()
  expect(p.close).not.toHaveBeenCalled(); expect(p.dispose).not.toHaveBeenCalled()
  done.resolve(); await rejected
  expect(p.live).toBe(0); expect(p.draw).not.toHaveBeenCalled(); expect(p.close).toHaveBeenCalledOnce(); expect(p.dispose).toHaveBeenCalledOnce()
})

it('keeps canvas through native encoding settlement and rejects late abort or oversized PNG', async () => {
  const started = Promise.withResolvers<void>(), done = Promise.withResolvers<Blob>(), abort = new AbortController()
  const p = platform({ encode: () => { started.resolve(); return done.promise } })
  const pending = composeGif(new ArrayBuffer(0), plan, limits, p.native, { signal: abort.signal })
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await started.promise; abort.abort(); expect(p.close).toHaveBeenCalledOnce(); expect(p.dispose).not.toHaveBeenCalled()
  done.resolve(new Blob(['PNG'])); await rejected; expect(p.dispose).toHaveBeenCalledOnce()
  const oversized = platform({ encode: async () => new Blob([new Uint8Array(plan.encodeReserveBytes + 1)]) })
  await expect(composeGif(new ArrayBuffer(0), plan, limits, oversized.native)).rejects.toThrow('output byte limit')
  expect(oversized.live).toBe(0); expect(oversized.dispose).toHaveBeenCalledOnce()
})

it('native adapter clears an allocated bitmap if context acquisition throws', async () => {
  const closed = vi.fn(), surfaces: { width: number; height: number }[] = []
  vi.stubGlobal('ImageDecoder', class {
    tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: 3 } }
    completed = Promise.resolve()
    close = closed
  })
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) { surfaces.push(this) }
    getContext() { throw new Error('context allocation failed') }
  })
  try {
    await expect(composeGif(new ArrayBuffer(0), plan, limits, browserGifPlatform)).rejects.toThrow('context allocation failed')
    expect(surfaces).toEqual([{ width: 0, height: 0 }]); expect(closed).toHaveBeenCalledOnce()
  } finally { vi.unstubAllGlobals() }
})
