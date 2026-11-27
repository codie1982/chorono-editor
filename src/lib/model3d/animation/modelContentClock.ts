import type { ChronoScene } from '../../types'
import { computeLocalTime, type OverrideMap } from '../../evaluator'
import { materializeLayerOverrides } from '../../render/materializeOverrides'
import { resolveInstanceLayer } from '../../clone/InstanceResolver'
import { modelCandidates } from './modelCandidates'
import { applyModelInstanceInputs } from '../content/modelInstanceInputs'
import { assertModelClipOwnership } from './modelClipOwnership'
import { sampleModelChannel } from './modelChannels'
import { modelOwnedChannels } from './modelClipOwnership'
/** Deterministic native clip time/turntable frame in composition milliseconds.
 * No per-instance rAF, source writes, wall clock or accumulated integration.
 * Authored native-time tracks take authority over automatic playback. */
export function modelContentClock(scene: ChronoScene, timeMs: number, base: OverrideMap): OverrideMap {
  let result = base
  const { layers, index } = modelCandidates(scene.layers)
  for (const item of layers) {
    if (item.type !== 'model3d') continue
    const layer = resolveInstanceLayer(item, scene.layers, 0, index)
    if (!layer?.model3d?.content) continue
    assertModelClipOwnership(scene, layer)
    const elapsed = Math.max(0, timeMs - (item.startMs ?? 0)), owned = modelOwnedChannels(layer), c = layer.model3d.content
    const clip = layer.model3d.animation?.clips.find(clip => clip.id === layer.model3d!.animation!.activeClipId)
    const contentTime = clip ? computeLocalTime(clip, elapsed) : elapsed
    const put = (path: string, value: number) => { if (result === base) result = new Map(base); result.set(`layers.${item.id}.${path}`, value) }
    put('model3d.content.timeMs', contentTime)
    for (const [id, i] of Object.entries(c.instances)) {
      const n = i.native, path = `model3d.content.instances.${id}.native.timeMs`
      if (!n || n.mode !== 'play' || owned.has(path)) continue
      if (scene.parameterWires?.some(w => w.enabled && w.target.layerId === item.id && w.target.propertyPath === path)
        || Object.hasOwn(layer.propertyExpressions?.fields ?? {}, path) || Object.hasOwn(layer.paramBindings ?? {}, path)
        || scene.bindings?.some(b => b.target.type === 'layerProperty' && b.target.layerId === item.id && b.target.property === path)) throw new Error('Automatic native clip time conflicts with an external driver.')
      if (base.has(`layers.${item.id}.${path}`)) continue
      const duration = n.outMs - n.inMs, local = contentTime * n.speed
      put(path, n.inMs + (n.loop ? local % duration : Math.min(duration, local)))
    }
  }
  return result
}
/** Apply exposed typed controls after Wire/live-expression evaluation. Values
 * target only admitted content leaves; ownership conflicts fail before rendering.
 * Frame projection is immutable and each instance reads its own overrides. */
export function modelParameterFrame(scene: ChronoScene, base: OverrideMap): OverrideMap {
  let result = base
  const { layers, index } = modelCandidates(scene.layers)
  for (const item of layers) {
    if (item.type !== 'model3d') continue
    const layer = resolveInstanceLayer(item, scene.layers, 0, index)
    if (!layer?.model3d?.content || !Object.keys(layer.model3d.content.parameters).length) continue
    const sampled = materializeLayerOverrides(layer, base), owned = modelOwnedChannels(layer)
    const data = item.instanceOf ? applyModelInstanceInputs(sampled.model3d, sampled.model3dInputValues, true)! : sampled.model3d!
    for (const p of Object.values(data.content!.parameters)) {
      const target = `layers.${item.id}.${p.target}`
      if (owned.has(p.target) || base.has(target)) throw new Error('An exposed 3D parameter conflicts with another channel writer.')
      const value = p.type === 'number' ? typeof p.value === 'number' && Number.isFinite(p.value) ? Math.min(p.max, Math.max(p.min, p.value)) : null : typeof p.value === 'boolean' ? p.value : null
      if (value === null) throw new Error('Invalid evaluated 3D parameter type.')
      if (result === base) result = new Map(base)
      result.set(target, sampleModelChannel(p.target, value))
    }
  }
  return result
}
