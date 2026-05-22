// ── GPUCompositor ─────────────────────────────────────────────────────────────
//
// Blits a backend's offscreen WebGL canvas onto the destination 2D context.
//
// Two correctness guarantees baked in here:
//   1. IDENTITY transform — the layer transform is already baked into the GL
//      u_transform matrix, so the destination context's current transform is
//      reset before drawImage to avoid applying it twice.
//   2. SCENE blend — screen / multiply must blend against the real scene below,
//      not the empty GL canvas. So the particle blend mode is applied here at
//      composite time via globalCompositeOperation (the GL pass only blends
//      particles with each other).
//
// globalAlpha is forced to 1: per-particle opacity already includes layerAlpha
// (baked by ParticleBufferPacker), so re-applying it here would double-dim.

import type { ParticleBlendMode } from '@/lib/particles/types'

const BLEND_MAP: Record<ParticleBlendMode, GlobalCompositeOperation> = {
  normal:   'source-over',
  additive: 'lighter',
  screen:   'screen',
  multiply: 'multiply',
}

export class GPUCompositor {
  static composite(
    glCanvas:  HTMLCanvasElement,
    destCtx:   CanvasRenderingContext2D,
    blendMode: ParticleBlendMode,
  ): void {
    destCtx.save()
    destCtx.setTransform(1, 0, 0, 1, 0, 0)
    destCtx.globalAlpha = 1
    destCtx.filter = 'none'
    destCtx.globalCompositeOperation = BLEND_MAP[blendMode] ?? 'source-over'
    destCtx.drawImage(glCanvas, 0, 0)
    destCtx.restore()
  }
}
