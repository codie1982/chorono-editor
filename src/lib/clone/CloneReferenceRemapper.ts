import type { Layer } from '../types'

/** Remap typed layer references within a cloned forest. Inputs are borrowed;
 * only records containing a remapped field are copied. References outside the
 * forest and asset/parameter IDs stay shared. This does not clone runtime graphs
 * or interpret arbitrary plugin strings as layer IDs. */
export function remapCloneLayerReferences(layer: Layer, ids: Readonly<Record<string, string>>): Layer {
  const ref = (id: string) => ids[id] ?? id
  const area = layer.particleEmitter?.emitter.area
  return { ...layer,
    ...(layer.parentId ? { parentId: ref(layer.parentId) } : {}),
    ...(layer.followPath ? { followPath: { ...layer.followPath, pathLayerId: ref(layer.followPath.pathLayerId) } } : {}),
    ...(layer.masks ? { masks: layer.masks.map(mask => ({ ...mask, maskLayerId: ref(mask.maskLayerId) })) } : {}),
    ...(layer.repeater ? { repeater: { ...layer.repeater, sourceLayerId: ref(layer.repeater.sourceLayerId) } } : {}),
    ...(layer.motionBlur?.bakedGroupId ? { motionBlur: { ...layer.motionBlur, bakedGroupId: ref(layer.motionBlur.bakedGroupId) } } : {}),
    ...(layer.particleEmitter && area ? { particleEmitter: { ...layer.particleEmitter,
      emitter: { ...layer.particleEmitter.emitter, area: { ...area,
        ...(area.pathLayerId ? { pathLayerId: ref(area.pathLayerId) } : {}),
        ...(area.sourceLayerId ? { sourceLayerId: ref(area.sourceLayerId) } : {}),
      } } } } : {}),
  }
}
