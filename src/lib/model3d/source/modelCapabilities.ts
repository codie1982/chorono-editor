import type { ChronoScene, Layer } from '../../types'
import { resolveInstanceLayer } from '../../clone/InstanceResolver'
import { validateModel } from './modelDefaults'

/** Validate a serialized boxed layer, resolving thin live instances through
 * their existing source contract. Unrelated 2D layers are untouched. */
export function assertModelLayer(layer: Layer, layers: Layer[]): void {
  if (layer.type !== 'model3d') return
  const effective = resolveInstanceLayer(layer, layers)
  if (!effective) throw new Error('3D instance source is missing.')
  validateModel(effective.model3d!)
  const size = effective.size
  if (!size || !(size.width >= 1 && size.width <= 4096 && size.height >= 1 && size.height <= 4096)) throw new Error('3D layer dimensions must be 1..4096 px.')
}
/** Explicit capability boundary for artifacts which target the independently
 * published legacy player/native runtimes. A source JSON export remains valid;
 * an unsupported playback artifact must fail before serializing/allocating it. */
export function assertModelPlaybackExport(scene: Pick<ChronoScene, 'layers'>): void {
  if (scene.layers.some(layer => layer.type === 'model3d')) throw new Error('Boxed 3D is not supported by basic/native runtime or standalone HTML export. Use raster output or explicitly rasterize the model layer first.')
}
