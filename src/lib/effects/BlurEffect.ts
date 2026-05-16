// ── BlurEffect ────────────────────────────────────────────────────────────────
//
// Uses Canvas's native `filter = 'blur(Npx)'`. GPU-accelerated in modern
// browsers; falls back to box blur. For finer control (separable Gaussian
// kernel, multi-pass) we'd swap this for a manual implementation.

import type { EffectPlugin, EffectDefinition } from './EffectRegistry'
import { createOffscreen } from '@/lib/render/OffscreenCanvasCache'

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
    const out = createOffscreen(input.width, input.height)
    const ctx = out.getContext('2d')!
    ctx.filter = `blur(${r}px)`
    ctx.drawImage(input, 0, 0)
    ctx.filter = 'none'
    return out
  },
}
