import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncVideoPlayback } from './useVideoPlaybackSync'
import { evaluateTimelines } from '@/lib/evaluator'
import type { ChronoScene } from '@/lib/types'
class Video {
  currentTime = 0; paused = true; muted = false; volume = 1; playbackRate = 1; loop = false
  pause = vi.fn(() => { this.paused = true })
  play = vi.fn(async () => { this.paused = false })
}
afterEach(() => vi.unstubAllGlobals())
describe('video playback animated properties', () => {
  it('applies evaluated video volume and mute to the actual media element without changing stored defaults', () => {
    vi.stubGlobal('HTMLVideoElement', Video)
    const video = new Video()
    const scene = { layers: [{ id: 'v', type: 'video', startMs: 0, endMs: 2000, video: { assetId: 'asset', volume: 0.8, muted: false } }],
      timelines: [{ id: 't', durationMs: 1000, autoplay: false, loop: false, tracks: [
        { target: 'layers.v.video.volume', keyframes: [{ id: 'a', timeMs: 0, value: 0, easing: { type: 'linear' } }, { id: 'b', timeMs: 1000, value: 1, easing: { type: 'linear' } }] },
        { target: 'layers.v.video.muted', keyframes: [{ id: 'c', timeMs: 0, value: false, easing: { type: 'linear' } }, { id: 'd', timeMs: 1000, value: true, easing: { type: 'linear' } }] },
      ] }] } as unknown as ChronoScene
    const params = { scene, assetCache: new Map([['asset', video as unknown as HTMLVideoElement]]), currentTimeMs: 500, isPlaying: false, playbackSpeed: 1 }
    syncVideoPlayback({ ...params, overrides: evaluateTimelines(scene.timelines, 500) })
    expect(video.volume).toBe(0.5); expect(video.muted).toBe(false); expect(video.currentTime).toBe(0.5)
    syncVideoPlayback({ ...params, currentTimeMs: 1000, overrides: evaluateTimelines(scene.timelines, 1000) })
    expect(video.volume).toBe(1); expect(video.muted).toBe(true)
    expect(scene.layers[0].video).toMatchObject({ volume: 0.8, muted: false })
  })
})
