import type { ChronoScene } from '@/lib/types'
import { evaluateTimelines } from '@/lib/evaluator'
import { compareLodPixels } from './compareLodPixels'
import { CanvasRenderer } from '@/lib/render/CanvasRenderer'
import type { AssetCache } from '@/app/hooks/useAssetCache'
import type { AudioEngineHandle } from '@/app/hooks/useAudioEngine'
import { ProjectResourceMonitor } from '../../monitor/ProjectResourceMonitor'
import { canvasMemoryTracker } from '../../memory/CanvasMemoryTracker'
import { VisibleTimeClock } from '../VisibleTimeClock'
import type { BaselineSample } from '../types'
import type { BaselineHost } from '../BaselineRunner'

/**
 * Standalone browser renderer adapter. Reuses the production asset/audio hooks
 * via the entry bridge, evaluator, renderer and resource monitor. It measures
 * evaluateTimelines + preview drawing only: editor React/DOM, SM/bindings and
 * media transport/seek work are not included. A fresh page owns each fixture's
 * module singletons; final disposal cancels observation and releases its canvas.
 */
export class BrowserBaselineHost implements BaselineHost {
  readonly durationMs: number
  private lastTime = 0
  private quality: Array<ReturnType<typeof compareLodPixels> & { timeMs: number }> = []
  private renderer: CanvasRenderer
  private clock = new VisibleTimeClock(!document.hidden, performance.now())
  private monitor: ProjectResourceMonitor
  private releaseObservation: () => void
  private context: CanvasRenderingContext2D
  private visibility = () => this.clock.setVisible(!document.hidden, performance.now())
  constructor(private scene: ChronoScene, private canvas: HTMLCanvasElement,
    private assets: AssetCache, audio: Pick<AudioEngineHandle, 'getResources' | 'getState'> | undefined, private lodZoom?: number,
    surfaceRegions = true) {
    this.renderer = new CanvasRenderer(undefined, undefined, surfaceRegions)
    this.durationMs = scene.composition.durationMs
    canvas.width = scene.composition.width; canvas.height = scene.composition.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas2D unavailable')
    this.context = context
    this.monitor = new ProjectResourceMonitor({ scene, media: assets, isPlaying: false,
      audio: audio?.getResources, audioErrors: audio ? () => audio.getState().errors : undefined })
    this.releaseObservation = this.monitor.observe()
    document.addEventListener('visibilitychange', this.visibility)
  }

  /** Active-document milliseconds; no wall time from hidden tabs enters warmup. */
  activeNow(): number { return this.clock.read(performance.now()) }

  /** One visible RAF, with no surviving frame/listener on cancellation or completion. */
  nextFrame(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let id: number
      const cancel = () => { cancelAnimationFrame(id); signal.removeEventListener('abort', cancel); reject(new Error('cancelled')) }
      const tick = () => {
        if (document.hidden) { id = requestAnimationFrame(tick); return }
        signal.removeEventListener('abort', cancel)
        resolve()
      }
      if (signal.aborted) { reject(new Error('cancelled')); return }
      signal.addEventListener('abort', cancel, { once: true })
      id = requestAnimationFrame(tick)
    })
  }

  /** Times synchronous evaluator/render separately; diagnostics are collected outside those intervals. */
  draw(timeMs: number, repetition: number): BaselineSample {
    this.lastTime = timeMs
    const start = performance.now()
    const overrides = evaluateTimelines(this.scene.timelines, timeMs)
    const evaluated = performance.now()
    this.renderer.render(this.context, this.scene, timeMs, null, this.assets, { overrides, renderMode: 'preview', lod: this.lodZoom === undefined ? undefined : { zoom: this.lodZoom } })
    const rendered = performance.now()
    const paint = this.renderer.getLastPaintStatistics()
    const s = this.monitor.getSnapshot()
    return { repetition, timeMs, evaluationMs: evaluated - start, renderMs: rendered - evaluated,
      processedLayers: paint?.processed ?? 0, culledLayers: paint?.culled ?? 0,
      lodRepresentedLayers: paint?.lodRepresented ?? 0, lodGroups: paint?.lodGroups ?? 0, lodBuilds: paint?.lodBuilds ?? 0,
      lodResidentBytes: s.lod.residentBytes, lodHits: s.lod.hits, lodMisses: s.lod.misses, lodBudgetDenials: s.lod.budgetDenials,
      layerVisits: this.renderer.getLastLayerVisitCount(), knownBytes: s.knownBytes, heapBytes: s.browser.heap?.used ?? null,
      canvas2dBytes: s.canvases.canvas2dBytes, canvas2dCount: s.canvases.canvas2dCount,
      canvasRegistrations: canvasMemoryTracker.getRegistrationCount(),
      maskResidentBytes: s.pool.residentBytes, maskAllocations: s.pool.allocations, maskReuses: s.pool.reuses,
      admittedBytes: s.budget.chargedBytes, admissionProtectedBytes: s.budget.protectedBytes, admissionDenials: s.budget.denials,
      imageBytes: s.media.imageBytes, videoFrameBytes: s.media.videoFrameBytes, pcmBytes: s.audio.bytes,
      gpuBufferBytes: s.gpuBufferBytes, gpuDrawCalls: s.gpu.reduce((sum, g) => sum + g.drawCalls, 0),
      gpuMs: s.gpu.find(g => g.gpuMs !== null)?.gpuMs ?? null }
  }

  /** Hashes full RGBA output after timing. Readback/hash overhead is excluded from CPU render samples. */
  /** Detached post-timing quality rows; no readback enters render samples. */
  getLodQuality() { return this.quality.map(row => ({ ...row })) }

  async checkpoint(): Promise<string> {
    if (this.lodZoom !== undefined) {
      const reference = document.createElement('canvas')
      reference.width = this.canvas.width; reference.height = this.canvas.height
      try {
        new CanvasRenderer().render(reference.getContext('2d')!, this.scene, this.lastTime, null, this.assets, { renderMode: 'preview' })
        this.quality.push({ timeMs: this.lastTime, ...compareLodPixels(reference, this.canvas, this.lodZoom) })
      } finally { reference.width = reference.height = 0 }
    }
    const pixels = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    const digest = await crypto.subtle.digest('SHA-256', pixels.data.buffer as ArrayBuffer)
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  }

  /** Current raw diagnostics for explicit post-idle checks; no rendering or resource allocation. */
  getSnapshot() { return this.monitor.getSnapshot() }

  /** Releases only this harness's observation/canvas. Page navigation owns remaining module singletons. */
  dispose(): void {
    this.releaseObservation()
    document.removeEventListener('visibilitychange', this.visibility)
    this.canvas.width = this.canvas.height = 0
  }
}
