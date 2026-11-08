// ── InnerGlowEffect ───────────────────────────────────────────────────────────
//
// Soft coloured halo on the INSIDE edge of the shape. Same approach as
// InnerShadowEffect but without an offset — the difference between the
// silhouette and an INSET version of itself.
//
// We approximate "inset by N px" by drawing the input with shrunk dimensions
// centred, which is cheap and visually convincing for moderate radii.

import type { EffectPlugin, EffectDefinition } from './EffectRegistry'
import { withEffectSurfaces } from './withEffectSurfaces'
import { gpuImageEffects } from '@/lib/render/gpu/effects/GPUImageEffects'

export interface InnerGlowEffectDefinition extends EffectDefinition {
  type: 'innerGlow'
  params: {
    color:     string
    radius:    number    // glow blur radius in px
    intensity: number    // 0–1
  }
}

export const innerGlowEffect: EffectPlugin<InnerGlowEffectDefinition> = {
  type: 'innerGlow',
  alphaSafe: true,
  apply: withEffectSurfaces<InnerGlowEffectDefinition>((input, effect, surfaces) => {
    const { color = '#FFFFFF', radius = 8, intensity = 0.8 } = effect.params
    const W = input.width
    const H = input.height

    // Tint a full-rect copy with the glow colour, then knock out the input
    // silhouette (so we keep the ring of glow colour OUTSIDE the silhouette).
    // Then blur and clip back to the original shape with source-atop.
    const ring = surfaces.create(W, H)
    const rctx = ring.getContext('2d')!
    rctx.fillStyle = color
    rctx.fillRect(0, 0, W, H)
    rctx.globalCompositeOperation = 'destination-out'
    rctx.drawImage(input, 0, 0)
    rctx.globalCompositeOperation = 'source-over'

    // Blur the ring so it bleeds inward when clipped to the silhouette.
    // GPU separable Gaussian when available; CSS-filter fallback otherwise.
    const r = Math.max(0, radius)
    const blurred = surfaces.create(W, H)
    const bctx    = blurred.getContext('2d')!
    const gpu = r > 0 ? gpuImageEffects.blur(ring, r) : null
    if (gpu) {
      bctx.drawImage(gpu, 0, 0)
    } else {
      bctx.filter = `blur(${r}px)`
      bctx.drawImage(ring, 0, 0)
      bctx.filter = 'none'
    }

    surfaces.release(ring)
    // Composite original + clipped glow
    const out  = surfaces.create(W, H)
    const octx = out.getContext('2d')!
    octx.drawImage(input, 0, 0)
    octx.globalAlpha = Math.max(0, Math.min(1, intensity))
    octx.globalCompositeOperation = 'source-atop'
    octx.drawImage(blurred, 0, 0)
    octx.globalAlpha = 1
    octx.globalCompositeOperation = 'source-over'
    return out
  }),
}
