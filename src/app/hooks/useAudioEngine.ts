'use client'
import { useEffect, useRef } from 'react'
import type { ChronoScene } from '@/lib/types'
import { AudioEngine } from '@/lib/audioEngine'

interface Params {
  scene: ChronoScene
  currentTimeMs: number
  isPlaying: boolean
  playbackSpeed: number
}

/**
 * Owns a single AudioEngine for the lifetime of the editor.
 *
 *  - Loads audio assets when `scene.assets` changes
 *  - Calls engine.syncToTime on every time/play/speed change
 *  - Disposes the engine on unmount (closes AudioContext, revokes sources)
 */
export function useAudioEngine({ scene, currentTimeMs, isPlaying, playbackSpeed }: Params): void {
  const engineRef = useRef<AudioEngine | null>(null)
  if (engineRef.current === null) {
    engineRef.current = new AudioEngine()
  }

  // ── Load / unload assets when the scene asset list changes ───────────────
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const wanted = new Set<string>()
    for (const asset of scene.assets) {
      if (asset.type !== 'audio') continue
      wanted.add(asset.id)
      engine.loadAsset(asset)  // no-op if already loaded
    }
    // Nothing tracks removed audio assets explicitly; if needed in future,
    // call engine.removeAsset for each id no longer in `wanted`.
  }, [scene.assets])

  // ── Reconcile playback every time/play/speed change ──────────────────────
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.syncToTime(scene.layers, currentTimeMs, isPlaying, playbackSpeed)
  }, [scene.layers, currentTimeMs, isPlaying, playbackSpeed])

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [])
}
