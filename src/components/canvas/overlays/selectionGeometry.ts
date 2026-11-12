import type { Asset, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { materializeLayerOverrides } from '@/lib/render/materializeOverrides'
import { measureTextLayout } from '@/lib/text/measureText'

const textLayoutFields = ['value', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'uppercase']
/** Project one resolved layer's editor outline through the drawn frame. Text
 * layout flags can change glyph bounds without a size track, so remeasure when
 * those fields are overridden. Source/asset/frame data stays borrowed; only
 * display geometry is returned and no evaluated pose is committed to history.
 * Dimensions are layer-local composition px; matrix/zoom remain caller-owned. */
export function selectionGeometry(layer: Layer, frame: OverrideMap, assets: readonly Asset[]): Layer {
  const visual = materializeLayerOverrides(layer, frame)
  return visual.text && textLayoutFields.some(path => frame.has('layers.' + layer.id + '.text.' + path))
    ? { ...visual, size: measureTextLayout(visual.text, assets) } : visual
}
