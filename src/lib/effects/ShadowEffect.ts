// ── ShadowEffect ──────────────────────────────────────────────────────────────
//
// Offset blur cast behind the layer. Achieved by tinting + blurring + offset
// composite under the original. Distinct from Canvas's native shadow props
// (ctx.shadowBlur etc.) because we want it as a layer post-effect, not a
// drawing-state attribute.

import type { EffectPlugin, EffectDefinition } from './EffectRegistry'
import { withEffectSurfaces } from './withEffectSurfaces'
import { withCanvasSurfaceResult, type CanvasSurfaceAllocator } from '@/lib/render/resources/CanvasSurfaceScope'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { shadowRegionPadding } from './effectRegionPadding'
import { requireRegionBackend } from './requireRegionBackend'
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

/** Shared legacy/fused shadow algorithm. Input/output stay full-composition;
 * an optional certified rect shrinks only the tinted/blurred intermediate. Native
 * source AA and final blit retain their phase. All scratch uses the supplied
 * scope; unavailable cropped blur asks its host for a full-domain retry. */
function renderShadow(input: HTMLCanvasElement, effect: ShadowEffectDefinition,
  surfaces: CanvasSurfaceAllocator, region?: PathBounds): HTMLCanvasElement {
  const work = region ?? {x:0,y:0,width:input.width,height:input.height}

  const {
    color = '#000000', blur = 4, offsetX = 2, offsetY = 2, opacity = 0.5,
  } = effect.params

  // Tint input silhouette to shadow colour
  const tint = surfaces.create(work.width, work.height)
  const tctx = tint.getContext('2d')!
  if (region) tctx.drawImage(input, work.x, work.y, work.width, work.height, 0, 0, work.width, work.height)
  else tctx.drawImage(input, 0, 0)
  tctx.globalCompositeOperation = 'source-in'
  tctx.fillStyle = color
  tctx.fillRect(0, 0, work.width, work.height)
  tctx.globalCompositeOperation = 'source-over'

  // Pre-blur the tint on the GPU when available (CSS filter fallback applied
  // inline below). The blur is the expensive step; tint/offset stay on CPU.
  const blur2 = Math.max(0, blur)
  const gpuBlurred = blur2 > 0 ? gpuImageEffects.blur(tint, blur2) : null
  requireRegionBackend(surfaces, gpuBlurred, blur2)

  // Preserve the full composition output and its original clipping domain.
  // Only the tinted/blurred intermediate may use the certified ROI.
  const out  = surfaces.create(input.width, input.height)
  const octx = out.getContext('2d')!

  // 1. Draw blurred shadow first, offset
  octx.globalAlpha = Math.max(0, Math.min(1, opacity))
  if (gpuBlurred) {
    octx.drawImage(gpuBlurred, work.x + offsetX, work.y + offsetY)
  } else {
    octx.filter = `blur(${blur2}px)`
    octx.drawImage(tint, work.x + offsetX, work.y + offsetY)
    octx.filter = 'none'
  }
  octx.globalAlpha = 1

  // 2. Draw original on top
  octx.drawImage(input, 0, 0)
  return out
}

export const shadowEffect: EffectPlugin<ShadowEffectDefinition> = {
  type: 'shadow',
  alphaSafe: true,
  regionPadding: effect => (effect.params.blur ?? 4) > 0 && !gpuImageEffects.supportsRegionBlur()
    ? null : shadowRegionPadding(effect.params.blur ?? 4, effect.params.offsetX ?? 2, effect.params.offsetY ?? 2),
  apply: withEffectSurfaces<ShadowEffectDefinition>(renderShadow),
  applyRegion: (input, effect, region, surfaces) => withCanvasSurfaceResult(surfaces,
    local => renderShadow(input, effect, local, region)),
}
