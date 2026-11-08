import type { Asset, ChronoScene } from './types'
import type { OverrideMap } from './evaluator'
import { AudioAssetService, getAudioAssetService, type AudioMemorySnapshot, type AudioPcmLease } from './audio/AudioAssetService'
import { MAX_AUDIO_GAIN } from './audio/audioClip'
import { audibleAudioLayers, audioModulo, buildAudioClipSchedule, evaluateAudioClip, type AudioClipSchedule } from './audio/audioEvaluation'
import { AudioDemandResolver } from './audio/AudioDemandResolver'

export interface AudioMeter { peak: number; rms: number; clipped: boolean }
export interface AudioResourceSnapshot extends AudioMemorySnapshot { assets: Array<{ id: string; bytes: number }>; loadingAssetIds?: readonly string[] }
export interface AudioEngineOptions {
  overrides?: OverrideMap
  timelineIds?: readonly string[] | null
  masterVolume?: number
  getOverridesAtTime?: (timeMs: number) => OverrideMap
}
export interface AudioEngineState {
  contextState: string
  masterVolume: number
  meter: AudioMeter
  loadingAssetIds: string[]
  errors: Record<string, string>
  sources: Array<{ layerId: string; assetId: string; sourceOffsetSec: number; gain: number; pan: number; rate: number; loop: boolean; startsAtContextSec: number; stopsAtContextSec: number }>
}
interface ActiveSource {
  source: AudioBufferSourceNode
  gain: GainNode
  pan: StereoPannerNode
  signature: string
  transportMs: number
  contextAnchorSec: number
  startsAt: number
  stopsAt: number
  buffer: AudioBuffer
  lease: AudioPcmLease
  state: AudioEngineState['sources'][number]
}
const clampGain = (value: number) => Math.max(0, Math.min(MAX_AUDIO_GAIN, Number.isFinite(value) ? value : 0))

/** Playback graph owner. Sources/stop times use AudioContext seconds; authored
 * scheduling uses composition ms. Engine demand leases and each native source
 * pin PCM independently, including through cache invalidation. Reconciliation
 * preserves automation; seek/rate/source edits create new immutable sources.
 * Instances own no source URLs and share decoded data only through the service. */
export class AudioEngine {
  private active = new Map<string, ActiveSource>()
  private assets = new Map<string, Asset>()
  private buffers = new Map<string, { url: string; buffer: AudioBuffer; lease: AudioPcmLease }>()
  private loading = new Map<string, { url: string; promise: Promise<void>; controller: AbortController }>()
  private errors: Record<string, string> = {}
  private master: GainNode | null = null
  private analysers: AnalyserNode[] = []
  private splitter: ChannelSplitterNode | null = null
  private meterData: Float32Array<ArrayBuffer> | null = null
  private masterVolume = 1
  private meter: AudioMeter = { peak: 0, rms: 0, clipped: false }
  private listeners = new Set<(meter: AudioMeter) => void>()
  private disposed = false
  private readonly demand = new AudioDemandResolver()
  constructor(private service: AudioAssetService = getAudioAssetService()) {}

  /** Numeric diagnostics of retained PCM, deduplicated across shared cache and active sources. */
  getResourceSnapshot(projectAssets: readonly Asset[] = Array.from(this.assets.values())): AudioResourceSnapshot {
    const pinned: AudioBuffer[] = []
    const described = this.service.describeAssets(projectAssets)
    const assets = new Map(described.assets.map(entry => [entry.id, entry]))
    this.buffers.forEach((entry, id) => {
      pinned.push(entry.buffer)
      assets.set(id, { id, bytes: entry.buffer.length * entry.buffer.numberOfChannels * 4 })
    })
    this.active.forEach(active => pinned.push(active.buffer))
    return { ...this.service.getMemorySnapshot(pinned), assets: Array.from(assets.values()), loadingAssetIds: described.loadingAssetIds }
  }

