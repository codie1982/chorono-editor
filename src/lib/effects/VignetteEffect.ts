// ── VignetteEffect ────────────────────────────────────────────────────────────
//
// Radial darken/lighten from edges. Standard photo-style vignette.
// Implemented as a radial gradient mask over the layer, clipped with
// 'source-atop' so it doesn't leak beyond the silhouette.

import type { EffectPlugin, EffectDefinition } from './EffectRegistry'
import { withEffectSurfaces } from './withEffectSurfaces'

export interface VignetteEffectDefinition extends EffectDefinition {
  type: 'vignette'
  params: {
    color:     string   // hex — dark by default
    strength:  number   // 0–1 alpha at the corners
    /** 0 = vignette starts at centre, 1 = only the outer 0% (no vignette). */
    innerStop: number
  }
}

export const vignetteEffect: EffectPlugin<VignetteEffectDefinition> = {
  type: 'vignette',
  apply: withEffectSurfaces<VignetteEffectDefinition>((input, effect, surfaces) => {
    const { color = '#000000', strength = 0.5, innerStop = 0.4 } = effect.params
    const W = input.width
    const H = input.height

    const out  = surfaces.create(W, H)
    const octx = out.getContext('2d')!
    octx.drawImage(input, 0, 0)

    // Radial gradient: transparent at centre, semi-opaque colour at corners.
    const r = Math.hypot(W, H) / 2
    const grad = octx.createRadialGradient(W / 2, H / 2, r * innerStop, W / 2, H / 2, r)
    grad.addColorStop(0, hexWithAlpha(color, 0))
    grad.addColorStop(1, hexWithAlpha(color, strength))

    octx.globalCompositeOperation = 'source-atop'   // clip to silhouette
    octx.fillStyle = grad
    octx.fillRect(0, 0, W, H)
    octx.globalCompositeOperation = 'source-over'
    return out
  }),
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha))
  // Accept #rgb / #rrggbb
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
