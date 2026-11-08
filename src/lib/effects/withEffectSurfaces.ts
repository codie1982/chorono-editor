import type { EffectDefinition, EffectPlugin } from './EffectRegistry'
import { withCanvasSurfaceResult, type CanvasSurfaceAllocator } from '@/lib/render/resources/CanvasSurfaceScope'

/**
 * One ownership adapter for all built-in effect algorithms. Scratch is returned
 * after each pass (also on failure); only the result transfers to the caller.
 * Legacy two-argument apply returns an ordinary canvas. Managed callers supply
 * a scope, whose admission budget covers output and all intermediate canvases.
 */
export function withEffectSurfaces<T extends EffectDefinition>(
  draw: (input: HTMLCanvasElement, effect: T, surfaces: CanvasSurfaceAllocator) => HTMLCanvasElement,
): EffectPlugin<T>['apply'] {
  return (input, effect, surfaces) => withCanvasSurfaceResult(surfaces, local => draw(input, effect, local))
}