  /** Prepare one source through the shared service. This engine owns only its
   * consumer signal; replacement/removal/dispose cannot cancel other consumers
   * of the same URL. An aborted late completion cannot populate this engine. */
  async loadAsset(asset: Asset): Promise<void> {
    if (this.disposed) return
    this.assets.set(asset.id, asset)
    if (this.buffers.get(asset.id)?.url === asset.url) return
    const pending = this.loading.get(asset.id)
    if (pending?.url === asset.url) return pending.promise
    pending?.controller.abort()
    this.buffers.get(asset.id)?.lease.release(); this.buffers.delete(asset.id)
    const controller = new AbortController()
    let promise!: Promise<void>
    promise = (async () => {
      try {
        const lease = await this.service.acquire(asset, { signal: controller.signal })
        if (!this.disposed && !controller.signal.aborted && this.assets.get(asset.id)?.url === asset.url) {
          this.buffers.set(asset.id, { url: asset.url, buffer: lease.buffer, lease }); delete this.errors[asset.id]
        } else lease.release()
      } catch (error) {
        if (!this.disposed && !controller.signal.aborted && this.assets.get(asset.id)?.url === asset.url) this.errors[asset.id] = error instanceof Error ? error.message : String(error)
      } finally {
        if (this.loading.get(asset.id)?.promise === promise) this.loading.delete(asset.id)
      }
    })()
    this.loading.set(asset.id, { url: asset.url, promise, controller })
    return promise
  }
  /** Explicit preload compatibility API. The application uses prepareForTime;
   * this call still preloads its supplied list and releases removed consumers. */
  setAssets(assets: Asset[]): Promise<void[]> {
    const audio = assets.filter(asset => asset.type === 'audio'), wanted = new Set(audio.map(asset => asset.id))
    for (const id of Array.from(this.assets.keys())) if (!wanted.has(id)) this.removeAsset(id)
    return Promise.all(audio.map(asset => this.loadAsset(asset)))
  }
  /** Reconcile only current/ahead audible source demand. Returns null when the
   * same IDs/URLs are already requested, avoiding a promise/recursive completion
   * loop on every frame. Caller reconciles the latest transport after new loads.
   * Deprecated setAssets remains an explicit preload-all compatibility entry. */
  prepareForTime(scene: ChronoScene, timeMs: number, playbackSpeed: number, options: AudioEngineOptions = {}): Promise<void[]> | null {
    if (this.disposed) return null
    const wanted = this.demand.resolve(scene, timeMs, playbackSpeed, options)
    if (wanted.length === this.assets.size && wanted.every(asset => this.assets.get(asset.id)?.url === asset.url)) return null
    return this.setAssets(wanted)
  }
  /** Cancel this asset's pending consumer, release its retained PCM reference
   * and stop its sources. Other engine/waveform consumers remain unaffected. */
  removeAsset(assetId: string): void {
    this.loading.get(assetId)?.controller.abort()
    this.buffers.get(assetId)?.lease.release()
    this.assets.delete(assetId); this.buffers.delete(assetId); this.loading.delete(assetId); delete this.errors[assetId]
    for (const [id, active] of Array.from(this.active)) if (active.state.assetId === assetId) this.stop(id)
  }
  private ensureGraph(): AudioContext {
    const ctx = this.service.getContext()
    if (!this.master) {
      this.master = ctx.createGain(); this.master.gain.value = this.masterVolume
      this.splitter = ctx.createChannelSplitter(2)
      this.master.connect(ctx.destination)
      this.master.connect(this.splitter)
      this.analysers = [ctx.createAnalyser(), ctx.createAnalyser()]
      this.analysers.forEach((analyser, channel) => {
        analyser.fftSize = 1024
        this.splitter!.connect(analyser, channel)
      })
      this.meterData = new Float32Array(1024)
    }
    return ctx
  }
  syncToTime(scene: ChronoScene, currentTimeMs: number, isPlaying: boolean, playbackSpeed: number, options: AudioEngineOptions = {}): void {
    if (this.disposed) return
    if (options.masterVolume !== undefined) this.setMasterVolume(options.masterVolume)
    if (!isPlaying || !Number.isFinite(playbackSpeed) || playbackSpeed <= 0) { this.stopAll(); this.publishMeter(true); return }
    const layers = audibleAudioLayers(scene, options)
    if (!layers.some(layer => this.buffers.has(layer.audio!.assetId))) { this.stopAll(); this.publishMeter(true); return }
    const ctx = this.ensureGraph()
    if (ctx.state === 'suspended') void ctx.resume().catch(error => { this.errors.context = String(error) })
    const now = ctx.currentTime, wanted = new Set<string>()
    const fallbackEndMs = Math.max(0, ...scene.timelines.map(timeline => timeline.durationMs))
    // audibleAudioLayers already resolved owner-or-clone membership. Repeating
    // the pure clip's owner-only filter here would mute shared cloned clips.
    const evaluation = { ...options, timelineIds: undefined, fallbackEndMs, playbackSpeed }
    for (const layer of layers) {
      const decoded = this.buffers.get(layer.audio!.assetId)
      if (!decoded || decoded.url !== this.assets.get(layer.audio!.assetId)?.url) continue
      const buffer = decoded.buffer
      // Schedule upcoming starts ahead of the next animation frame; source.stop
      // is always scheduled at the exact clip end, including looping sources.
      const schedule = buildAudioClipSchedule(layer, buffer.duration * 1000, currentTimeMs, currentTimeMs + 200, evaluation)
      if (!schedule) continue
      wanted.add(layer.id)
      const signature = JSON.stringify([decoded.url, layer.audio!.assetId, layer.startMs, layer.endMs,
        layer.audio!.startOffsetMs, layer.audio!.loop, playbackSpeed])
      const value = evaluateAudioClip(layer, buffer.duration * 1000, Math.max(currentTimeMs, schedule.startMs), evaluation)!
      let active = this.active.get(layer.id)
      const expectedMs = active ? active.transportMs + (now - active.contextAnchorSec) * active.state.rate * 1000 : currentTimeMs
      if (!active || active.signature !== signature || active.buffer !== buffer || Math.abs(expectedMs - currentTimeMs) > 80) {
        this.stop(layer.id)
        active = this.schedule(layer.id, decoded.lease.retain(), signature, schedule, value.endMs, currentTimeMs, now)
      }
      active.state.gain = value.gain; active.state.pan = value.pan; active.state.sourceOffsetSec = value.sourceOffsetSec
      this.automate(active.gain.gain, schedule.gainPoints, now)
      this.automate(active.pan.pan, schedule.panPoints, now)
    }
    for (const id of Array.from(this.active.keys())) if (!wanted.has(id)) this.stop(id)
    this.publishMeter()
  }
  private automate(param: AudioParam, points: AudioClipSchedule['gainPoints'], anchorSec: number): void {
    param.cancelScheduledValues(anchorSec)
    points.forEach((point, index) => {
      if (index === 0) param.setValueAtTime(point.value, anchorSec + point.timeSec)
      else param.linearRampToValueAtTime(point.value, anchorSec + point.timeSec)
    })
  }
  /** Takes ownership of the supplied PCM pin, including partial setup/start failures. */
  private schedule(layerId: string, lease: AudioPcmLease, signature: string, clip: AudioClipSchedule, clipEndMs: number, transportMs: number, now: number): ActiveSource {
    let source: AudioBufferSourceNode | undefined, gain: GainNode | undefined, pan: StereoPannerNode | undefined
    try {
      const buffer = lease.buffer
      const ctx = this.ensureGraph()
      source = ctx.createBufferSource(); gain = ctx.createGain(); pan = ctx.createStereoPanner()
      source.buffer = buffer; source.loop = clip.loop; source.playbackRate.value = clip.sourceRate
      gain.gain.value = clip.gainPoints[0]?.value ?? 0; pan.pan.value = clip.panPoints[0]?.value ?? 0
      source.connect(gain).connect(pan).connect(this.master!)
      const startsAt = now + clip.contextStartSec
      // The lookahead range may end before the clip, but the source stop may not.
      const stopsAt = now + (clipEndMs - transportMs) / 1000 / clip.sourceRate
      const active: ActiveSource = { source, gain, pan, signature, buffer, lease, transportMs, contextAnchorSec: now, startsAt, stopsAt,
        state: { layerId, assetId: clip.assetId, sourceOffsetSec: clip.sourceOffsetSec, gain: gain.gain.value, pan: pan.pan.value,
          rate: clip.sourceRate, loop: clip.loop, startsAtContextSec: startsAt, stopsAtContextSec: stopsAt } }
      this.active.set(layerId, active)
      source.onended = () => { if (this.active.get(layerId) === active) { this.active.delete(layerId); this.disconnect(active) } }
      source.start(startsAt, clip.loop ? audioModulo(clip.sourceOffsetSec, buffer.duration) : clip.sourceOffsetSec)
      source.stop(stopsAt)
      return active
    } catch (error) {
      this.active.delete(layerId)
      if (source) {
        source.onended = null
        try { source.stop() } catch { /* not started or already ended */ }
        source.buffer = null; source.disconnect()
      }
      gain?.disconnect(); pan?.disconnect(); lease.release()
      throw error
    }
  }

