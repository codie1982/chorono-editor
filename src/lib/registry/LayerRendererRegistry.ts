// ── LayerRendererRegistry ─────────────────────────────────────────────────────
//
// Separate from LayerRegistry on purpose — renderers may evolve independently
// (e.g. one shape kind might have a 'fast' and a 'high-quality' renderer).
// Each plugin advertises which layers it supports via `supports(layer)`.

import type { Layer } from '@/lib/types'
import type { RenderContext } from '@/lib/render/RenderContext'

export interface LayerRendererPlugin<T extends Layer = Layer> {
  /** Stable id for debugging / hot-swap. */
  id: string

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
  private plugins: LayerRendererPlugin[] = []

  register(plugin: LayerRendererPlugin): void {
    this.plugins.push(plugin)
  }

  find(layer: Layer): LayerRendererPlugin | undefined {
    return this.plugins.find(p => p.supports(layer))
  }

  /** Lookup or throw — for code paths that should never miss. */
  findOrThrow(layer: Layer): LayerRendererPlugin {
    const p = this.find(layer)
    if (!p) throw new Error(`LayerRendererRegistry: no renderer for layer "${layer.id}" (type: ${layer.type})`)
    return p
  }

  /** Test-only. */
  clear(): void {
    this.plugins.length = 0
  }
}
