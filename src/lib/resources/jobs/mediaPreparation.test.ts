import { expect, it, vi } from 'vitest'
import { BoundedJobQueue } from './BoundedJobQueue'
import { AudioAssetService } from '../../audio/AudioAssetService'
import { VisualAssetService } from '../../asset/visual/VisualAssetService'
import { FontAssetService } from '../../asset/fonts/FontAssetService'
import { ResourceBudget } from '../budget'
import { assetSourcePool } from '../../asset/sources'

/** Native producer bodies are held until explicit settlement; browser QA uses
 * real WAV/PNG/WOFF decoding with the same service composition. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}

it('admits real domain owners through one capacity pool before reservations/native creation and preserves independent pins', async () => {
  const executor = new BoundedJobQueue({ concurrency: 2 }), budget = new ResourceBudget({ maxBytes: 4 * 1024 ** 2 })
  const audioGate = deferred<AudioBuffer>(), imageGate = deferred<void>(), fontGate = deferred<void>()
  const decodeAudioData = vi.fn(() => audioGate.promise), nativeImage = { element: {} as HTMLImageElement,
    width: 2, height: 2, ready: imageGate.promise, dispose: vi.fn() }
  const visualDecoder = vi.fn(() => nativeImage), fontDispose = vi.fn()
  const fontDecoder = vi.fn(({ alias }: { alias: string }) => ({ alias, ready: fontGate.promise, dispose: fontDispose }))
  const audio = new AudioAssetService({ executor, budget, maxBytes: 128, decodeReserveBytes: 32,
    fetch: async () => new Response(new ArrayBuffer(1)), createContext: () => ({ state: 'running', decodeAudioData, close: async () => {} } as unknown as AudioContext) })
  const visual = new VisualAssetService({ executor, budget, decoder: visualDecoder })
  const fonts = new FontAssetService({ executor, budget, decoder: fontDecoder })
  const source = assetSourcePool.create(new Blob(['audio'])), cancel = new AbortController()
  const pendingAudio = audio.acquireUrl(source.url, { signal: cancel.signal })
  const cancelled = expect(pendingAudio).rejects.toMatchObject({ name: 'AbortError' })
  const pendingImage = visual.acquire({ id: 'image', name: 'Image', type: 'image', url: 'image', width: 2, height: 2 })
  const pendingFont = fonts.acquire({ id: 'font', name: 'Font', type: 'font', url: 'font', metadata: { notes: 'family: Brand', filesize: 100 } })
  try {
    await vi.waitFor(() => expect(executor.getSnapshot()).toMatchObject({ active: 2, queued: 1 }))
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledOnce())
    expect(visualDecoder).toHaveBeenCalledOnce(); expect(fontDecoder).not.toHaveBeenCalled()
    expect(fonts.getSnapshot()).toMatchObject({ preparation: { executing: 0, waitingForExecutor: 1 }, residency: { reservedBytes: 0 } })
    expect(budget.getSnapshot().chargedBytes).toBe(49)
    cancel.abort(); await cancelled; source.release()
    audio.cancelPending()
    expect(executor.getSnapshot()).toMatchObject({ active: 2, queued: 1, closed: false })
    expect((await fetch(source.url)).ok).toBe(true); expect(fontDecoder).not.toHaveBeenCalled()
    imageGate.resolve(); const image = await pendingImage, finalImage = image.retain()
    await vi.waitFor(() => expect(fontDecoder).toHaveBeenCalledOnce())
    fontGate.resolve(); const font = await pendingFont, finalFont = font.retain()
    visual.cancelPending(); fonts.cancelPending(); image.release(); font.release(); budget.reclaimIdle()
    expect(nativeImage.dispose).not.toHaveBeenCalled(); expect(fontDispose).not.toHaveBeenCalled()
    expect(finalImage.value).toBe(nativeImage); expect(finalFont.value.alias).toContain('__chorono_font_')
    audioGate.resolve({ length: 8, numberOfChannels: 1 } as AudioBuffer)
    await vi.waitFor(() => expect(executor.getSnapshot().active).toBe(0))
    expect(audio.getMemorySnapshot().bytes).toBe(0); await expect(fetch(source.url)).rejects.toThrow()
    expect(budget.getSnapshot().chargedBytes).toBe(1024 ** 2 + 16)
    finalImage.release(); finalFont.release()
    expect(nativeImage.dispose).toHaveBeenCalledOnce(); expect(fontDispose).toHaveBeenCalledOnce()
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  } finally {
    source.release(); audioGate.resolve({ length: 8, numberOfChannels: 1 } as AudioBuffer); imageGate.resolve(); fontGate.resolve()
    await audio.dispose(); visual.dispose(); fonts.dispose()
    await Promise.allSettled([pendingAudio, pendingImage, pendingFont])
  }
})
