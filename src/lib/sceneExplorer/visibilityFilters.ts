/**
 * BL-55 — Layer visibility filter model
 *
 * 3ds Max Scene Explorer-style "show / hide by type" filters. These are
 * EDITOR-only preferences — they affect what the explorer panel and (when
 * Renderable type filters are on) the canvas render show, but do not
 * mutate the underlying layer data. Stored on the panel state and
 * persisted via localStorage so the user's filtered view survives reloads.
 */

import type { Layer, LayerType } from '@/lib/types'

/** Layer "kind" buckets the user can toggle individually. Mirrors the
 *  LayerRegistry categories but coarser (one toggle per visual category
 *  rather than per definition). */
export type LayerTypeFilterKey =
  | 'shape'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'path'
  | 'group'
  | 'repeater'

export interface LayerVisibilityFilters {
  /** Type buckets — `true` means SHOW layers of this type. */
  types: Record<LayerTypeFilterKey, boolean>
  /** Show only layers with at least one animated property track. */
  onlyAnimated: boolean
  /** Show only layers with one or more effects (plugin effects or masks). */
  onlyWithEffects: boolean
}

export const DEFAULT_VISIBILITY_FILTERS: LayerVisibilityFilters = {
  types: {
    shape:    true,
    text:     true,
    image:    true,
    video:    true,
    audio:    true,
    path:     true,
    group:    true,
    repeater: true,
  },
  onlyAnimated:    false,
  onlyWithEffects: false,
}

/** Map raw Layer.type → coarse filter bucket. `pathStroke` rolls into
 *  `path` since users think of both as path tools. */
function bucketFor(layer: Layer): LayerTypeFilterKey {
  const t: LayerType = layer.type
  if (t === 'pathStroke') return 'path'
  return t as LayerTypeFilterKey
}

/** Quick check: would this layer survive the active filters?
 *  Does NOT consider hidden/solo/frozen — those live elsewhere. */
export function passesFilters(
  layer: Layer,
  filters: LayerVisibilityFilters,
  isAnimated: (layer: Layer) => boolean,
  hasEffects: (layer: Layer) => boolean,
): boolean {
  if (!filters.types[bucketFor(layer)]) return false
  if (filters.onlyAnimated    && !isAnimated(layer))  return false
  if (filters.onlyWithEffects && !hasEffects(layer))  return false
  return true
}

/** Returns true when all type filters are on AND no animation/effect
 *  predicate is active — equivalent to "no filter". Skip the predicate
 *  evaluation entirely in the model when this is true. */
export function isPassThrough(filters: LayerVisibilityFilters): boolean {
  if (filters.onlyAnimated || filters.onlyWithEffects) return false
  const t = filters.types
  return t.shape && t.text && t.image && t.video && t.audio && t.path && t.group && t.repeater
}
