'use client'
import { useEffect } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { AssetCache } from './useAssetCache'

interface Params {
  scene: ChronoScene
  assetCache: AssetCache
  currentTimeMs: number
  isPlaying: boolean
  playbackSpeed: number
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
  scene, assetCache, currentTimeMs, isPlaying, playbackSpeed,
}: Params): void {
  useEffect(() => {
    for (const layer of scene.layers) {
      if (layer.type !== 'video' || !layer.video) continue
      const el = assetCache.get(layer.video.assetId)
      if (!el || !(el instanceof HTMLVideoElement)) continue

      const startMs = layer.startMs ?? 0
      const endMs   = layer.endMs   ?? Infinity
      const inWindow = currentTimeMs >= startMs && currentTimeMs <= endMs

      // Volume + mute
      el.muted  = !!layer.video.muted || layer.hidden === true
      el.volume = Math.max(0, Math.min(1, layer.video.volume ?? 1))
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
  }, [scene.layers, assetCache, currentTimeMs, isPlaying, playbackSpeed])
}
