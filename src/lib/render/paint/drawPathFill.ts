import type { Layer } from '../../types'
import { getLayerValue, type OverrideMap } from '../../evaluator'
import { getStringParamBinding, type ParamValueMap } from '../../runtime/paramResolver'
import { resolveRenderColor } from '../materializeOverrides'
import { buildGradient } from '../buildGradient'
import { drawImagePaint } from './drawImagePaint'
import type { AssetElementMap } from '../../asset/visual/AssetElementMap'
import type { PaintBox } from '../../paint/imagePlacement'

/** Paint the caller's current path without rebuilding/changing it. Shared by
 * Basic Shapes and converted paths/splines so paint survives geometry conversion.
 * Local box units are px; image placement is independent of the layer transform.
 * Existing color bindings/keys keep their priority. Inactive fill payloads are
 * ignored. No own media/cache lifetime; the frame lends ready image resources. */
export function drawPathFill(ctx: CanvasRenderingContext2D, layer: Layer, overrides: OverrideMap,
  box: PaintBox, assets?: AssetElementMap, params?: ParamValueMap, fillRule: CanvasFillRule = 'nonzero', fallback = '#3B82F6'): void {
  const fill = layer.style?.fill
  if (!fill || fill.type === 'none') return
  ctx.save()
  try {
    ctx.globalAlpha *= getLayerValue(overrides, layer.id, 'style.fill.opacity', fill.opacity ?? 100) / 100
    if (fill.type === 'image') {
      if (fill.image && assets) {
        const value = (key: 'offsetX' | 'offsetY' | 'scale' | 'rotationDeg', defaultValue: number) =>
          getLayerValue(overrides, layer.id, `style.fill.image.${key}`, fill.image![key] ?? defaultValue)
        drawImagePaint(ctx, { ...fill.image, offsetX: value('offsetX', 0), offsetY: value('offsetY', 0),
          scale: value('scale', 1), rotationDeg: value('rotationDeg', 0) }, box, assets, fillRule)
      }
    } else {
      const bound = params ? getStringParamBinding(layer, 'style.fill.color', params) : undefined
      ctx.fillStyle = (fill.type === 'gradient' ? buildGradient(ctx, fill.gradient, box.width, box.height, box.x, box.y) : null)
        ?? bound ?? resolveRenderColor(overrides, layer.id, 'style.fill.color', fill.color ?? fallback)
      ctx.fill(fillRule)
    }
  } finally { ctx.restore() }
}
