import type { Asset, Layer } from '../../types'
import { rendererRegistry } from '../../registry'
import { createLayerWorldMatrixResolver } from '../../geometry/resolveLayerWorldMatrix'
import { Matrix2D } from '../../geometry/Matrix2D'
import { LayerDrawVisibility } from '../visibility/LayerDrawVisibility'
import { directPaint } from '../visibility/PaintFrame'
import { paintOutsideArea } from '../visibility/paintOutsideArea'
import type { MediaFrameInput, VisualDemand } from './types'
import {fontCatalog,describeFont} from '../../asset/fonts'
import {fontFamilyVariants} from './fontFamilyVariants'
import {NativeDemandBranches} from './NativeDemandBranches'

/**
 * Frame-local media dependency closure over the SAME materialized snapshot as
 * drawing. Known direct bounds reuse paintOutsideArea and the native plugin's
 * bounds. Effects/masks/temporal/repeater references with uncertain enclosure
 * remain conservative. Unknown plugin dependency contracts retain all visual
 * assets instead of inventing completeness. No decode, scene mutation or clock
 * evaluation is performed here. Instances cache only current source hints and
 * asset indices. Native-free subtree certificates avoid visiting unrelated
 * vectors; unknown plugins, masks and instances remain conservative candidates.
 */
export class VisualDemandResolver {
  private readonly demandBranches=new NativeDemandBranches(rendererRegistry)
  private assets?: readonly Asset[]
  private readonly byId = new Map<string, Asset>()
  private nativeAssets: readonly Asset[] = []
  private sourceLayers?: readonly Layer[]
  private possible = false
  private readonly absent = new Set<string>()
  /** Missing referenced asset IDs, never source URLs. Reset on each resolve. */
  get missing(): readonly string[] { return Array.from(this.absent) }

