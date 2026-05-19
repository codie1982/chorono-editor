// ── LayerRegistry ─────────────────────────────────────────────────────────────
//
// Central registry of LayerDefinitions. Each layer kind registers exactly
// once at bootstrap. The registry is THE single source of truth for:
//   - addLayer(kind) factory lookup (page.tsx)
//   - Add Layer menu (LayerPanel)
//   - PropertiesPanel section generation
//
// Singleton instance lives in registry/index.ts. Tests can construct
// throw-away instances via `new LayerRegistry()`.

import type { Layer } from '@/lib/types'
import type { LayerDefinition, LayerCategory } from './LayerDefinition'

export class LayerRegistry {
  private byKind = new Map<string, LayerDefinition>()
  // Insertion-ordered list — UI uses this for stable menu ordering.
  private order: string[] = []

  /** Register a definition. Throws if `kind` is already registered. */
  register(def: LayerDefinition): void {
    if (this.byKind.has(def.kind)) {
      throw new Error(`LayerRegistry: kind "${def.kind}" already registered`)
    }
    this.byKind.set(def.kind, def)
    this.order.push(def.kind)
  }

  /** Lookup by kind. Returns undefined if missing — caller decides how to handle. */
  get(kind: string): LayerDefinition | undefined {
    return this.byKind.get(kind)
  }

  /** Lookup or throw — for code paths that should never miss. */
  getOrThrow(kind: string): LayerDefinition {
    const def = this.byKind.get(kind)
    if (!def) throw new Error(`LayerRegistry: no definition for kind "${kind}"`)
    return def
  }

  /** All registered definitions in registration order. */
  getAll(): LayerDefinition[] {
    return this.order.map(k => this.byKind.get(k)!).filter(Boolean)
  }

  /** All definitions in a given category, in registration order. */
  getByCategory(category: LayerCategory): LayerDefinition[] {
    return this.getAll().filter(d => d.category === category)
  }

  /**
   * Resolves the definition for a given Layer instance.
   * Uses `layer.shapeKind` for shape layers, otherwise falls back to layer.type
   * (text → 'text', image → 'image', path → 'bezierPath', pathStroke → 'pathStroke').
   *
   * Returns undefined when the layer kind is not registered — caller may
   * fall back to legacy code paths during migration.
   */
  findForLayer(layer: Layer): LayerDefinition | undefined {
    // Shape layers use shapeKind first, then legacy 'shape' field
    if (layer.type === 'shape') {
      const k = (layer as any).shapeKind ?? layer.shape
      if (k) return this.byKind.get(k)
    }
    // Other layer types map directly to their kind
    if (layer.type === 'path')       return this.byKind.get('bezierPath')
    if (layer.type === 'pathStroke') return this.byKind.get('pathStroke')
    if (layer.type === 'text')       return this.byKind.get('text')
    if (layer.type === 'image')      return this.byKind.get('image')
    if (layer.type === 'video')      return this.byKind.get('video')
    if (layer.type === 'audio')            return this.byKind.get('audio')
    if (layer.type === 'particleEmitter')  return this.byKind.get('particleEmitter')
    return undefined
  }

  /** Clear all registrations — used by tests only. */
  clear(): void {
    this.byKind.clear()
    this.order.length = 0
  }
}
