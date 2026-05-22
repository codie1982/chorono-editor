// ── RenderContext ─────────────────────────────────────────────────────────────
//
// The single argument passed to every LayerRendererPlugin. Carries the canvas
// context, all override maps, asset references, registries, and helpers — so
// plugins never reach for module-level singletons.
//
// Construct one per renderScene() call and discard. Cheap object.

import type { ChronoScene, Layer } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'           // legacy import — alias to current renderer
import type { OverrideMap } from '@/lib/evaluator'
import type { LayerRegistry } from '@/lib/registry/LayerRegistry'
import type { LayerRendererRegistry } from '@/lib/registry/LayerRendererRegistry'

export type ParamValueMap = Map<string, string | number | boolean>

/**
 * BL-66 — Render mode separates editor chrome (selection outlines, path
 * anchors, grid) from real animation content. Plugins read this so e.g. the
 * path renderer can skip drawing vertex handles during preview / export.
 *   'editor'  → full chrome (default, normal editing)
 *   'preview' → content only (playback + export pipeline → clean frames)
 */
export type RenderMode = 'editor' | 'preview'

export interface RenderContext {
  /** The 2D canvas being drawn to (already transformed for the current layer). */
  canvas: CanvasRenderingContext2D

  /** Scene currently being rendered — read-only for plugins. */
  scene: ChronoScene

  /** Override map from evaluateTimelines() (keyframe values at current time). */
  overrides: OverrideMap

  /** Runtime parameter values (from ParameterStore in Sprint 9). */
  paramValues: ParamValueMap

  /** Loaded image / video DOM elements keyed by Asset.id. */
  assets: AssetElementMap

  /** Active time on the global timeline in ms. */
  timeMs: number

  /** Is this layer the currently selected one (drives selection outlines). */
  isSelected(layerId: string): boolean

  /** Average display scale (canvas zoom × layer scale). Used to scale UI overlays. */
  displayScale: number

  /** BL-66 — 'editor' (full chrome) or 'preview' (content only). Default 'editor'. */
  renderMode: RenderMode

  // ── Registries ──────────────────────────────────────────────────────────────
  registry:        LayerRegistry
  rendererRegistry: LayerRendererRegistry

  /**
   * Recursive render entry — used by GroupRenderer / RepeaterRenderer to
   * render their children with the current transform stack. Implemented by
   * CanvasRenderer.
   */
  renderLayerById(layerId: string): void
}
