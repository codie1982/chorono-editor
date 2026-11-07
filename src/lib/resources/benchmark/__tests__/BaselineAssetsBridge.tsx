import { useEffect } from 'react'
import type { ChronoScene } from '@/lib/types'
import { useAssetCache, type AssetCache } from '@/app/hooks/useAssetCache'
import { useAudioEngine, type AudioEngineHandle } from '@/app/hooks/useAudioEngine'

/**
 * Test-only composition adapter reuses production image/video/font and audio
 * loading. Waits for actual readiness without playing media; timeout/error is
 * an incomplete run, not a successful zero-byte sample. One bounded polling
 * timer exists only during preparation and is removed before measurement.
 */
export function BaselineAssetsBridge({ scene, onReady, onError }: {
  scene: ChronoScene
  onReady: (assets: AssetCache, audio: AudioEngineHandle) => void | Promise<void>
  onError: (error: Error) => void
}) {
  const assets = useAssetCache(scene.assets)
  const audio = useAudioEngine({ scene, currentTimeMs: 0, isPlaying: false, playbackSpeed: 1 })
  useEffect(() => {
    let finished = false
    const started = performance.now()
    const check = () => {
      if (finished) return
      try {
        if (Object.keys(audio.getState().errors).length) throw new Error('Audio fixture decode failed')
        let ready = true
        const loadedAudio = new Set(audio.getResources().assets.map(asset => asset.id))
        for (const asset of scene.assets) {
          const element = assets.get(asset.id)
          if (['image', 'spriteSheet'].includes(asset.type)) {
            if (!(element instanceof HTMLImageElement) || !element.complete) ready = false
            else if (!element.naturalWidth) throw new Error('Image fixture decode failed')
          } else if (asset.type === 'video') {
            if (element instanceof HTMLVideoElement && element.error) throw new Error('Video fixture decode failed')
            if (!(element instanceof HTMLVideoElement) || element.readyState < 2) ready = false
          } else if (asset.type === 'audio' && !loadedAudio.has(asset.id)) ready = false
          else if (asset.type === 'font') {
            const family = asset.metadata?.notes?.match(/^family: (.+)$/)?.[1]
            let loaded = false
            document.fonts.forEach(face => {
              if (face.family === family && face.status === 'loaded') loaded = true
              if (face.family === family && face.status === 'error') throw new Error('Font fixture decode failed')
            })
            if (!loaded) ready = false
          }
        }
        if (!ready && performance.now() - started > 15000) throw new Error('Fixture readiness timed out')
        if (ready) { finished = true; clearInterval(timer); void Promise.resolve(onReady(assets, audio)).catch(onError) }
      } catch (error) {
        finished = true; clearInterval(timer)
        onError(error instanceof Error ? error : new Error('Fixture preparation failed'))
      }
    }
    const timer = setInterval(check, 100)
    check()
    return () => { finished = true; clearInterval(timer) }
  }, [scene, assets, audio.getResources, audio.getState, onReady, onError])
  return null
}
