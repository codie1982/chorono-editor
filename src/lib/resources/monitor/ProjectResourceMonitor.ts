import type { ChronoScene } from '@/lib/types'
import type { AudioResourceSnapshot } from '@/lib/audioEngine'
import { getAudioAssetService } from '@/lib/audio/AudioAssetService'
import { renderSurfacePool } from '@/lib/render/resources/CanvasSurfacePool'
import { canvasMemoryTracker } from '../memory/CanvasMemoryTracker'
import { browserMemoryReader } from '../memory/BrowserMemoryReader'
import { renderWorkMonitor } from '../performance/RenderWorkMonitor'
import { gpuWorkRegistry } from '../performance/GpuWorkRegistry'
import { summarizeMediaResources, type MediaElement, type MediaQuery } from './mediaResources'

export interface ProjectMonitorInputs {
  scene: ChronoScene
  media: ReadonlyMap<string, MediaElement>
  isPlaying: boolean
  audio?: () => AudioResourceSnapshot
  audioErrors?: () => Record<string, string>
}
const defaults = { pool: renderSurfacePool, canvases: canvasMemoryTracker,
  browser: browserMemoryReader, work: renderWorkMonitor, gpu: gpuWorkRegistry }
interface Dependencies {
  pool: Pick<typeof renderSurfacePool, 'getSnapshot' | 'clearIdle'>
  canvases: Pick<typeof canvasMemoryTracker, 'getSnapshot'>
  browser: Pick<typeof browserMemoryReader, 'getSnapshot' | 'requestSample'>
  work: Pick<typeof renderWorkMonitor, 'getSnapshot'>
  gpu: Pick<typeof gpuWorkRegistry, 'getSnapshot' | 'observe'>
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

  /** Replaces borrowed current inputs; never accumulates prior scene/history references. */
  setInputs(inputs: ProjectMonitorInputs): void { this.inputs = inputs }

  /** Lightweight explicit filter/paging action; the next snapshot clamps invalid page indices. */
  setMediaQuery(query: MediaQuery): void { this.query = { ...query } }

  /** Enables optional GPU timers only for an actively observed, visible panel. */
  observe(): () => void { return this.deps.gpu.observe() }

  /** Clears only idle mask surfaces, preserving rendering/medias/undo ownership. */
  clearIdle(): void { this.deps.pool.clearIdle() }

  /** Explicit, single-flight browser-page estimate; no automatic isolation/header changes. */
  requestMemorySample(): Promise<void> { return this.deps.browser.requestSample() }

  /** Detached numeric view; no source URLs, GPU/DOM handles or scene objects escape. */
  getSnapshot() {
    const { scene, media, isPlaying, audio: getAudio, audioErrors } = this.inputs
    if (scene !== this.countedScene) {
      this.project = summarizeProject(scene)
      this.countedScene = scene
    }
    const audio = getAudio?.() ?? { ...getAudioAssetService().getMemorySnapshot(), assets: [] }
    const resources = summarizeMediaResources(scene.assets, media, audio, audioErrors?.() ?? {}, this.query)
    const canvases = this.deps.canvases.getSnapshot()
    const gpu = this.deps.gpu.getSnapshot()
    const gpuBufferBytes = gpu.reduce((sum, g) => sum + g.bufferBytes, 0)
    const stagingBytes = gpu.reduce((sum, g) => sum + g.stagingBytes, 0)
    const knownBytes = canvases.canvas2dBytes + canvases.webglBytes + resources.imageBytes
      + resources.videoFrameBytes + audio.bytes + gpuBufferBytes + stagingBytes
    return { sampledAt: Date.now(), project: this.project!, isPlaying, media: resources,
      audio: { bytes: audio.bytes, bufferCount: audio.bufferCount, pendingCount: audio.pendingCount },
      canvases, gpu, gpuBufferBytes, stagingBytes, knownBytes,
      browser: this.deps.browser.getSnapshot(), work: this.deps.work.getSnapshot(), pool: this.deps.pool.getSnapshot() }
  }
}

export type ProjectResourceSnapshot = ReturnType<ProjectResourceMonitor['getSnapshot']>
/** UI depends only on diagnostic operations, never on renderer/solver implementation methods. */
export type ProjectMonitorSource = Pick<ProjectResourceMonitor,
  'getSnapshot' | 'observe' | 'clearIdle' | 'requestMemorySample' | 'setMediaQuery'>
