'use client'
import { useEffect } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { AssetCache } from './useAssetCache'
import { getLayerValue, getLayerPropertyValue, type OverrideMap } from '@/lib/evaluator'

interface Params {
  scene: ChronoScene
  assetCache: AssetCache
  currentTimeMs: number
  isPlaying: boolean
  playbackSpeed: number
  overrides?: OverrideMap
}

const SEEK_THRESHOLD_S = 0.05  // tolerate ~50ms drift before re-seeking

/**
 * Keeps every <video> layer aligned with the editor playhead.
 *
 *  - When isPlaying: video plays (muted=false honoured if user gestured), at playbackSpeed
 *  - When paused:    video pauses and currentTime seeks to the layer-local position
 *  - When the playhead leaves layer.startMs / endMs window: video pauses
 *  - When user scrubs (paused, time changes): video.currentTime re-seeks
 *
 * Video element creation happens in useAssetCache. This hook only mutates
 * playback state on existing elements.
 */
export function useVideoPlaybackSync({
  scene, assetCache, currentTimeMs, isPlaying, playbackSpeed, overrides,
}: Params): void {
  useEffect(() => syncVideoPlayback({ scene, assetCache, currentTimeMs, isPlaying, playbackSpeed, overrides }),
    [scene.layers, assetCache, currentTimeMs, isPlaying, playbackSpeed, overrides])
}

/** Shared effect body is directly testable with media elements; no playback
 * render or simulated React lifecycle is needed to verify animated volume. */
export function syncVideoPlayback({ scene, assetCache, currentTimeMs, isPlaying, playbackSpeed, overrides }: Params): void {
    for (const layer of scene.layers) {
      if (layer.type !== 'video' || !layer.video) continue
      const el = assetCache.get(layer.video.assetId)
      if (!el || !(el instanceof HTMLVideoElement)) continue

      const startMs = layer.startMs ?? 0
      const endMs   = layer.endMs   ?? Infinity
      const inWindow = currentTimeMs >= startMs && currentTimeMs <= endMs

      // Volume + mute
      const muted = overrides ? getLayerPropertyValue(overrides, layer.id, 'video.muted', !!layer.video.muted) : layer.video.muted
      const volume = overrides ? getLayerValue(overrides, layer.id, 'video.volume', layer.video.volume ?? 1) : layer.video.volume ?? 1
      el.muted  = muted === true || layer.hidden === true
      el.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1))
      el.playbackRate = playbackSpeed
      el.loop = !!layer.video.loop

      if (!inWindow) {
        if (!el.paused) el.pause()
        continue
      }

      // Compute the desired position inside the source clip
      const videoTimeSec = ((currentTimeMs - startMs) + (layer.video.startOffsetMs ?? 0)) / 1000

      if (isPlaying) {
        // Re-seek only when drift exceeds threshold to avoid stuttering
        if (Math.abs(el.currentTime - videoTimeSec) > SEEK_THRESHOLD_S) {
          el.currentTime = Math.max(0, videoTimeSec)
        }
        if (el.paused) {
          // play() may reject due to autoplay policy; swallow to avoid console noise
          el.play().catch(() => { /* user gesture required */ })
        }
      } else {
        if (!el.paused) el.pause()
        el.currentTime = Math.max(0, videoTimeSec)
      }
    }
}
