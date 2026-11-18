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

/**
 * Identifies layers whose authored geometry, rather than `size`, owns the
 * editor selection frame. Mesh2D source controls regenerate their triangles;
 * exposing a generic size-box resize would move only retained metadata and
 * desynchronise the visible mesh. Call this with an instance-resolved layer.
 */
export function usesGeometryDrivenSelectionFrame(layer: Layer | null | undefined): boolean {
  return layer?.type === 'path' || layer?.type === 'spline'
    || layer?.type === 'mesh2d' || layer?.type === 'group'
}
