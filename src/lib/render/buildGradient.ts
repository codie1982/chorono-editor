import type { GradientFill } from '@/lib/types'
import { gradientStops } from '../paint/gradientStops'
import { diamondGradient } from './paint/diamondGradient'

/** Build five gradient paints in a local pixel box, preserving legacy 0° right/
 * 90° down directions. Invalid/missing stops return null. Diamond borrows a
 * budgeted cached surface for immediate use; Angle requires native conic support.
 * Does not mutate source or own the destination context. */
export function buildGradient(
  ctx:     CanvasRenderingContext2D,
  grad:    GradientFill | undefined,
  w:       number,
  h:       number,
  originX = 0,
  originY = 0,
  outsetPx = 0,
): CanvasGradient | CanvasPattern | null {
  if (!grad || !Array.isArray(grad.stops) || grad.stops.length < 2) return null

  if (grad.type === 'diamond') return diamondGradient(ctx, grad, w, h, originX, originY, outsetPx)
  let g: CanvasGradient
  if (grad.type === 'linear' || grad.type === 'reflected') {
    const angle = ((grad.angle ?? 0) * Math.PI) / 180
    const cx = originX + w / 2, cy = originY + h / 2
    g = ctx.createLinearGradient(
      cx - Math.cos(angle) * (w / 2), cy - Math.sin(angle) * (h / 2),
      cx + Math.cos(angle) * (w / 2), cy + Math.sin(angle) * (h / 2),
    )
  } else if (grad.type === 'angle') {
    if (!ctx.createConicGradient) throw new Error('Angle gradients require Canvas2D conic-gradient support.')
    g = ctx.createConicGradient((grad.angle ?? 0) * Math.PI / 180, originX + w / 2, originY + h / 2)
  } else {
    const cx = originX + w / 2, cy = originY + h / 2
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) / 2)
  }

  for (const s of gradientStops(grad)) {
    g.addColorStop(Math.max(0, Math.min(1, s.offset)), s.color)
  }
  return g
}
