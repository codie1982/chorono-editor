import type {Layer} from '../../types'

/** Explicit advisories for features omitted by the current basic SVG adapter.
 * Geometry is still emitted; no automatic raster bake is performed. Defaults
 * and disabled effects do not warn. Call only for layers actually serialized.
 * The list describes current losses, not unsupported future backend promises.
 */
export function svgLayerWarnings(layer:Layer):string[]{
  const omitted:string[]=[]
  if(layer.masks?.length)omitted.push('masks')
  const e=layer.effects
  if(e&&((e.blur??0)!==0||(e.brightness??100)!==100||(e.contrast??100)!==100||(e.saturate??100)!==100)
    ||layer.effectsChain?.some(effect=>effect.enabled)||layer.motionBlur?.enabled&&!layer.motionBlur.baked)omitted.push('effects')
  if(layer.blendMode&&layer.blendMode!=='source-over')omitted.push('blend mode')
  return omitted.length?[`Layer "${layer.name}" (${layer.id}): SVG omits ${omitted.join(', ')}. Use raster output for the composed appearance; automatic SVG raster baking is not available.`]:[]
}
