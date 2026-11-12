/**
 * BL-52 — Scene Explorer tree model
 *
 * Converts the flat Layer[] scene-graph (parent-child via parentId) into a
 * flat list of visible rows that the SceneExplorerPanel renders. Handles:
 *   - Collapsed groups (children of a collapsed parent are NOT emitted)
 *   - Solo subtrees shared with TimelinePanel; hidden layers remain editable
 *   - Pinned-first ordering at the root level (preserves TimelinePanel's
 *     existing BL-38 behaviour: pinned roots float to top)
 *   - Text filter (substring on layer name + type)
 *
 * Uses the common LayerIndex-backed editor projection. Faceted search, solo and
 * visibility eligibility intersect before ancestor context is added. Stable
 * sibling sorting, UI collapse and explicit Find never change source data.
 */

import type { Layer, Timeline } from '@/lib/types'
import { buildEditorLayerRows } from '@/lib/scene/hierarchy/editorLayerRows'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { editorSoloScope } from '@/lib/scene/visibility/editorSoloScope'
import {
  passesFilters, isPassThrough,
  type LayerVisibilityFilters,
} from './visibilityFilters'
import { parseSearchQuery } from './searchQuery'
import { matchesQuery, type SearchPredicates } from './searchEval'

/** BL-57 — Sub-info row kinds emitted under an expanded layer.
 *  All `info` rows are read-only (no drag/select/context, just diagnostics). */
export type InfoKind = 'animation' | 'effect' | 'constraint' | 'mask'

export interface SceneExplorerRow {
  /** Stable id — for layer rows = layer.id; for info rows = `${layerId}::${kind}:${index}`. */
  id: string
  /** Row type: regular layer or a read-only diagnostic sub-row. */
  kind: 'layer' | 'info'
  /** The underlying layer (info rows still carry it so the cell renderer
   *  can read color/state etc.). */
  layer: Layer
  /** Depth in the scene tree (0 = root). Drives left indentation. */
  depth: number
  /** Whether this row has children (i.e. is a parent). */
  hasChildren: boolean
  /** Whether this row's children are currently expanded. */
  expanded: boolean
  /** Whether this row is currently pinned (root-level only — see filtering). */
  pinned: boolean
  /** Ancestor or explicit Find result outside the panel match set. */
  contextOnly?: boolean

  // ── Info-row fields (only set when kind === 'info') ───────────────────────
  /** Which info bucket this row belongs to. */
  infoKind?: InfoKind
  /** Human-readable label (e.g. "Position X", "Glow"). */
  infoLabel?: string
  /** Optional small icon glyph rendered before the label. */
  infoIcon?: string
}

export interface SceneExplorerSort {
  /** Sort accessor — receives a layer, returns a comparable value. */
  accessor: (layer: Layer) => number | string | boolean
  /** Direction. 'asc' = ascending. */
  direction: 'asc' | 'desc'
}

export interface SceneExplorerFilterOptions {
  /** Layer ids whose children are hidden (collapsed groups). */
  collapsedIds: Set<string>
  /** Layer ids whose info-sub-rows (animation/effects/constraints/masks)
   *  should be expanded inline. Independent of `collapsedIds`. */
  subInfoExpandedIds?: Set<string>
  /** Active timeline — needed to enumerate animated property tracks per
   *  layer. When omitted, animation info rows are skipped. */
  timeline?: Timeline | null
  /** Optional substring filter — case-insensitive match on name + type. */
  textFilter?: string
  /** Optional sort — applied per-parent so the parent-child hierarchy is
   *  preserved (parents stay anchored, only their children get sorted). */
  sort?: SceneExplorerSort
  /** BL-55 — visibility filters (type / behaviour). Layers not passing the
   *  filter are hidden from the row list; their parents still show so the
   *  hierarchy stays readable. */
  visibilityFilters?: LayerVisibilityFilters
  /** Predicate: does a layer have any animated property tracks?
   *  (Only consulted when visibilityFilters.onlyAnimated is on.) */
  isAnimated?: (layer: Layer) => boolean
  /** Predicate: does a layer have effects or masks?
   *  (Only consulted when visibilityFilters.onlyWithEffects is on.) */
  hasEffects?: (layer: Layer) => boolean
  /** Explicit Find selected paths; preserves all filters and source flags. */
  revealIds?: readonly string[]
}

/**
 * Build the flat list of visible rows for the explorer.
 *
 * Visibility rules (in order):
 *   1. Visual solo parents include their full subtree and ancestor context;
 *      audio solo remains independent. Hidden/inactive descendants stay editable.
 *   2. Explicit visibility/search filters retain ancestors of their matches.
 *      Hidden flags alone do not remove a row, allowing users to show it again.
 *   3. Children of a collapsed parent are skipped entirely.
 *   4. Text filter — when set, only layers whose name or type contains the
 *      query (case-insensitive) are emitted; ancestors are kept so the
 *      hierarchy doesn't break.
 */
