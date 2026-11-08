// ── ShadowEffect ──────────────────────────────────────────────────────────────
//
// Offset blur cast behind the layer. Achieved by tinting + blurring + offset
// composite under the original. Distinct from Canvas's native shadow props
// (ctx.shadowBlur etc.) because we want it as a layer post-effect, not a
// drawing-state attribute.

import type { EffectPlugin, EffectDefinition } from './EffectRegistry'
import { createOffscreen } from '@/lib/render/OffscreenCanvasCache'
import { gpuImageEffects } from '@/lib/render/gpu/effects/GPUImageEffects'

export interface ShadowEffectDefinition extends EffectDefinition {
  type: 'shadow'
  params: {
    color:   string
    blur:    number
    offsetX: number
    offsetY: number
    opacity: number   // 0–1
  }
}

export const shadowEffect: EffectPlugin<ShadowEffectDefinition> = {
  type: 'shadow',
  apply(input, effect) {
    const {
      color = '#000000', blur = 4, offsetX = 2, offsetY = 2, opacity = 0.5,
    } = effect.params

    // Tint input silhouette to shadow colour
    const tint = createOffscreen(input.width, input.height)
    const tctx = tint.getContext('2d')!
    tctx.drawImage(input, 0, 0)
    tctx.globalCompositeOperation = 'source-in'
    tctx.fillStyle = color
    tctx.fillRect(0, 0, input.width, input.height)
    tctx.globalCompositeOperation = 'source-over'

    // Pre-blur the tint on the GPU when available (CSS filter fallback applied
    // inline below). The blur is the expensive step; tint/offset stay on CPU.
    const blur2 = Math.max(0, blur)
    const gpuBlurred = blur2 > 0 ? gpuImageEffects.blur(tint, blur2) : null

    // Pad output canvas slightly to fit the offset shadow (V1: same size,
    // shadow may clip at edges — V1.5 will use a padded compositor).
    const out  = createOffscreen(input.width, input.height)
    const octx = out.getContext('2d')!

    // 1. Draw blurred shadow first, offset
    octx.globalAlpha = Math.max(0, Math.min(1, opacity))
    if (gpuBlurred) {
      octx.drawImage(gpuBlurred, offsetX, offsetY)
    } else {
      octx.filter = `blur(${blur2}px)`
      octx.drawImage(tint, offsetX, offsetY)
      octx.filter = 'none'
    }
    octx.globalAlpha = 1

    // 2. Draw original on top
    octx.drawImage(input, 0, 0)
    return out
  },
}
