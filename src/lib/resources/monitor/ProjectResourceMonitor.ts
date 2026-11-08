import type { ChronoScene } from '@/lib/types'
import type { AudioResourceSnapshot } from '@/lib/audioEngine'
import { getAudioAssetService } from '@/lib/audio/AudioAssetService'
import { staticGroupLodCache } from '@/lib/render/lod/StaticGroupLodCache'
import { renderSurfacePool } from '@/lib/render/resources/CanvasSurfacePool'
import { canvasMemoryTracker } from '../memory/CanvasMemoryTracker'
import { browserMemoryReader } from '../memory/BrowserMemoryReader'
import { paintWorkMonitor } from '../performance/PaintWorkMonitor'
import { renderWorkMonitor } from '../performance/RenderWorkMonitor'
import { gpuWorkRegistry } from '../performance/GpuWorkRegistry'
import { editorResourceBudget } from '../budget'
import { editorMediaPreparation } from '../jobs'
import { editorImportPreparation } from '@/lib/import/resources/editorImportPreparation'
import { assetSourcePool } from '@/lib/asset/sources'
import { visualAssetService } from '@/lib/asset/visual'
import { fontAssetService } from '@/lib/asset/fonts'
import {editorMediaProbes} from '@/lib/asset/metadata/editorMediaProbes'
import {editorOutlineFonts} from '@/lib/text/fonts'
import {editorOutputResources} from '@/lib/export/resources'
import { summarizeMediaResources, type MediaElementMap, type MediaQuery } from './mediaResources'

export interface ProjectMonitorInputs {
  scene: ChronoScene
  media: MediaElementMap
  isPlaying: boolean
  audio?: () => AudioResourceSnapshot
  audioErrors?: () => Record<string, string>
}
const defaults = { pool: renderSurfacePool, canvases: canvasMemoryTracker,
  browser: browserMemoryReader, work: renderWorkMonitor, paint: paintWorkMonitor, lod: staticGroupLodCache, gpu: gpuWorkRegistry,
  budget: editorResourceBudget, sources: assetSourcePool, visual: visualAssetService, fonts: fontAssetService,
  mediaPreparation: editorMediaPreparation, importPreparation: editorImportPreparation,
  probes:editorMediaProbes,outlines:editorOutlineFonts,outputs:editorOutputResources }
interface Dependencies {
  pool: Pick<typeof renderSurfacePool, 'getSnapshot' | 'clearIdle'>
  canvases: Pick<typeof canvasMemoryTracker, 'getSnapshot'>
  browser: Pick<typeof browserMemoryReader, 'getSnapshot' | 'requestSample'>
  work: Pick<typeof renderWorkMonitor, 'getSnapshot'>
  paint: Pick<typeof paintWorkMonitor, 'getSnapshot'>
  lod: Pick<typeof staticGroupLodCache, 'getSnapshot' | 'clear'>
  gpu: Pick<typeof gpuWorkRegistry, 'getSnapshot' | 'observe'> & Partial<Pick<typeof gpuWorkRegistry, 'clearIdle'>>
  budget: Pick<typeof editorResourceBudget, 'getSnapshot' | 'reclaimIdle'>
  sources: Pick<typeof assetSourcePool, 'getSnapshot'>
  visual: Pick<typeof visualAssetService, 'getSnapshot'> & Partial<Pick<typeof visualAssetService,'clearIdle'>>
  fonts: Pick<typeof fontAssetService, 'getSnapshot' | 'clearIdle'>
  probes:Pick<typeof editorMediaProbes,'getSnapshot'|'clearIdle'>
  outlines:Pick<typeof editorOutlineFonts,'getSnapshot'|'clearIdle'>
  outputs:Pick<typeof editorOutputResources,'getSnapshot'|'clearIdle'>
  mediaPreparation: Pick<typeof editorMediaPreparation, 'getSnapshot'>
  importPreparation: Pick<typeof editorImportPreparation, 'getSnapshot'>
}

/** Counts persisted project work only when the scene identity changes; no JSON copy/size estimation. */
function summarizeProject(scene: ChronoScene) {
  let tracks = 0, keyframes = 0
  scene.timelines.forEach(timeline => {
    tracks += timeline.tracks.length
    timeline.tracks.forEach(track => { keyframes += track.keyframes.length })
  })
  return { layers: scene.layers.length, timelines: scene.timelines.length, tracks, keyframes, assets: scene.assets.length }
}

/**
 * Composes resource-owner diagnostics for a project without owning their data.
 * Snapshot computation occurs only during active panel sampling/actions. Project
 * counts are cached per scene identity; media is paged, timings are bounded.
 * The known-resource sum is partial and includes the editor session's retained
 * canvases/PCM/GPU buffers. Mask pool bytes are a subset of tracked canvases and
 * MUST NOT be added twice. Browser heap/page estimates remain separate totals.
 */
