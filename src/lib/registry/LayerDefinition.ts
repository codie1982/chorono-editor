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
  | 'Spline Objects'
  | 'Mesh & Surface'
  | 'Text'
  | 'Media'
  | '3D Objects'
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

  /** Internal property subtrees owned by an isolated feature editor. The outer
   * 2D Timeline must not create/edit these tracks. Existing source tracks stay
   * serializable/evaluable for compatibility. Omission preserves legacy kinds.
   * Paths are layer-relative and use the shared parent/child overlap rule. */
  readonly timelineExcludedPaths?: readonly string[]

  /** Exact leaf channels permitted in this feature's isolated Timeline context.
   * Must lie under timelineExcludedPaths; declaring a parent subtree does not
   * grant structural/asset edits. Static inspector schemas may remain non-keyable
   * in the main scene. Omission means no internal Timeline authoring capability.
   * This metadata alone creates neither a clip nor a detail Timeline UI.
   */
  readonly contentTimelinePaths?: readonly string[]
  /** Dynamic exact leaves bound to an existing content inventory; no wildcard authority. */
  getContentTimelinePaths?(layer: T): readonly string[]
  /** Optional stable-ID virtual value resolver for feature-owned channels.
   * Authoring reads only; the feature's frame adapter resolves render writes. */
  readContentTimelineValue?(layer: T, path: string): unknown

  /** Default instance constructor — called by `page.tsx addLayer`. */
  createDefault(): T

  /**
   * Returns the property groups for the inspector panel.
   * Sections evaluate `showWhen` against the current layer instance.
   */
  getPropertyGroups(layer: T): PropertyGroup[]

  /**
   * Optional immutable property edit strategy for derived-data layers.
   *
   * SchemaPanel calls this instead of the generic dot-path writer when a field
   * changes. Implementations may regenerate validated geometry or related
   * source data and must return one complete layer snapshot for one undo step.
   * Throwing rejects the edit; implementations must not mutate `layer` or keep
   * browser/GPU resources. Ordinary layers omit the hook.
   */
  applyPropertyChange?(layer: T, path: string, value: unknown): T

  /** Opt-in: the paths, types and constraints returned by getPropertyGroups
   * are independent of the layer and stable for this definition's lifetime.
   * showWhen predicates may still inspect the current layer. Render consumers
   * may compile a readonly schema index once; inspector arrays stay caller-owned.
   * Omit for dynamic schemas. Replace the definition/provider to change a
   * certified schema; mutating external constraints breaks this contract. */
  readonly propertyGroupsAreStatic?: boolean

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
