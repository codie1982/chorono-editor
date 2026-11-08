// ── InnerShadowEffect ─────────────────────────────────────────────────────────
//
// Casts a shadow INSIDE the shape (as opposed to ShadowEffect which casts
// outward). Standard CSS "inset shadow" / Sketch "inner shadow" equivalent.
//
// Algorithm:
//   1. Render the input silhouette to canvas A
//   2. Create a same-size canvas B filled with the shadow colour
//   3. Knock OUT the input silhouette from B but SHIFTED by (offsetX, offsetY)
//      using composite 'destination-out' → leaves shadow only where the
//      shape would extend beyond the offset version (= inside the shape)
//   4. Blur the result
//   5. Composite B over A using 'source-atop' so the shadow only shows where
//      the original silhouette exists (clips to shape edge)

import type { EffectPlugin, EffectDefinition } from './EffectRegistry'
import { createOffscreen } from '@/lib/render/OffscreenCanvasCache'
import { gpuImageEffects } from '@/lib/render/gpu/effects/GPUImageEffects'

export interface InnerShadowEffectDefinition extends EffectDefinition {
  type: 'innerShadow'
  params: {
    color:   string
    blur:    number
    offsetX: number
    offsetY: number
    opacity: number   // 0–1
  }
}

export const innerShadowEffect: EffectPlugin<InnerShadowEffectDefinition> = {
  type: 'innerShadow',
  apply(input, effect) {
    const {
      color = '#000000', blur = 4, offsetX = 2, offsetY = 2, opacity = 0.5,
    } = effect.params

    const W = input.width
    const H = input.height

    // ── 1. Build the "inverse silhouette" canvas:
    //       full colour rect, then knock out an OFFSET copy of the input.
    //       What remains is the difference, blurred = inner shadow.
    const inv = createOffscreen(W, H)
    const ictx = inv.getContext('2d')!
    ictx.fillStyle = color
    ictx.fillRect(0, 0, W, H)
    ictx.globalCompositeOperation = 'destination-out'
    ictx.drawImage(input, offsetX, offsetY)
    ictx.globalCompositeOperation = 'source-over'

    // ── 2. Blur the difference layer (the shadow itself).
    //       GPU separable Gaussian when available; CSS-filter fallback otherwise.
    const r = Math.max(0, blur)
    const blurred = createOffscreen(W, H)
    const bctx    = blurred.getContext('2d')!
    const gpu = r > 0 ? gpuImageEffects.blur(inv, r) : null
    if (gpu) {
      bctx.drawImage(gpu, 0, 0)
    } else {
      bctx.filter = `blur(${r}px)`
      bctx.drawImage(inv, 0, 0)
      bctx.filter = 'none'
    }

    // ── 3. Clip the shadow to the original shape using source-atop
    const out  = createOffscreen(W, H)
    const octx = out.getContext('2d')!
    octx.drawImage(input, 0, 0)                            // start with original
    octx.globalAlpha = Math.max(0, Math.min(1, opacity))
    octx.globalCompositeOperation = 'source-atop'          // draw only where input exists
    octx.drawImage(blurred, 0, 0)
    octx.globalAlpha = 1
    octx.globalCompositeOperation = 'source-over'
    return out
  },
}
