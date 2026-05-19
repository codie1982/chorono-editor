// ── LayerDefinition ───────────────────────────────────────────────────────────
//
// A LayerDefinition is the SINGLE place where a layer kind is described:
//   - how to create a default instance
//   - what properties it exposes (schema → PropertiesPanel)
//   - how to render it (delegates to a LayerRendererPlugin)
//   - optionally how to convert it to a generic path (for trim / motion path)
//
// One file per definition lives in registry/definitions/. The registry is
// populated at bootstrap (registry/bootstrap.ts) so registration order is
// deterministic.

import type { Layer } from '@/lib/types'
import type { PropertyGroup } from './PropertySchema'
import type { PathDefinition } from '@/lib/geometry'

/** Category used by the Add Layer menu in LayerPanel. */
export type LayerCategory =
  | 'Basic Shapes'
  | 'Path & Vector'
  | 'Text'
  | 'Media'
  | 'Effects'
  | 'Masks'
  | 'Groups'
  | 'Interaction'
  | 'Particles'

export interface LayerDefinition<T extends Layer = Layer> {
  /** Stable identifier matching addLayer(kind) and ADD_LAYER_GROUPS entries. */
  kind: string

  /** Human label shown in menus. */
  label: string

  /** Sprite icon name (key in ICON_MAP). */
  iconKey: string

  category: LayerCategory

  /** Default instance constructor — called by `page.tsx addLayer`. */
  createDefault(): T

  /**
   * Returns the property groups for the inspector panel.
   * Sections evaluate `showWhen` against the current layer instance.
   */
  getPropertyGroups(layer: T): PropertyGroup[]

  /**
   * Optional: converts the layer to a unified PathDefinition. Used by:
   *   - Trim Path renderer (so trim works on every parametric shape)
   *   - PathSampler / PathMotionResolver (motion path along this layer)
   *   - SVG export (Sprint 10)
   *
   * Layers that have no meaningful path (text, image, audio) omit this.
   */
  toPath?(layer: T): PathDefinition
}
