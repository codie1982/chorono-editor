import type { Asset, ChronoScene, Layer } from '../types'
import { audibleAudioLayers, type AudioEvaluationOptions } from './audioEvaluation'
import { resolveAudioClipWindow } from './audioClip'

/**
 * Computes source demand in composition milliseconds, independent of visual
 * viewport/pan/zoom. Existing audibleAudioLayers owns visibility/solo/clone scope
 * semantics; resolveAudioClipWindow owns authored timing. Source duration metadata
 * is deliberately not used to prematurely truncate a potentially longer decoded
 * source. Thus a short source can conservatively remain through its authored
 * clip window. Gain-zero automation is not culled; explicit mute is excluded.
 *
 * Only current immutable arrays and derived audio candidates are retained.
 * Asset and hierarchy indexes are rebuilt on identity changes, not every frame.
 * Scope contents are copied to detect in-place host changes too. There are no
 * browser handles, timers or scene mutations. A resolver belongs to one engine.
 */
export class AudioDemandResolver {
  private assets?: readonly Asset[]
  private byId = new Map<string, Asset>()
  private layers?: readonly Layer[]
  private timelines?: ChronoScene['timelines']
  private scope?: readonly string[] | null
  private candidates: readonly Layer[] = []
  private fallbackEndMs = 0

  /** Prepares the current instant plus 500 ms wall-time ahead at positive rate.
   * Paused/unsupported reverse rate preloads with rate 1, but never plays nodes.
   * Invalid time yields no demand. Unknown/missing assets do not invent handles.
   * Each asset ID is returned once in first audible-layer order. */
  resolve(scene: ChronoScene, timeMs: number, playbackSpeed: number,
    options: Pick<AudioEvaluationOptions, 'timelineIds'> = {}): Asset[] {
    if (scene.assets !== this.assets) {
      this.assets = scene.assets
      this.byId = new Map(scene.assets.filter(asset => asset.type === 'audio').map(asset => [asset.id, asset]))
    }
    const scope = options.timelineIds
    const sameScope = scope == null ? this.scope == null : this.scope != null
      && scope.length === this.scope.length && scope.every((id, index) => id === this.scope![index])
    if (scene.layers !== this.layers || scene.timelines !== this.timelines || !sameScope) {
      this.layers = scene.layers; this.timelines = scene.timelines; this.scope = scope?.slice() ?? scope
      this.candidates = audibleAudioLayers(scene, options)
      this.fallbackEndMs = scene.timelines.reduce((max, timeline) => Math.max(max, timeline.durationMs), 0)
    }
    if (!Number.isFinite(timeMs)) return []
    const endMs = timeMs + 500 * (Number.isFinite(playbackSpeed) && playbackSpeed > 0 ? playbackSpeed : 1)
    const wanted = new Set<string>(), result: Asset[] = []
    for (const layer of this.candidates) {
      if (layer.audio!.muted) continue
      const clip = resolveAudioClipWindow(layer, undefined, this.fallbackEndMs)
      if (clip.endMs <= clip.startMs || clip.endMs <= timeMs || clip.startMs >= endMs) continue
      const id = layer.audio!.assetId, asset = this.byId.get(id)
      if (asset && !wanted.has(id)) { wanted.add(id); result.push(asset) }
    }
    return result
  }
}