  setVolume(layerId: string, volume: number): void {
    const active = this.active.get(layerId)
    if (active) { active.gain.gain.cancelScheduledValues(this.service.getContext().currentTime); active.gain.gain.value = clampGain(volume); active.state.gain = clampGain(volume) }
  }
  setMasterVolume(volume: number): void {
    this.masterVolume = clampGain(volume)
    if (this.master) this.master.gain.value = this.masterVolume
  }
  subscribeMeter(listener: (meter: AudioMeter) => void): () => void {
    this.listeners.add(listener); listener({ ...this.meter }); return () => this.listeners.delete(listener)
  }
  private publishMeter(silent = false): void {
    let peak = 0, sum = 0
    if (!silent && this.meterData) {
      for (const analyser of this.analysers) {
        analyser.getFloatTimeDomainData(this.meterData)
        for (let i = 0; i < this.meterData.length; i++) { const sample = this.meterData[i]; peak = Math.max(peak, Math.abs(sample)); sum += sample * sample }
      }
    }
    this.meter = { peak, rms: this.meterData && !silent && this.analysers.length ? Math.sqrt(sum / this.meterData.length / this.analysers.length) : 0, clipped: peak >= 1 }
    for (const listener of Array.from(this.listeners)) listener({ ...this.meter })
  }
  getState(): AudioEngineState {
    return { contextState: this.master ? this.service.getContext().state : 'idle', masterVolume: this.masterVolume,
      meter: { ...this.meter }, loadingAssetIds: Array.from(this.loading.keys()), errors: { ...this.errors }, sources: Array.from(this.active.values()).map(source => ({ ...source.state })) }
  }
  /** Detach browser node ownership before dropping the active source's PCM pin. */
  private disconnect(active: ActiveSource): void {
    try { active.source.disconnect(); active.gain.disconnect(); active.pan.disconnect(); active.source.buffer = null }
    finally { active.lease.release() }
  }
  private stop(id: string): void {
    const active = this.active.get(id)
    if (!active) return
    this.active.delete(id); active.source.onended = null
    try { active.source.stop() } catch { /* already ended */ }
    this.disconnect(active)
  }
  private stopAll(): void { for (const id of Array.from(this.active.keys())) this.stop(id) }
  /** Cancel only this engine's preparation consumers and disconnect its graph.
   * The shared context/cache and independently owned source URLs survive. */
  dispose(): void {
    this.loading.forEach(load => load.controller.abort())
    this.buffers.forEach(entry => entry.lease.release())
    this.disposed = true; this.stopAll(); this.assets.clear(); this.buffers.clear(); this.loading.clear()
    this.master?.disconnect(); this.splitter?.disconnect(); this.analysers.forEach(analyser => analyser.disconnect())
    this.master = null; this.splitter = null; this.analysers = []; this.meterData = null
    this.publishMeter(true); this.listeners.clear()
    // Shared decode context/cache also serve waveform and offline render. Their
    // bounded service lifetime is independent of this editor playback graph.
  }
}
