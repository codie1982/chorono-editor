// ── GlowEffect ────────────────────────────────────────────────────────────────
//
// Multi-pass effect:
//   1. Render input silhouette into offscreen A
//   2. Tint A with glow colour (source-in composite)
//   3. Blur A by `radius` (canvas filter)
//   4. Composite A under the original input (destination-over): glow appears
//      around but doesn't replace the silhouette.

import type { EffectPlugin, EffectDefinition } from './EffectRegistry'
import { createOffscreen } from '@/lib/render/OffscreenCanvasCache'
import { gpuImageEffects } from '@/lib/render/gpu/effects/GPUImageEffects'

export interface GlowEffectDefinition extends EffectDefinition {
  type: 'glow'
  params: {
    color:     string   // hex colour
    radius:    number   // blur radius in px
    intensity: number   // 0–1 alpha multiplier
  }
}

/** Gaussian-blur the tinted glow on the GPU, falling back to CSS filter. */
function blurGlow(glow: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const gpu = gpuImageEffects.blur(glow, radius)
  const blurred = createOffscreen(glow.width, glow.height)
  const bctx = blurred.getContext('2d')!
  if (gpu) {
    bctx.drawImage(gpu, 0, 0)
  } else {
    bctx.filter = `blur(${radius}px)`
    bctx.drawImage(glow, 0, 0)
    bctx.filter = 'none'
  }
  return blurred
}

export const glowEffect: EffectPlugin<GlowEffectDefinition> = {
  type: 'glow',
  apply(input, effect) {
    const { color = '#FFFFFF', radius = 8, intensity = 0.8 } = effect.params

    // ── Tint pass: copy input alpha, fill with glow colour ──
    const glow = createOffscreen(input.width, input.height)
    const gctx = glow.getContext('2d')!
    gctx.drawImage(input, 0, 0)
    gctx.globalCompositeOperation = 'source-in'
    gctx.fillStyle = color
    gctx.fillRect(0, 0, input.width, input.height)
    gctx.globalCompositeOperation = 'source-over'

    // ── Blur pass on the tinted glow (GPU, CSS fallback) ──
    const blurred = blurGlow(glow, radius)

    // ── Composite: blurred glow under original input ──
    const out  = createOffscreen(input.width, input.height)
    const octx = out.getContext('2d')!
    octx.globalAlpha = Math.max(0, Math.min(1, intensity))
    octx.drawImage(blurred, 0, 0)
    octx.globalAlpha = 1
    octx.drawImage(input, 0, 0)
    return out
  },
}
