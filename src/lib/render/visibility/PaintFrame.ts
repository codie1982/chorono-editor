import type { Layer, PluginEffect } from '@/lib/types'
import type { LayerRelations } from '@/lib/scene/LayerIndex'
import type { LayerRendererPlugin } from '@/lib/registry/LayerRendererRegistry'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { paintOutsideArea } from './paintOutsideArea'

export interface PaintStatistics {
  total: number
  processed: number
  culled: number
  unvisited: number
  visits: number
  culledVisits: number
  lodRepresented?: number
  lodGroups?: number
  lodBuilds?: number
  lodRasterizedLayers?: number
  completed: boolean
}

/** Whether this layer can be reasoned about without an offscreen/temporal pass.
 * Unknown effects/blends opt out, even when they appear visually harmless. */
export function directPaint(layer: Layer): boolean {
  return (!layer.blendMode || layer.blendMode === 'source-over')
    && !(layer.effectsChain?.some(effect => effect.enabled)) && !layer.masks?.length
    && !(layer.motionBlur?.enabled && !layer.motionBlur.baked)
    && (layer.effects?.blur ?? 0) === 0
}

/** One invocation's paint decisions and unique-layer counters. Never retained
 * across frames; references are borrowed, sets are bounded by the layer count.
 * Only numeric snapshots escape. A processed layer means plugin dispatch (groups
 * included), NOT a GPU draw call or proof that a nontransparent pixel was drawn.
 * Referenced sources remain in the full scene/index; only paint is skipped.
 * Permitted tests use the actual Canvas matrix. The caller disables culling
 * for repeater/custom callbacks and offscreen passes with uncertified context.
 */
export class PaintFrame {
  private represented = new Set<string>()
  private lodGroups = 0
  private lodBuilds = 0
  private lodRasterizedLayers = 0
  private processed = new Set<string>()
  private culled = new Set<string>()
  private visits = 0
  private culledVisits = 0
  private alphaMemo = new Map<string, boolean>()
  private protected = new Set<string>()

  constructor(private total: number, private index: LayerRelations,
    private find: (layer: Layer) => LayerRendererPlugin | undefined,
    private viewport: PathBounds | null, selected: Iterable<string>,
    private effectKeepsEmpty: (effect: PluginEffect) => boolean = () => false) {
    for (const id of Array.from(selected)) {
      let item = index.get(id)
      const seen = new Set<string>()
      while (item && !seen.has(item.id)) {
        seen.add(item.id); this.protected.add(item.id)
        item = item.parentId ? index.get(item.parentId) : undefined
      }
    }
  }

  /** Records each ordinary/copy traversal, including rejected visits. */
  visit(): void { this.visits++ }

  /** Records dispatch once per persisted id. Mask-source dispatches count too. */
  dispatch(layer: Layer): void { this.processed.add(layer.id) }

  /** Marks unique descendants replaced by a main-frame proxy. Cold cache builds
   * have a separate rasterized-work counter; they are not viewport dispatches. */
  represent(ids: readonly string[], created: boolean, drawables: number): void {
    ids.forEach(id => this.represented.add(id))
    this.lodGroups++
    if (created) { this.lodBuilds++; this.lodRasterizedLayers += drawables }
  }

  /** Tests after local transform setup. Actual native matrix includes parents,
   * caller/export scale and repeater copies. Singular/nonfinite matrices and
   * unknown bounds preserve drawing. Two backing pixels guard antialias edges. */
  reject(layer: Layer, ctx: CanvasRenderingContext2D, allowed: boolean): boolean {
    if (!allowed || !this.viewport || this.protected.has(layer.id)) return false
    const paint = this.find(layer)?.paint
    if (!paint) return false
    let reject = ctx.globalAlpha === 0 && this.alphaSafe(layer, new Set())
    if (!reject && !directPaint(layer)) return false
    if (!reject && paint.localBounds && typeof ctx.getTransform === 'function') {
      const bounds = paint.localBounds(layer, ctx), m = ctx.getTransform()
      reject = paintOutsideArea(bounds, m, this.viewport)
    }
    if (!reject) return false
    this.culledVisits++
    this.markCulled(layer)
    return true
  }

  /** A zero-alpha group is safe only if every reachable child honors alpha and
   * ordinary composition. Cycles, custom plugins and destination operations fail
   * closed. Memoized once per frame; no repeated subtree scans per sibling. */
  private alphaSafe(layer: Layer, active: Set<string>): boolean {
    if (this.alphaMemo.has(layer.id)) return this.alphaMemo.get(layer.id)!
    if (active.has(layer.id) || this.protected.has(layer.id)) return false
    const paint = this.find(layer)?.paint
    // Offscreen masks only remove host alpha. Certified native effect chains
    // preserve empty input; unknown plugins and motion trails remain live.
    let safe = !!paint?.alphaSafe && (!layer.blendMode || layer.blendMode === 'source-over')
      && !(layer.motionBlur?.enabled && !layer.motionBlur.baked)
      && (layer.effectsChain ?? []).every(effect => !effect.enabled || this.effectKeepsEmpty(effect))
    if (safe && paint?.sceneChildren) {
      active.add(layer.id)
      safe = this.index.childrenOf(layer.id).every(child => this.alphaSafe(child, active))
      active.delete(layer.id)
    }
    this.alphaMemo.set(layer.id, safe)
    return safe
  }

  /** Includes skipped ordinary descendants, but never follows source references. */
  private markCulled(layer: Layer): void {
    if (this.culled.has(layer.id)) return
    this.culled.add(layer.id)
    if (this.find(layer)?.paint?.sceneChildren) {
      for (const child of this.index.childrenOf(layer.id)) this.markCulled(child)
    }
  }

  /** Unique dispatched ids win over rejected copies; unvisited includes time,
   * hidden, solo, audio and unused guides. Failed renders retain partial counts. */
  snapshot(completed: boolean): PaintStatistics {
    let culled = 0, represented = 0
    for (const id of Array.from(this.culled)) if (!this.processed.has(id) && !this.represented.has(id)) culled++
    for (const id of Array.from(this.represented)) if (!this.processed.has(id)) represented++
    return { total: this.total, processed: this.processed.size, culled,
      unvisited: Math.max(0, this.total - this.processed.size - culled - represented),
      lodRepresented: represented, lodGroups: this.lodGroups, lodBuilds: this.lodBuilds, lodRasterizedLayers: this.lodRasterizedLayers,
      visits: this.visits, culledVisits: this.culledVisits, completed }
  }
}
