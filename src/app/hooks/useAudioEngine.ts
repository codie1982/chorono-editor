'use client'
import { useCallback, useEffect, useRef } from 'react'
import type { ChronoScene } from '@/lib/types'
import { AudioEngine, type AudioEngineOptions, type AudioEngineState, type AudioMeter, type AudioResourceSnapshot } from '@/lib/audioEngine'
import { getAudioAssetService } from '@/lib/audio/AudioAssetService'

export interface AudioEngineParams extends AudioEngineOptions {
  scene: ChronoScene
  currentTimeMs: number
  isPlaying: boolean
  playbackSpeed: number
}
export interface AudioEngineHandle {
  getResources: () => AudioResourceSnapshot
  getState: () => AudioEngineState
  subscribeMeter: (listener: (meter: AudioMeter) => void) => () => void
}
const idleState = (): AudioEngineState => ({ contextState: 'idle', masterVolume: 1,
  meter: { peak: 0, rms: 0, clipped: false }, loadingAssetIds: [], errors: {}, sources: [] })

/** Effect ownership recreates the engine after React StrictMode's setup-cleanup
 * cycle; late asset decodes may not revive the disposed graph. */
export function useAudioEngine(params: AudioEngineParams): AudioEngineHandle {
  const engineRef = useRef<AudioEngine | null>(null)
  const latest = useRef(params); latest.current = params
  const subscribers = useRef(new Map<(meter: AudioMeter) => void, (() => void) | null>())
  const reconcile = useCallback(() => {
    const value = latest.current
    const engine = engineRef.current
    if (!engine) return
    const prepared = engine.prepareForTime(value.scene, value.currentTimeMs, value.playbackSpeed, value)
    if (prepared) void prepared.then(() => { if (engineRef.current === engine) reconcile() })
    engine.syncToTime(value.scene, value.currentTimeMs, value.isPlaying, value.playbackSpeed, value)
  }, [])
  useEffect(() => {
    const engine = new AudioEngine(); engineRef.current = engine
    for (const listener of Array.from(subscribers.current.keys())) subscribers.current.set(listener, engine.subscribeMeter(listener))
    reconcile()
    return () => {
      for (const [listener, unsubscribe] of Array.from(subscribers.current)) { unsubscribe?.(); subscribers.current.set(listener, null) }
      engine.dispose()
      if (engineRef.current === engine) engineRef.current = null
    }
  }, [reconcile])
  useEffect(reconcile, [params.scene, params.currentTimeMs, params.isPlaying, params.playbackSpeed,
    params.overrides, params.timelineIds, params.masterVolume, params.getOverridesAtTime, reconcile])
  const getState = useCallback(() => engineRef.current?.getState() ?? idleState(), [])
  const getResources = useCallback(() => engineRef.current?.getResourceSnapshot(latest.current.scene.assets)
    ?? { ...getAudioAssetService().getMemorySnapshot(), ...getAudioAssetService().describeAssets(latest.current.scene.assets) }, [])
  const subscribeMeter = useCallback((listener: (meter: AudioMeter) => void) => {
    subscribers.current.get(listener)?.()
    subscribers.current.set(listener, engineRef.current?.subscribeMeter(listener) ?? null)
    return () => { subscribers.current.get(listener)?.(); subscribers.current.delete(listener) }
  }, [])
  return { getState, getResources, subscribeMeter }
}