  /** Resolve required current sources plus optional conservative 500ms warm
   * demand. Area/padding are backing pixels; no CSS or viewport state leaks to
   * final render. Selected layers and audible videos remain spatially live.
   * Warm moving candidates use unknown spatial bounds to avoid missed crossings;
   * static offscreen media does not become resident merely because it is active. */
  resolve(input: MediaFrameInput): VisualDemand[] {
    const { frame, context, selected } = input, { scene, sourceScene, overrides, timeMs, index } = frame
    this.index(scene.assets)
    this.absent.clear()
    if (!this.nativeAssets.length) {
      if (this.sourceLayers !== sourceScene.layers) {
        this.sourceLayers = sourceScene.layers
        this.possible = sourceScene.layers.some(layer => layer.image || layer.video || layer.frameSequence
          || rendererRegistry.find(layer)?.mediaDependencies?.(layer).assetIds?.length)
      }
      if (!this.possible) return []
    }
    const branches=this.demandBranches.select(frame)
    const result = new Map<string, VisualDemand>(), visited = new Map<string, number>()
    const visibility = new LayerDrawVisibility(scene.layers, timeMs)
    const world = createLayerWorldMatrixResolver(scene, timeMs, overrides, index), native = context.getTransform?.()
    const base = native ? new Matrix2D(native.a, native.b, native.c, native.d, native.e, native.f) : null
    const raw = input.area ?? { x: 0, y: 0, width: context.canvas?.width ?? scene.composition.width, height: context.canvas?.height ?? scene.composition.height }
    const padding = Math.max(0, input.padding ?? 0)
    const area = { x: raw.x - padding, y: raw.y - padding, width: raw.width + padding * 2, height: raw.height + padding * 2 }
    const add = (id: string, layer: Layer | undefined, required: boolean) => {
      const asset = this.byId.get(id)
      if (!asset) { this.absent.add(id); return }
      if (!['image', 'spriteSheet', 'video', 'font'].includes(asset.type)) return
      const layerId = asset.type === 'video' ? layer?.id ?? `unknown:${id}` : undefined
      let key:string
      try {key=asset.type==='font'?describeFont(asset).key:JSON.stringify(['visual',asset.id, asset.url, layerId ?? null])}
      catch {key=JSON.stringify(['invalid-font',asset.id,asset.url])}
      const old = result.get(key)
      result.set(key, { key, asset, layerId, required: required || !!old?.required })
    }
    const fonts=fontCatalog(scene.assets)
    const variants=fonts.fonts.length?fontFamilyVariants(sourceScene.timelines):new Map<string,readonly string[]>()
    const addFonts=(families:readonly string[],required:boolean)=>families.forEach(css=>fonts.find(css).forEach(font=>add(font.asset.id,undefined,required)))
    const walk = (layer: Layer, inheritedUnsafe = false, required = true) => {
      // A referenced copy may be visible where an ordinary occurrence was not.
      const mode = Number(inheritedUnsafe) + Number(required) * 2
      const bit = 1 << mode
      if ((visited.get(layer.id) ?? 0) & bit) return
      visited.set(layer.id, (visited.get(layer.id) ?? 0) | bit)
      const plugin = rendererRegistry.find(layer)
      if (!plugin) return
      const unsafe = inheritedUnsafe || !directPaint(layer)
      const audible = layer.type === 'video' && layer.video?.muted !== true && (layer.video?.volume ?? 1) !== 0
      if (!unsafe && !audible && !selected?.has(layer.id) && base && plugin.paint?.localBounds) {
        const bounds = plugin.paint.localBounds(layer, context), matrix = base.multiply(world(layer))
        if (paintOutsideArea(bounds, matrix, area)) return
        if (paintOutsideArea(bounds, matrix, raw)) required = false
      }
      const dependencies = plugin.mediaDependencies?.(layer)
      if (!dependencies) this.nativeAssets.forEach(asset => add(asset.id, asset.type === 'video' ? layer : undefined, required))
      else {
        dependencies.assetIds?.forEach(id => add(id, layer, required))
        dependencies.layerIds?.forEach(id => { const source = index.get(id); if (source && visibility.active(source)) walk(source, true, required) })
        if(dependencies.fontFamilies)addFonts([...dependencies.fontFamilies,...(variants.get(layer.id)??[])],required)
      }
      // Mask rendering intentionally bypasses the source's standalone time/hidden
      // gate, just as the existing surface pipeline's drawMask callback does.
      layer.masks?.forEach(mask => { const source = index.get(mask.maskLayerId); if (source) walk(source, true, required) })
      if (plugin.paint?.sceneChildren) index.childrenOf(layer.id).forEach(child => { if (branches.has(child.id)&&visibility.active(child)) walk(child, unsafe, required) })
    }
    if (input.rootIds) input.rootIds.forEach(id => { const layer = index.get(id); if (layer) walk(layer, true) })
    else index.roots.forEach(layer => { if (branches.has(layer.id)&&visibility.root(layer)) walk(layer) })
    // Selected text needs metrics even when its ordinary occurrence is hidden
    // or outside the active range. Other selected media keeps existing policy.
    selected?.forEach(id=>{const layer=index.get(id);if(layer?.type==='text')addFonts([layer.text?.fontFamily??'sans-serif',...(variants.get(id)??[])],true)})
    const lookahead = Math.max(0, input.prefetchMs ?? 0)
    if (lookahead > 0) {
      const dynamic = new Set<string>()
      sourceScene.timelines.forEach(timeline => timeline.tracks.forEach(track => {
        const id = /^layers\.([^.]+)\./.exec(track.target)?.[1]; if (id) dynamic.add(id)
      }))
      branches.forEach(id => {
        const layer=index.get(id);if(!layer)return
        let current: Layer | undefined = layer, moving = false, hidden = false
        const chain = new Set<string>()
        while (current && !chain.has(current.id)) {
          chain.add(current.id); moving ||= dynamic.has(current.id) || !!current.followPath || Object.keys(current.paramBindings ?? {}).length > 0
          hidden ||= !!current.hidden
          current = current.parentId ? index.get(current.parentId) : undefined
        }
        const upcoming = timeMs < (layer.startMs ?? 0) && timeMs + lookahead >= (layer.startMs ?? 0)
        const overlaps = (layer.endMs ?? Infinity) >= timeMs && (layer.startMs ?? 0) <= timeMs + lookahead
        if (overlaps && (upcoming || moving) && (!hidden || moving)) walk(layer, true, false)
      })
    }
    return Array.from(result.values())
  }
  /** Rebuild only after immutable asset metadata changes; no historical index. */
  private index(assets: readonly Asset[]): void {
    if (assets === this.assets) return
    this.assets = assets; this.byId.clear(); assets.forEach(asset => this.byId.set(asset.id, asset))
    this.nativeAssets = assets.filter(asset => ['image', 'spriteSheet', 'video', 'font'].includes(asset.type))
  }
}
