import type { ChronoScene } from '@/lib/types'
import { buildGradient } from './buildGradient'

export type CompositionBackground = 'scene' | 'transparent' | { color: string }

/** Clears and paints the composition background in identity backing space.
 * Preserves caller state/transform. Explicit export colors bypass the scene's
 * gradient, and transparent output only clears. Extracted unchanged from the
 * dispatcher so layer traversal and frame-background painting have separate owners. */
export function drawCompositionBackground(ctx: CanvasRenderingContext2D,
  composition: ChronoScene['composition'], background: CompositionBackground): void {
  const color = background === 'transparent' ? null
    : background === 'scene' ? composition.backgroundColor : background.color
  ctx.save()
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, composition.width, composition.height)
    const gradient = background === 'scene'
      ? buildGradient(ctx, composition.backgroundGradient, composition.width, composition.height) : null
    if (gradient || color) {
      ctx.fillStyle = gradient ?? color!
      ctx.fillRect(0, 0, composition.width, composition.height)
    }
  } finally { ctx.restore() }
}