export function buildSceneExplorerRows(
  layers: Layer[],
  options: SceneExplorerFilterOptions,
): SceneExplorerRow[] {
  const { collapsedIds, subInfoExpandedIds, timeline, textFilter, sort,
    visibilityFilters, isAnimated, hasEffects, revealIds } = options
  const query = parseSearchQuery(textFilter ?? ''), preds: SearchPredicates = { isAnimated, hasEffects }
  const solo = editorSoloScope(layers)
  const matches = new Set(layers.filter(layer => (!solo || solo.has(layer.id)) &&
    (query.isEmpty || matchesQuery(layer, query, preds)) &&
    (!visibilityFilters || isPassThrough(visibilityFilters) || passesFilters(layer, visibilityFilters, isAnimated ?? (() => false), hasEffects ?? (() => false))))
    .map(layer => layer.id))
  const compare = sort ? (a: Layer, b: Layer) => {
    const va = sort.accessor(a), vb = sort.accessor(b), result = va < vb ? -1 : va > vb ? 1 : 0
    return sort.direction === 'desc' ? -result : result
  } : undefined
  const out: SceneExplorerRow[] = []
  for (const row of buildEditorLayerRows(layers, { collapsedIds, matches, revealIds, compare })) {
    out.push({ ...row, id: row.layer.id, kind: 'layer', pinned: !!row.layer.pinned && row.depth === 0 })
    if (subInfoExpandedIds?.has(row.layer.id)) out.push(...buildLayerInfoRows(row.layer, row.depth + 1, timeline))
  }
  return out
}

// ── BL-57 C-lite — sub-info row builders ─────────────────────────────────────

/** What information categories does this layer have? Drives both the
 *  collapsed-state badge ("◆3 🧩2") AND the rows emitted when expanded. */
export interface LayerInfoCounts {
  tracks:      number  // animated property tracks on the active timeline
  effects:     number  // entries in effectsChain + plain effects
  constraints: number  // followPath / motionPath (max 2)
  masks:       number  // entries in layer.masks
  total:       number  // sum of the above — non-zero ⇒ show the badge
}

export function getLayerInfoCounts(layer: Layer, timeline: Timeline | null | undefined): LayerInfoCounts {
  const prefix = `layers.${layer.id}.`
  const tracks = timeline ? timeline.tracks.filter((t) => t.target.startsWith(prefix) && t.keyframes.length > 0).length : 0
  const fxChain = layer.effectsChain?.length ?? 0
  // `layer.effects` is a record of CSS-filter-style numbers; non-zero ⇒ active.
  const flatFx = layer.effects
    ? Object.values(layer.effects).filter((v) => typeof v === 'number' && v !== 0).length
    : 0
  const effects = fxChain + flatFx
  const constraints = (layer.followPath ? 1 : 0) + (layer.motionPath ? 1 : 0)
  const masks = layer.masks?.length ?? 0
  return {
    tracks,
    effects,
    constraints,
    masks,
    total: tracks + effects + constraints + masks,
  }
}

/** Build the read-only sub-rows that appear beneath an expanded layer. */
export function buildLayerInfoRows(
  layer:    Layer,
  depth:    number,
  timeline: Timeline | null | undefined,
): SceneExplorerRow[] {
  const out: SceneExplorerRow[] = []
  const make = (
    kind:  InfoKind,
    index: number,
    icon:  string,
    label: string,
  ): SceneExplorerRow => ({
    id:          `${layer.id}::${kind}:${index}`,
    kind:        'info',
    layer,
    depth,
    hasChildren: false,
    expanded:    false,
    pinned:      false,
    infoKind:    kind,
    infoLabel:   label,
    infoIcon:    icon,
  })

  // Animated tracks — pull property labels from the track target path
  // (e.g. "layers.foo.transform.x" → "transform.x").
  if (timeline) {
    const prefix = `layers.${layer.id}.`
    const tracks = timeline.tracks.filter((t) => t.target.startsWith(prefix) && t.keyframes.length > 0)
    tracks.forEach((t, i) => {
      const prop = t.target.slice(prefix.length)
      out.push(make('animation', i, '◆', prop))
    })
  }

  // effectsChain plugin effects
  layer.effectsChain?.forEach((fx, i) => {
    const label = ((fx as { name?: string }).name) ?? (fx as { type?: string }).type ?? 'Effect'
    out.push(make('effect', i, '🧩', String(label)))
  })

  // Flat effects (CSS-filter style) — only non-zero
  if (layer.effects) {
    let i = 0
    for (const [key, value] of Object.entries(layer.effects)) {
      if (typeof value === 'number' && value !== 0) {
        out.push(make('effect', 100 + i, '🧩', `${key}: ${value}`))
        i++
      }
    }
  }

  // Constraints — Follow Path / Motion Path
  if (layer.followPath) {
    const targetId = layer.followPath.pathLayerId
    out.push(make('constraint', 0, '⛓', `Follow Path → ${targetId}`))
  }
  if (layer.motionPath) {
    out.push(make('constraint', 1, '⛓', 'Motion Path'))
  }

  // Masks
  layer.masks?.forEach((m, i) => {
    const id = (m as { maskLayerId?: string }).maskLayerId ?? `mask${i}`
    out.push(make('mask', i, '🌑', `Mask → ${id}`))
  })

  return out
}

/**
 * Helper: how many descendants does this layer have (incl. nested)?
 * Used by drag-drop to forbid dropping a layer onto its own subtree.
 * Preserves the legacy pre-order set for valid trees; the shared iterative
 * query additionally terminates on malformed cycles and ignores missing roots.
 */
export function collectDescendants(layers: Layer[], rootId: string): Set<string> {
  return new LayerIndex(layers).subtreeIds([rootId], false)
}
