import { AudioAssetService } from '@/lib/audio/AudioAssetService'
import { AudioEngine } from '@/lib/audioEngine'
import { VisualAssetService } from '@/lib/asset/visual/VisualAssetService'
import { FontAssetService } from '@/lib/asset/fonts/FontAssetService'
import { browserVisualDecoder } from '@/lib/asset/visual/browserVisualDecoder'
import { browserFontDecoder } from '@/lib/asset/fonts/browserFontDecoder'
import { assetSourcePool } from '@/lib/asset/sources'
import { nativePng, nativeWebm } from '@/lib/asset/visual/__tests__/nativeMediaFixtures'
import { nativeStereoSource } from '@/lib/audio/__tests__/nativeStereoSource'
import { ResourceBudget } from '../../budget'
import { ProjectResourceMonitor } from '../../monitor/ProjectResourceMonitor'
import { emptyScene } from '@/lib/defaults'
import type { Asset } from '@/lib/types'
import { BoundedJobQueue } from '../BoundedJobQueue'

/** Explicit settlement boundary for private browser QA, never a production
 * timeout or claim that native decoding can be interrupted. */
function gate() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

/** Poll observable lifecycle state with a finite QA deadline. */
export async function until(test: () => boolean) {
  const end = performance.now() + 20000
  while (!test()) {
    if (performance.now() > end) throw new Error('Shared preparation acceptance timed out')
    await new Promise(requestAnimationFrame)
  }
}

/** Isolated real WAV/PNG/video/WOFF owners. Completion gates hold actual native
 * results only to exercise long non-abortable settlement and panel inspection.
 * Fixture generation precedes measured admission; no connected editor, external
 * network, camera/microphone, or production singleton is modified. */
export async function createNativeMediaPreparationFixture() {
  const fontResponse = await fetch('native-font.woff')
  if (!fontResponse.ok) throw new Error(`QA WOFF fixture unavailable (${fontResponse.status})`)
  const blobs = [nativeStereoSource(), await nativePng(), await fontResponse.blob(), await nativeWebm()]
  const sources = blobs.map(blob => assetSourcePool.create(blob)), executor = new BoundedJobQueue({ concurrency: 2, maxQueued: 128 })
  const budget = new ResourceBudget({ maxBytes: 512 * 1024 ** 2 }), holds = { audio: gate(), image: gate(), font: gate(), video: gate() }
  holds.video.release()
  const nativeReady = new Set<string>(), started: string[] = [], disposed: string[] = []
  let active = 0, peak = 0
  /** Track native adapter bodies through actual ready and controlled delivery;
   * no synthesized decoded data is substituted for browser output. */
  const hold = <T,>(kind: keyof typeof holds, promise: Promise<T>): Promise<T> => {
    active++; peak = Math.max(peak, active); started.push(kind)
    return promise.then(async value => { nativeReady.add(kind); await holds[kind].promise; return value }).finally(() => { active-- })
  }
  const context = new AudioContext({ sampleRate: 48000 }), decode = context.decodeAudioData.bind(context)
  context.decodeAudioData = ((data: ArrayBuffer) => hold('audio', decode(data))) as typeof context.decodeAudioData
  const audio = new AudioAssetService({ executor, budget, decodeReserveBytes: 24000, createContext: () => context })
  const visual = new VisualAssetService({ executor, budget, decoder: (input, signal) => {
    const resource = browserVisualDecoder(input, signal)
    return { element: resource.element, get width() { return resource.width }, get height() { return resource.height },
      ready: hold(input.kind, resource.ready), dispose() { disposed.push(input.kind); resource.dispose() } }
  } })
  const fonts = new FontAssetService({ executor, budget, timeoutMs: 120000, decoder: (input, signal) => {
    const resource = browserFontDecoder(input, signal)
    return { alias: resource.alias, ready: hold('font', resource.ready), dispose() { disposed.push('font'); resource.dispose() } }
  } })
  const assets: Asset[] = [
    { id: 'audio', name: 'Native stereo WAV', type: 'audio', url: sources[0].url, durationMs: 50 },
    { id: 'image', name: 'Native PNG', type: 'image', url: sources[1].url, width: 32, height: 32 },
    { id: 'font', name: 'Native WOFF', type: 'font', url: sources[2].url, metadata: { notes: 'family: Brand', filesize: blobs[2].size } },
    { id: 'video', name: 'Native independent video', type: 'video', url: sources[3].url, width: 32, height: 32 },
  ]
  const scene = { ...emptyScene(), assets }, media = new Map<string, HTMLImageElement | HTMLVideoElement>(), engine = new AudioEngine(audio)
  const monitor = new ProjectResourceMonitor({ scene, media, isPlaying: false, audio: () => engine.getResourceSnapshot() },
    { mediaPreparation: executor, budget, visual, fonts })
  const pending: Promise<unknown>[] = [], pins: { release(): void }[] = [], surfaces: HTMLCanvasElement[] = []
  return { sources, assets, scene, media, monitor, engine, audio, visual, fonts, executor, budget, holds, nativeReady, started, disposed, pending, pins,
    stats: () => ({ active, peak, started: [...started], disposed: [...disposed] }),
    /** Recreate the same valid WAV after proving an earlier URL was revoked. */
    audioSource() { const source = assetSourcePool.create(blobs[0]); sources.push(source); return source },
    /** Only test visuals use these small owned canvases; all are reset on close. */
    surface(width = 240, height = 48) { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; surfaces.push(canvas); return canvas },
    /** Release gates, cancel each owner independently, await actual scheduler
     * settlement, then release pins/registrations/sources. Never fake a zero
     * native count just because consumers rejected on cancellation. */
    async dispose() {
      Object.values(holds).forEach(item => item.release())
      audio.cancelPending(); visual.cancelPending(); fonts.cancelPending()
      await Promise.allSettled(pending)
      await until(() => executor.getSnapshot().active === 0 && executor.getSnapshot().queued === 0)
      engine.dispose(); pins.forEach(pin => pin.release()); media.clear()
      await audio.dispose(); visual.dispose(); fonts.dispose()
      sources.forEach(source => source.release()); surfaces.forEach(canvas => { canvas.width = canvas.height = 0 })
      executor.dispose(); await Promise.resolve()
    },
  }
}

export type NativeMediaPreparationFixture = Awaited<ReturnType<typeof createNativeMediaPreparationFixture>>
