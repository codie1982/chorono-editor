import type {ChronoScene} from '../../types'
import {rendererRegistry,type LayerRendererRegistry} from '../../registry'

/** Refuse a final raster/preview with an unregistered visual source instead of
 * successfully encoding a silently missing layer. The complete source tree is
 * checked, including hidden/reference layers that another layer may consume.
 * Audio is intentionally nonvisual. This is backend availability, not a promise
 * of parity for every effect/codec; media readiness is checked by withMediaFrame.
 * New backends satisfy the existing registry contract rather than extending a
 * second hardcoded list. No source mutation or native resource acquisition.
 */
export function assertRasterLayerSupport(scene:ChronoScene,registry:Pick<LayerRendererRegistry,'find'>=rendererRegistry):void{
  const missing=scene.layers.find(layer=>layer.type!=='audio'&&!registry.find(layer))
  if(missing)throw new Error(`Raster output has no renderer for layer "${missing.name}" (${missing.id}, ${missing.type}). Register a compatible renderer or bake/convert this layer before output.`)
}
