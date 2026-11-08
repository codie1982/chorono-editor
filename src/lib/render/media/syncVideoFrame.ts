import type { ChronoScene } from '../../types'
import type { OverrideMap } from '../../evaluator'
import { getLayerValue, getLayerPropertyValue } from '../../evaluator'
import type { AssetElementMap } from '../../asset/visual/AssetElementMap'
import { videoForLayer } from '../../asset/visual/AssetElementMap'
import { videoFrameTime } from '../../asset/visual/videoFrameTime'
import { materializeRenderScene } from '../materializeOverrides'
import { renderSchemas } from '../prepareRenderFrame'

/** Reconcile clip-specific native transport with composition time. No resources
 * are acquired by lookup. Paused clips seek only when time actually differs,
 * preventing seeked→invalidate→seek loops. Loop clocks wrap native duration;
 * playing clips tolerate the existing 50ms drift. Missing clips stay cold.
 * Caller owns media pins and redraw invalidation on native seeked completion. */
export function syncVideoFrame(scene: ChronoScene, assets: AssetElementMap, timeMs: number,
  options: { playing: boolean; speed: number; overrides?: OverrideMap }): void {
  if (!scene.layers.some(layer => layer.video || layer.instanceOf)) return
  const overrides = options.overrides ?? new Map()
  const frame = materializeRenderScene(scene, overrides, renderSchemas)
  for (const layer of frame.layers) {
    if (layer.type !== 'video' || !layer.video) continue
    const element = videoForLayer(assets, layer.id, layer.video.assetId)
    if (!element || !(element instanceof HTMLVideoElement)) continue
    const inWindow = timeMs >= (layer.startMs ?? 0) && timeMs <= (layer.endMs ?? Infinity)
    element.muted = getLayerPropertyValue(overrides, layer.id, 'video.muted', !!layer.video.muted) === true || layer.hidden === true
    const volume = getLayerValue(overrides, layer.id, 'video.volume', layer.video.volume ?? 1)
    element.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1))
    const speed = Number.isFinite(options.speed) && options.speed > 0 ? options.speed : 1
    element.playbackRate = speed; element.loop = !!layer.video.loop
    if (!inWindow) { if (!element.paused) element.pause(); continue }
    const seconds = videoFrameTime(layer, timeMs, element.duration)
    if (Math.abs(element.currentTime - seconds) > (options.playing ? 0.05 : 1e-6)) element.currentTime = seconds
    if (options.playing) { if (element.paused) void element.play().catch(() => {}) }
    else if (!element.paused) element.pause()
  }
}
