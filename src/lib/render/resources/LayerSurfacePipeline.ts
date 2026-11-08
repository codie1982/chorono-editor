import type { Layer, MaskDefinition } from '@/lib/types'
import { effectRegistry, type EffectRegistry, type EffectDefinition } from '@/lib/effects'
import { MaskRenderer } from '@/lib/mask/MaskRenderer'
import { renderSurfacePool, type CanvasSurfaceProvider } from './CanvasSurfacePool'
import { CanvasSurfaceScope, SurfaceRegionFallback } from './CanvasSurfaceScope'
import type { PathBounds } from '@/lib/geometry/computePathBounds'

/** Synchronous composition callbacks borrow surfaces; callers must not resize or retain them. */
export interface LayerSurfacePass {
  width: number
  height: number
  /** Optional integer composition rect. Omitted preserves the full legacy
   * domain. Content/mask callbacks still receive composition coordinates. */
  region?: PathBounds
  layer: Layer
  effects: readonly EffectDefinition[]
  masks: MaskDefinition[]
  drawContent(context: CanvasRenderingContext2D): void
  drawMask(layer: Layer, context: CanvasRenderingContext2D): void
  getLayer(id: string): Layer | undefined
  /** Receives a full-composition canvas/rect, even when intermediate passes crop. */
  composite(canvas: HTMLCanvasElement, region: PathBounds): void
}

/**
 * Owns one layer's content → effects → masks → composite scratch lifetime.
 * Reuses the same provider as MaskRenderer and effect adapters. No transforms,
 * scene/frame cache or async work are retained; the caller supplies composition
 * coordinates. Effect/mask ordering is unchanged; ROI adds integer crop/expand
 * copies around those passes. Initial source, mask silhouettes and final blit
 * retain the native full-domain raster phase. CSS blur stays full-domain.
 * Nested calls borrow exclusive leases. All failures release this operation's
 * surfaces before propagating, never committing an unmasked fallback frame.
 */
export class LayerSurfacePipeline {
  private readonly masks: MaskRenderer

  /** Defaults to the shared budget; injectable collaborators permit lifecycle/failure tests. */
  constructor(private readonly surfaces: CanvasSurfaceProvider = renderSurfacePool,
    private readonly effects: Pick<EffectRegistry, 'applyChain'> & Partial<Pick<EffectRegistry, 'get'>> = effectRegistry) {
    this.masks = new MaskRenderer(surfaces)
  }

  /** Renders synchronously and transfers pixels to composite, never ownership of its backing canvas. */
  render(pass: LayerSurfacePass): void {
    const region = pass.region ?? { x: 0, y: 0, width: pass.width, height: pass.height }
    if (!Object.values(region).every(Number.isSafeInteger) || region.x < 0 || region.y < 0
      || region.width <= 0 || region.height <= 0 || region.x + region.width > pass.width || region.y + region.height > pass.height) {
      throw new RangeError('Scratch region must be an integer rectangle inside the composition.')
    }
    const scope = new CanvasSurfaceScope(this.surfaces, !!pass.region)
    try {
      // Native vector tessellation can depend on target extent. Rasterize the
      // source in its original full domain, then crop integer pixels. Effects
      // and mask content/output can shrink without changing path AA phase.
      let content = scope.create(pass.width, pass.height)
      const context = content.getContext('2d')!
      context.save()
      try {
        pass.drawContent(context)
      } finally { context.restore() }
      const enabled = pass.effects.filter(effect => effect.enabled)
      if (pass.region && !pass.masks.length && enabled.length === 1 && this.effects.get?.(enabled[0].type)?.applyRegion) {
        // A certified fused plugin preserves both full-size raster phases;
        // only its internal scratch crops, avoiding two full-frame copies.
        const output = this.effects.applyChain(content, enabled, scope, region)
        if (output !== content) scope.release(content)
        pass.composite(output, {x:0,y:0,width:pass.width,height:pass.height})
        return
      }
      if (pass.region) {
        const cropped = scope.create(region.width, region.height)
        cropped.getContext('2d')!.drawImage(content, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
        scope.release(content)
        content = cropped
      }
      const effected = this.effects.applyChain(content, pass.effects, scope)
      if (effected !== content) scope.release(content)
      content = effected

      if (pass.masks.length) {
        const final = scope.create(region.width, region.height)
        this.masks.render(pass.masks, {
          destCtx: final.getContext('2d')!, width: region.width, height: region.height, origin: region,
          compositionSize: pass.region ? {width:pass.width,height:pass.height} : undefined,
          hostLayer: pass.layer,
          renderHost: context => context.drawImage(content, 0, 0),
          renderMask: pass.drawMask, getLayer: pass.getLayer,
        })
        scope.release(content)
        content = final
      }
      // Preserve the legacy final drawImage quad too. Under fractional parent
      // cancellation, changing its extent can change Canvas sampling at sharp
      // edges. Only internal effect/mask passes use cropped targets in v1.
      if (pass.region) {
        const full = scope.create(pass.width, pass.height)
        full.getContext('2d')!.drawImage(content, region.x, region.y)
        scope.release(content)
        content = full
      }
      pass.composite(content, {x:0,y:0,width:pass.width,height:pass.height})
    } catch (error) {
      if (!(error instanceof SurfaceRegionFallback) || !pass.region) throw error
      scope.dispose()
      this.render({...pass,region:undefined})
    } finally { scope.dispose() }
  }
}
