import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '../asset/visual/AssetElementMap'
import { buildGradient } from './buildGradient'
import { compositionFill, compositionForOutput } from '../paint/paintSource'
import { drawImagePaint } from './paint/drawImagePaint'

export type CompositionBackground = 'scene' | 'transparent' | { color: string }

/** Clear/paint in identity composition backing space, preserving caller state.
 * Viewport always shows the scene background. Output hosts explicitly set
 * `output`, so an editor-only background clears to alpha. An explicit output
 * color overrides scene paint/visibility; transparent always clears. Ready image
 * handles are borrowed from the same budgeted media session as scene layers. */
export function drawCompositionBackground(ctx: CanvasRenderingContext2D,
  composition: ChronoScene['composition'], background: CompositionBackground, assets?: AssetElementMap, output = false): void {
  ctx.save()
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, composition.width, composition.height)
    if (background === 'transparent') return
    const fill = background === 'scene' ? compositionFill(output ? compositionForOutput(composition) : composition)
      : { type: 'solid' as const, color: background.color }
    if (fill.type === 'none') return
    ctx.globalAlpha *= (fill.opacity ?? 100) / 100
    if (fill.type === 'image') {
      if (!assets) return
      ctx.beginPath(); ctx.rect(0, 0, composition.width, composition.height)
      drawImagePaint(ctx, fill.image, { x: 0, y: 0, width: composition.width, height: composition.height }, assets)
    } else {
      ctx.fillStyle = (fill.type === 'gradient' ? buildGradient(ctx, fill.gradient, composition.width, composition.height) : null) ?? fill.color ?? 'transparent'
      ctx.fillRect(0, 0, composition.width, composition.height)
    }
  } finally { ctx.restore() }
}
