// ── BlurEffect ────────────────────────────────────────────────────────────────
//
// Separable Gaussian blur on the GPU (gpuImageEffects.blur) when available,
// falling back to Canvas's native `filter = 'blur(Npx)'` otherwise. The GPU path
// gives a true multi-pass Gaussian (halo-free, premultiplied) and offloads the
// cost; the CSS path is the original behaviour and is also browser-accelerated.

import type { EffectPlugin, EffectDefinition } from './EffectRegistry'
import { createOffscreen } from '@/lib/render/OffscreenCanvasCache'
import { gpuImageEffects } from '@/lib/render/gpu/effects/GPUImageEffects'

export interface BlurEffectDefinition extends EffectDefinition {
  type: 'blur'
  params: {
    /** Blur radius in px. */
    radius: number
  }
}

export const blurEffect: EffectPlugin<BlurEffectDefinition> = {
  type: 'blur',
  apply(input, effect) {
    const r = Math.max(0, effect.params.radius ?? 0)
    if (r === 0) return input

    // GPU path: separable Gaussian. Copy the GL result into a fresh 2D canvas so
    // the singleton's GL canvas is free to be reused by the next effect.
    const gpu = gpuImageEffects.blur(input, r)
    if (gpu) {
      const out = createOffscreen(input.width, input.height)
      out.getContext('2d')!.drawImage(gpu, 0, 0)
      return out
    }

    // CPU fallback: native CSS blur.
    const out = createOffscreen(input.width, input.height)
    const ctx = out.getContext('2d')!
    ctx.filter = `blur(${r}px)`
    ctx.drawImage(input, 0, 0)
    ctx.filter = 'none'
    return out
  },
}
