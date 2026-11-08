'use client'
import { useEffect } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { AssetCache } from './useAssetCache'
import type { OverrideMap } from '@/lib/evaluator'
import { syncVideoFrame } from '@/lib/render/media/syncVideoFrame'
interface Params {
  scene: ChronoScene; assetCache: AssetCache; currentTimeMs: number
  isPlaying: boolean; playbackSpeed: number; overrides?: OverrideMap
}
/** Reconcile existing clip-specific media pins with the editor transport. Native
 * seeked invalidation belongs to the owning media session; this hook never loads
 * or owns original source URLs. Animated properties use the actual frame map. */
export function useVideoPlaybackSync(params: Params): void {
  const { scene, assetCache, currentTimeMs, isPlaying, playbackSpeed, overrides } = params
  useEffect(() => syncVideoPlayback(params), [scene.layers, assetCache, currentTimeMs, isPlaying, playbackSpeed, overrides])
}
/** Compatibility entry point for tests/legacy hosts. Actual timing and lookup
 * are shared with player/render consumers; no per-asset clock alias is invented. */
export function syncVideoPlayback({ scene, assetCache, currentTimeMs, isPlaying, playbackSpeed, overrides }: Params): void {
  syncVideoFrame(scene, assetCache, currentTimeMs, { playing: isPlaying, speed: playbackSpeed, overrides })
}
