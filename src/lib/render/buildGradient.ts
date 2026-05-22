// ── buildGradient ───────────────────────────────────────────────────────────────
//
// Shared Canvas 2D gradient builder. Single source of truth for turning a
// GradientFill (linear/radial + stops) into a CanvasGradient, used by both shape
// fills and the composition background.
//
// The gradient is centred in the w×h box: linear runs through the centre at the
// given angle (0 = top→bottom, 90 = left→right); radial expands from the centre.

import type { GradientFill } from '@/lib/types'

export function buildGradient(
  ctx:  CanvasRenderingContext2D,
  grad: GradientFill | undefined,
  w:    number,
  h:    number,
): CanvasGradient | null {
  if (!grad || !Array.isArray(grad.stops) || grad.stops.length < 2) return null

  let g: CanvasGradient
  if (grad.type === 'linear') {
    const angle = ((grad.angle ?? 0) * Math.PI) / 180
    const cx = w / 2, cy = h / 2
    g = ctx.createLinearGradient(
      cx - Math.cos(angle) * cx, cy - Math.sin(angle) * cy,
      cx + Math.cos(angle) * cx, cy + Math.sin(angle) * cy,
    )
  } else {
    g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2)
  }

  for (const s of [...grad.stops].sort((a, b) => a.offset - b.offset)) {
    g.addColorStop(Math.max(0, Math.min(1, s.offset)), s.color)
  }
  return g
}
