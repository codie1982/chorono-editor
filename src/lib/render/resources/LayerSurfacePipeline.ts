import type { Layer, MaskDefinition } from '@/lib/types'
import { effectRegistry, type EffectRegistry, type EffectDefinition } from '@/lib/effects'
import { MaskRenderer } from '@/lib/mask/MaskRenderer'
import { renderSurfacePool, type CanvasSurfaceProvider } from './CanvasSurfacePool'
import { CanvasSurfaceScope } from './CanvasSurfaceScope'

/** Synchronous composition callbacks borrow surfaces; callers must not resize or retain them. */
export interface LayerSurfacePass {
  width: number
  height: number
  layer: Layer
  effects: readonly EffectDefinition[]
  masks: MaskDefinition[]
  drawContent(context: CanvasRenderingContext2D): void
  drawMask(layer: Layer, context: CanvasRenderingContext2D): void
  getLayer(id: string): Layer | undefined
  composite(canvas: HTMLCanvasElement): void
}

/**
 * Owns one layer's content → effects → masks → composite scratch lifetime.
 * Reuses the same provider as MaskRenderer and effect adapters. No transforms,
 * scene/frame cache or async work are retained; the caller supplies composition
 * coordinates. Pass count/compositing order stay unchanged for pixel parity.
 * Nested calls borrow exclusive leases. All failures release this operation's
 * surfaces before propagating, never committing an unmasked fallback frame.
 */
export class LayerSurfacePipeline {
  private readonly masks: MaskRenderer

  /** Defaults to the shared budget; injectable collaborators permit lifecycle/failure tests. */
  constructor(private readonly surfaces: CanvasSurfaceProvider = renderSurfacePool,
    private readonly effects: Pick<EffectRegistry, 'applyChain'> = effectRegistry) {
    this.masks = new MaskRenderer(surfaces)
  }

  /** Renders synchronously and transfers pixels to composite, never ownership of its backing canvas. */
  render(pass: LayerSurfacePass): void {
    const scope = new CanvasSurfaceScope(this.surfaces)
    try {
      let content = scope.create(pass.width, pass.height)
      pass.drawContent(content.getContext('2d')!)
      const effected = this.effects.applyChain(content, pass.effects, scope)
      if (effected !== content) scope.release(content)
      content = effected

      if (pass.masks.length) {
        const final = scope.create(pass.width, pass.height)
        this.masks.render(pass.masks, {
          destCtx: final.getContext('2d')!, width: pass.width, height: pass.height,
          hostLayer: pass.layer,
          renderHost: context => context.drawImage(content, 0, 0),
          renderMask: pass.drawMask, getLayer: pass.getLayer,
        })
        scope.release(content)
        content = final
      }
      pass.composite(content)
    } finally { scope.dispose() }
  }
}