export class ProjectResourceMonitor {
  private countedScene: ChronoScene | null = null
  private project: ReturnType<typeof summarizeProject> | null = null
  private query: MediaQuery = { page: 0, search: '' }
  private deps: Dependencies
  constructor(private inputs: ProjectMonitorInputs, dependencies: Partial<Dependencies> = {}) {
    this.deps = { ...defaults, ...dependencies }
  }

  /** Replaces borrowed inputs and invalidates cached counts on scene replacement.
   * Drop the previous identity immediately, including while observation is paused:
   * retaining it until the next snapshot would keep a closed project's graph alive.
   * Counts remain lazy; repeated renders of the same source do not rescan tracks.
   */
  setInputs(inputs: ProjectMonitorInputs): void {
    if (inputs.scene !== this.inputs.scene) { this.countedScene = null; this.project = null }
    this.inputs = inputs
  }

  /** Lightweight explicit filter/paging action; the next snapshot clamps invalid page indices. */
  setMediaQuery(query: MediaQuery): void { this.query = { ...query } }

  /** Enables optional GPU timers only for an actively observed, visible panel. */
  observe(): () => void { return this.deps.gpu.observe() }

  /** Releases idle registered resources (scratch/LOD/PCM); preserves active
   * leases, original source assets and undo. Does not cancel native work. */
  clearIdle(): void {
    this.deps.budget.reclaimIdle(); this.deps.gpu.clearIdle?.(); this.deps.fonts.clearIdle()
    this.deps.visual.clearIdle?.();this.deps.outputs.clearIdle()
    this.deps.probes.clearIdle();this.deps.outlines.clearIdle();this.deps.pool.clearIdle();this.deps.lod.clear()
  }

  /** Explicit, single-flight browser-page estimate; no automatic isolation/header changes. */
  requestMemorySample(): Promise<void> { return this.deps.browser.requestSample() }

  /** Detached numeric view; no source URLs, GPU/DOM handles or scene objects escape. */
  getSnapshot() {
    const { scene, media, isPlaying, audio: getAudio, audioErrors } = this.inputs
    if (scene !== this.countedScene) {
      this.project = summarizeProject(scene)
      this.countedScene = scene
    }
    const audio = getAudio?.() ?? { ...getAudioAssetService().getMemorySnapshot(), ...getAudioAssetService().describeAssets(scene.assets) }
    const resources = summarizeMediaResources(scene.assets, media, audio, audioErrors?.() ?? {}, this.query)
    const visual = this.deps.visual.getSnapshot()
    const canvases = this.deps.canvases.getSnapshot()
    const gpu = this.deps.gpu.getSnapshot()
    const gpuBufferBytes = gpu.reduce((sum, g) => sum + g.bufferBytes, 0)
    const stagingBytes = gpu.reduce((sum, g) => sum + g.stagingBytes, 0)
    const gpuTextureBytes = gpu.reduce((sum, g) => sum + (g.textureBytes ?? 0), 0)
    // Managed maps are borrowed views: include their owner's warm/retired values
    // once, not just viewport-ready aliases. Legacy foreign maps retain their
    // earlier partial element estimate (their external lifetime is untracked).
    const visualBytes = media.media ? visual.residency.categories.image.residentBytes + visual.residency.categories.video.residentBytes
      : resources.imageBytes + resources.videoFrameBytes
    const knownBytes = canvases.canvas2dBytes + canvases.webglBytes + visualBytes + audio.bytes + gpuBufferBytes + stagingBytes + gpuTextureBytes
    return { sampledAt: Date.now(), project: this.project!, isPlaying, media: resources,
      audio: { bytes: audio.bytes, bufferCount: audio.bufferCount, pendingCount: audio.pendingCount,
        preparation: audio.preparation, residency: audio.residency },
      visual, fonts: this.deps.fonts.getSnapshot(),probes:this.deps.probes.getSnapshot(),outlines:this.deps.outlines.getSnapshot(),outputs:this.deps.outputs.getSnapshot(),
      mediaPreparation: this.deps.mediaPreparation.getSnapshot(), importPreparation: this.deps.importPreparation.getSnapshot(),
      canvases, gpu, gpuBufferBytes, stagingBytes, gpuTextureBytes, knownBytes, lod: this.deps.lod.getSnapshot(),
      budget: this.deps.budget.getSnapshot(), sources: this.deps.sources.getSnapshot(), paint: this.deps.paint.getSnapshot(scene),
      browser: this.deps.browser.getSnapshot(), work: this.deps.work.getSnapshot(), pool: this.deps.pool.getSnapshot() }
  }
}

export type ProjectResourceSnapshot = ReturnType<ProjectResourceMonitor['getSnapshot']>
/** UI depends only on diagnostic operations, never on renderer/solver implementation methods. */
export type ProjectMonitorSource = Pick<ProjectResourceMonitor,
  'getSnapshot' | 'observe' | 'clearIdle' | 'requestMemorySample' | 'setMediaQuery'>
