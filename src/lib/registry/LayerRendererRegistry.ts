// ── LayerRendererRegistry ─────────────────────────────────────────────────────
//
// Separate from LayerRegistry on purpose — renderers may evolve independently
// (e.g. one shape kind might have a 'fast' and a 'high-quality' renderer).
// Each plugin advertises which layers it supports via `supports(layer)`.

import type { Layer } from '@/lib/types'
import type { RenderContext } from '@/lib/render/RenderContext'
import type { PathBounds } from '@/lib/geometry/computePathBounds'

/** Optional, conservative paint contract. Missing capability means draw normally.
 * Bounds enclose ALL local paint (including strokes); null means unknown.
 * alphaSafe certifies that zero inherited alpha cannot change the destination.
 * sceneChildren certifies ordinary parent/child traversal, without extra copies.
 * The dispatcher separately excludes filters, masks, temporal effects and blends. */
export interface LayerPaintCapability {
  readonly alphaSafe: boolean
  readonly sceneChildren?: boolean
  /** Bounds/ordinary children certify the transparent support of a native
   * full-domain raster for subsequent integer cropping. No canvas-wide hidden
   * paint. Bounds must still be known; missing opt-in preserves full passes. */
  readonly regionSafe?: boolean
  /** Pure native geometry suitable for a transparent, alpha-one static proxy.
   * No media readiness, side effects or hidden context dependencies. Opt-in only. */
  readonly staticRasterSafe?: boolean | ((layer: Layer) => boolean)
  localBounds?(layer: Layer, context: CanvasRenderingContext2D): PathBounds | null
}

export interface LayerRendererPlugin<T extends Layer = Layer> {
  /** Stable id for debugging / hot-swap. */
  id: string
  paint?: LayerPaintCapability
  /** Optional certificate: this plugin never directly reads assets, font families
   * or referenced media layers for ANY supported property values. Masks and
   * ordinary sceneChildren remain the dispatcher's responsibility. Missing means
   * dynamic/unknown dependencies: never skip based on an empty current query. */
  nativeMediaFree?: boolean
  /** Complete direct media/source references for residency. Omit for unknown
   * plugins: preparation conservatively retains all project visual/font sources.
   * fontFamilies contains authored CSS family lists, resolved in the scene's
   * asset scope. Empty lists certify no native source access. Ordinary group
   * children use sceneChildren. This query must not acquire or mutate resources. */
  mediaDependencies?(layer: T): { assetIds?: readonly string[]; layerIds?: readonly string[]; fontFamilies?: readonly string[] }

  /**
   * Returns true if this plugin can render the layer. Plugins are tried in
   * registration order — first match wins.
   */
  supports(layer: Layer): boolean

  /**
   * Renders the layer to the supplied context. The context already has the
   * layer's transform applied (translate + rotate + scale around anchor) —
   * the plugin draws in LAYER-LOCAL coordinates.
   */
  render(ctx: RenderContext, layer: T): void
}

export class LayerRendererRegistry {
  private revision = 0
  private plugins: LayerRendererPlugin[] = []

  register(plugin: LayerRendererPlugin): void {
    this.plugins.push(plugin)
    this.revision++
  }

  find(layer: Layer): LayerRendererPlugin | undefined {
    return this.plugins.find(p => p.supports(layer))
  }

  /** Registration generation; invalidates prepared raster content after hot-swap. */
  getRevision(): number { return this.revision }

  /** Lookup or throw — for code paths that should never miss. */
  findOrThrow(layer: Layer): LayerRendererPlugin {
    const p = this.find(layer)
    if (!p) throw new Error(`LayerRendererRegistry: no renderer for layer "${layer.id}" (type: ${layer.type})`)
    return p
  }

  /** Test-only. */
  clear(): void {
    this.plugins.length = 0
    this.revision++
  }
}
