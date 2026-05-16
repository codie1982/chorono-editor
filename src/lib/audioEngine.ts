// ── Web Audio engine for audio layers ────────────────────────────────────────
// Decodes audio assets to AudioBuffers, schedules playback aligned to the
// editor timeline, and supports per-layer volume + mute + loop + trim.

import type { Asset, Layer } from './types'

interface ActiveSource {
  source: AudioBufferSourceNode
  gain:   GainNode
  /** Layer-local position (s) at which the source was scheduled to start */
  scheduledLocalSec: number
  /** AudioContext.currentTime at the moment scheduling happened */
  startedAt: number
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private buffers = new Map<string, AudioBuffer>()
  private active  = new Map<string, ActiveSource>()  // keyed by layerId
  /** Track loads in flight so concurrent calls don't re-decode */
  private loading = new Map<string, Promise<void>>()

  /** Lazily create the AudioContext (browser may require a user gesture). */
  private getCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      this.ctx = new Ctor()
    }
    return this.ctx
  }

  /** Load + decode an asset URL into an AudioBuffer (no-op if already loaded). */
  async loadAsset(asset: Asset): Promise<void> {
    if (this.buffers.has(asset.id)) return
    const pending = this.loading.get(asset.id)
    if (pending) return pending

    const p = (async () => {
      try {
        const res = await fetch(asset.url)
        const arr = await res.arrayBuffer()
        const ctx = this.getCtx()
        const buf = await ctx.decodeAudioData(arr)
        this.buffers.set(asset.id, buf)
      } catch (err) {
        console.error('audio decode failed:', asset.id, err)
      } finally {
        this.loading.delete(asset.id)
      }
    })()
    this.loading.set(asset.id, p)
    return p
  }

  /** Forget a buffer (called when the asset is removed from the scene). */
  removeAsset(assetId: string): void {
    this.buffers.delete(assetId)
  }

  /**
   * Reconcile the engine's running sources with what should be playing now.
   *
   * Audio buffer sources can't be seeked — they can only be stopped and
   * re-started. So whenever isPlaying changes, the playhead jumps, or speed
   * changes, we stop all sources and re-schedule fresh ones.
   */
  syncToTime(audioLayers: Layer[], currentTimeMs: number, isPlaying: boolean, playbackSpeed: number): void {
    if (!isPlaying) {
      this.stopAll()
      return
    }
    const ctx = this.getCtx()
    if (ctx.state === 'suspended') ctx.resume()

    const wanted = new Set<string>()

    for (const layer of audioLayers) {
      if (layer.type !== 'audio' || !layer.audio || layer.hidden) continue
      const buffer = this.buffers.get(layer.audio.assetId)
      if (!buffer) continue

      const startMs = layer.startMs ?? 0
      const endMs   = layer.endMs   ?? Infinity
      if (currentTimeMs < startMs || currentTimeMs > endMs) continue

      const localSec = ((currentTimeMs - startMs) + (layer.audio.startOffsetMs ?? 0)) / 1000
      if (localSec < 0 || localSec >= buffer.duration) {
        if (!layer.audio.loop) continue
      }

      wanted.add(layer.id)

      const existing = this.active.get(layer.id)
      const expectedLocal = existing
        ? existing.scheduledLocalSec + (ctx.currentTime - existing.startedAt) * playbackSpeed
        : null

      // Restart if missing OR drifted OR speed changed
      const drifted = expectedLocal != null && Math.abs(expectedLocal - localSec) > 0.08
      if (!existing || drifted) {
        if (existing) {
          try { existing.source.stop() } catch { /* already stopped */ }
        }
        this.scheduleLayer(layer, buffer, localSec, playbackSpeed)
      } else {
        // Update volume without restarting
        existing.gain.gain.value = layerGain(layer)
      }
    }

    // Stop sources for layers no longer wanted
    this.active.forEach((src, layerId) => {
      if (wanted.has(layerId)) return
      try { src.source.stop() } catch { /* already */ }
      this.active.delete(layerId)
    })
  }

  /** Set per-layer volume immediately without restarting playback. */
  setVolume(layerId: string, volume: number): void {
    const a = this.active.get(layerId)
    if (a) a.gain.gain.value = Math.max(0, Math.min(1, volume))
  }

  /** Stop everything and release resources. */
  dispose(): void {
    this.stopAll()
    this.buffers.clear()
    if (this.ctx) {
      this.ctx.close().catch(() => { /* already closed */ })
      this.ctx = null
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private scheduleLayer(layer: Layer, buffer: AudioBuffer, localSec: number, playbackSpeed: number) {
    if (!layer.audio) return
    const ctx = this.getCtx()
    const source = ctx.createBufferSource()
    const gain   = ctx.createGain()

    source.buffer    = buffer
    source.loop      = !!layer.audio.loop
    source.playbackRate.value = playbackSpeed
    gain.gain.value  = layerGain(layer)

    source.connect(gain).connect(ctx.destination)

    // Clamp seek-into within buffer length
    const offset = Math.max(0, Math.min(localSec, buffer.duration - 0.001))
    source.start(ctx.currentTime, offset)

    this.active.set(layer.id, {
      source, gain,
      scheduledLocalSec: offset,
      startedAt: ctx.currentTime,
    })

    source.onended = () => {
      // Clean up when buffer naturally finishes (only fires for non-looping)
      if (this.active.get(layer.id)?.source === source) {
        this.active.delete(layer.id)
      }
    }
  }

  private stopAll() {
    this.active.forEach((src) => {
      try { src.source.stop() } catch { /* already stopped */ }
    })
    this.active.clear()
  }
}

function layerGain(layer: Layer): number {
  if (!layer.audio) return 0
  if (layer.audio.muted) return 0
  return Math.max(0, Math.min(1, layer.audio.volume ?? 1))
}
