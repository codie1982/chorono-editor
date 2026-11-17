import type { Layer } from '../../types'
import { LayerIndex } from '../../scene/LayerIndex'
const models = new WeakMap<Layer[], { layers: readonly Layer[]; index?: LayerIndex }>()
/** Weak, immutable-source candidate discovery shared by all model frame stages.
 * Old 2D frames do no per-frame full-scene scan or relationship allocation. */
export function modelCandidates(layers: Layer[]): { layers: readonly Layer[]; index?: LayerIndex } {
  let value = models.get(layers)
  if (!value) {
    const candidates: Layer[] = []
    for (const layer of layers) if (layer.type === 'model3d') candidates.push(layer)
    value = { layers: candidates, index: candidates.some(l => l.instanceOf) ? new LayerIndex(layers) : undefined }; models.set(layers, value)
  }
  return value
}
