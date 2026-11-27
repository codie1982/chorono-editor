import type { Layer } from '../../types'
import { getLayerValue, type OverrideMap } from '../../evaluator'
import type { AssetElementMap } from '../../asset/visual/AssetElementMap'
import { buildPathOnCanvas, type PathDefinition } from '../../geometry/PathCommand'
import type { PaintBox } from '../../paint/imagePlacement'
import { strokeType } from '../../paint/paintSource'
import { activeStrokeDash, strokePaintBox } from '../../paint/strokeStyle'
import { trimSplinePath } from '../../spline/render/trimSplinePath'
import { buildGradient } from '../buildGradient'
import { imagePaintPattern } from './drawImagePaint'
import { renderSurfacePool } from '../resources/CanvasSurfacePool'

/** Canonical Spline/Mesh-boundary stroke paint, trim, dash, caps and alignment.
 * Closed paths use their true nonzero/evenodd interior. Outside is isolated and
 * masked on a borrowed, budgeted surface; it never erases underlying layers and
 * works with No Fill/alpha. Open/mixed contours use Center. Widths/geometry are
 * local px; temporary resolution follows CTM and every lease releases in finally.
 * Source/history/decoded assets are borrowed; no own cache or per-frame state. */
export function drawSplineStroke(ctx: CanvasRenderingContext2D, layer: Layer, overrides: OverrideMap, box: PaintBox,
  fullPath: PathDefinition, assets: AssetElementMap | undefined, color: () => string): void {
  const stroke = layer.style?.stroke
  if (!stroke || strokeType(stroke) === 'none') return
  const value = (key: string, fallback: number) => getLayerValue(overrides, layer.id, `style.stroke.${key}`, fallback)
  const width = value('width', stroke.width), opacity = value('opacity', stroke.opacity ?? 100)
  if (width <= 0) return
  const trim = stroke.trim, trimmed = !!trim || ['start', 'end', 'offset'].some(key => overrides.has(`layers.${layer.id}.style.stroke.trim.${key}`))
  const path = trimmed ? trimSplinePath(fullPath, value('trim.start', trim?.start ?? 0), value('trim.end', trim?.end ?? 1), value('trim.offset', trim?.offset ?? 0)) : fullPath
  if (!path.commands.length) return
  const closed = !!layer.spline && Object.values(layer.spline.contours).every(contour => contour.closed)
  const align = closed ? stroke.alignment ?? 'center' : 'center', rule = layer.spline?.fillRule ?? 'nonzero'
  const paintBox = strokePaintBox(box, width)
  const draw = (target: CanvasRenderingContext2D, thickness: number) => {
    buildPathOnCanvas(target, path)
    target.strokeStyle = strokeType(stroke) === 'pattern' ? imagePaintPattern(target, stroke.image, paintBox, assets) ?? 'transparent'
      : (strokeType(stroke) === 'gradient' ? buildGradient(target, stroke.gradient, paintBox.width, paintBox.height, paintBox.x, paintBox.y, width * 10 + 2) : null) ?? color()
    target.lineWidth = thickness; target.lineCap = stroke.lineCap ?? 'butt'; target.lineJoin = stroke.lineJoin ?? 'miter'
    target.setLineDash(activeStrokeDash(stroke)); target.lineDashOffset = 0
    target.stroke()
  }
  ctx.save()
  try {
    if (align === 'outside') {
      const matrix = ctx.getTransform(), scale = Math.max(1, Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d))
      const pad = width * 10 + 2, left = box.x - pad, top = box.y - pad
      const w = Math.ceil((box.width + pad * 2) * scale), h = Math.ceil((box.height + pad * 2) * scale)
      const surface = renderSurfacePool.acquire(w, h)
      try {
        const target = surface.context
        target.scale(scale, scale); target.translate(-left, -top); target.globalAlpha = opacity / 100
        draw(target, width * 2)
        target.globalAlpha = 1; target.globalCompositeOperation = 'destination-out'
        buildPathOnCanvas(target, fullPath); target.fillStyle = '#000'; target.fill(rule)
        ctx.drawImage(surface.canvas, left, top, w / scale, h / scale)
      } finally { surface.release() }
    } else {
      ctx.globalAlpha *= opacity / 100
      if (align === 'inside') { buildPathOnCanvas(ctx, fullPath); ctx.clip(rule) }
      draw(ctx, align === 'inside' ? width * 2 : width)
    }
  } finally { ctx.restore() }
}
