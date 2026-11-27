import type { GradientFill } from '../../types'
import { gradientStops } from '../../paint/gradientStops'
import { OffscreenCanvasCache } from '../OffscreenCanvasCache'
import { editorResourceBudget } from '../../resources/budget'

// Owned, globally charged surfaces: bounded 16 MiB / 8 entries, 2-second idle
// expiry. No scenes, callbacks, layer IDs or per-frame arrays are retained.
const surfaces = new OffscreenCanvasCache({ maxBytes: 16 * 1024 * 1024, maxEntries: 8, maxIdleMs: 2000, budget: editorResourceBudget })

/** Diamond is piecewise-linear |x|+|y| in a normalized local box. Paint its four
 * quadrants using native gradients (including stop alpha), then borrow an owned
 * cached texture for the caller's immediate fill/stroke. Resolution follows the
 * destination CTM up to 2048 px/side; no image is stored in source/history. */
export function diamondGradient(ctx: CanvasRenderingContext2D, gradient: GradientFill, w: number, h: number, x: number, y: number, outsetPx = 0): CanvasPattern {
  const matrix = ctx.getTransform(), scale = Math.max(1, Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d))
  const pad = Math.max(0, outsetPx), paintWidth = w + 2 * pad, paintHeight = h + 2 * pad
  if (w <= 0 || h <= 0) throw new Error('Diamond gradients require a non-degenerate paint box.')
  const width = Math.max(1, Math.min(2048, Math.ceil(paintWidth * scale))), height = Math.max(1, Math.min(2048, Math.ceil(paintHeight * scale)))
  const stops = gradientStops(gradient), key = JSON.stringify([gradient, width, height, w, h, pad])
  const surface = surfaces.getOrCreate(key, 1, width, height, context => {
    context.scale(width / paintWidth, height / paintHeight)
    context.translate(paintWidth / 2, paintHeight / 2); context.scale(w / 2, h / 2)
    context.rotate((gradient.angle ?? 0) * Math.PI / 180)
    const reach = 2 * (paintWidth + paintHeight) / Math.min(w, h) + 2
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const paint = context.createLinearGradient(0, 0, sx / 2, sy / 2)
      stops.forEach(stop => paint.addColorStop(stop.offset, stop.color)); context.fillStyle = paint
      context.fillRect(sx < 0 ? -reach : 0, sy < 0 ? -reach : 0, reach, reach)
    }
  })
  if (!surface) throw new Error('Diamond gradient paint exceeds the available render-surface budget.')
  const pattern = ctx.createPattern(surface.canvas, 'no-repeat')
  if (!pattern) throw new Error('Canvas pattern paint is unavailable.')
  pattern.setTransform(new DOMMatrix().translate(x - pad, y - pad).scale(paintWidth / width, paintHeight / height))
  return pattern
}
