import type { ChronoScene, Layer } from '../../types'
import { computeLocalTime, evaluateTrack, type OverrideMap } from '../../evaluator'
import { resolveInstanceLayer } from '../../clone/InstanceResolver'
import { modelCandidates } from './modelCandidates'
import { parseTrackTarget } from '../../timeline/TrackTargetParser'
import { assertModelClipOwnership } from './modelClipOwnership'
import { sampleModelChannel } from './modelChannels'
import { primitiveRenderPath } from './modelPrimitiveChannels'

/** Sample private authored placement/camera keys at composition time in ms.
 * Owner startMs anchors the local clock; native Timeline loop/hold interpolation
 * is reused. Results are frame-only, remapped from the private root to this
 * instance ID. No clip is appended to global timelines, source writes, rAF,
 * native GLB clip playback or mutable mixer state are introduced here.
 */
export function modelContentFrame(scene: ChronoScene, timeMs: number, base: OverrideMap): OverrideMap {
  const { layers: candidates, index } = modelCandidates(scene.layers)
  if (!candidates.length) return base
  let result = base
  for (const layer of candidates) {
    const effective = layer.instanceOf ? resolveInstanceLayer(layer, scene.layers, 0, index) : layer
    const data = effective?.model3d, animation = (data?.version ?? 0) >= 2 ? data?.animation : undefined
    if (!effective || !animation?.activeClipId) continue
    assertModelClipOwnership(scene, effective)
    const clip = animation.clips.find(item => item.id === animation.activeClipId)
    if (!clip) throw new Error('The active model clip is missing.')
    const localMs = computeLocalTime(clip, Math.max(0, timeMs - (layer.startMs ?? 0)))
    for (const track of clip.tracks) {
      const value = evaluateTrack(track, localMs)
      if (value === null) continue
      const target = parseTrackTarget(track.target)!, renderPath = primitiveRenderPath(data!, target.propertyPath)
      const address = `layers.${layer.id}.${renderPath}`
      if (base.has(address)) throw new Error('A supplied root frame conflicts with an internal model clip channel.')
      if (result === base) result = new Map(base)
      result.set(address, sampleModelChannel(target.propertyPath, value))
    }
  }
  return result
}
