/**
 * BL-52 — Scene Explorer tree model
 *
 * Converts the flat Layer[] scene-graph (parent-child via parentId) into a
 * flat list of visible rows that the SceneExplorerPanel renders. Handles:
 *   - Collapsed groups (children of a collapsed parent are NOT emitted)
 *   - Solo / hidden visibility filters (scene-graph level, same rules as
 *     CanvasRenderer + TimelinePanel)
 *   - Pinned-first ordering at the root level (preserves TimelinePanel's
 *     existing BL-38 behaviour: pinned roots float to top)
 *   - Text filter (substring on layer name + type)
 *
 * Reuses {@link SceneTraversal.buildTree} so the parent-child tree itself is
 * cached across calls; only the flattening pass runs on every render.
 */

import type { Layer, Timeline } from '@/lib/types'
import { SceneTraversal, type SceneNode } from '@/lib/scene/SceneTraversal'
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
}

/**
 * Build the flat list of visible rows for the explorer.
 *
 * Visibility rules (in order):
 *   1. If ANY layer has solo === true, only solo'd layers (and their
 *      ancestors required to reach them) are emitted.
 *   2. Layers with hidden === true are skipped (but their ancestor groups
 *      are still emitted so the hierarchy stays readable).
 *   3. Children of a collapsed parent are skipped entirely.
 *   4. Text filter — when set, only layers whose name or type contains the
 *      query (case-insensitive) are emitted; ancestors are kept so the
 *      hierarchy doesn't break.
 */
export function buildSceneExplorerRows(
  layers: Layer[],
  options: SceneExplorerFilterOptions,
): SceneExplorerRow[] {
  const {
    collapsedIds, subInfoExpandedIds, timeline, textFilter, sort,
    visibilityFilters, isAnimated, hasEffects,
  } = options
  const subExpanded = subInfoExpandedIds ?? new Set<string>()

  // BL-57 — faceted query. Bare-substring queries still work because the
  // parser emits a bare term (no facet) which the evaluator OR-matches
  // against name + type.
  const searchQuery = parseSearchQuery(textFilter ?? '')
  const searchPreds: SearchPredicates = { isAnimated, hasEffects }

  // Visibility-filter ancestor resolution: when a filter is active, only
  // layers passing it are emitted — PLUS the ancestors of those layers
  // (so a matching grandchild stays reachable). Mirrors the text-filter
  // pattern so the hierarchy never breaks unexpectedly.
  let visFilterSet: Set<string> | null = null
  if (visibilityFilters && !isPassThrough(visibilityFilters)) {
    const isAnim = isAnimated ?? (() => false)
    const hasFx  = hasEffects ?? (() => false)
    visFilterSet = new Set<string>()
    for (const layer of layers) {
      if (passesFilters(layer, visibilityFilters, isAnim, hasFx)) {
        visFilterSet.add(layer.id)
      }
    }
    // Add ancestors so collapsed-but-matching descendants stay reachable.
    const initialMatches = Array.from(visFilterSet)
    for (const id of initialMatches) {
      const ancestors = SceneTraversal.getAncestors(SceneTraversal.buildTree(layers), id)
      for (const node of ancestors) visFilterSet.add(node.layer.id)
    }
  }

  // Stable comparator built from the sort accessor; falls back to original
  // index so layers with equal sort keys keep their authored z-order.
  const compare = sort
    ? (a: SceneNode, b: SceneNode): number => {
        const va = sort.accessor(a.layer)
        const vb = sort.accessor(b.layer)
        let r = 0
        if (va < vb) r = -1
        else if (va > vb) r = 1
        return sort.direction === 'desc' ? -r : r
      }
    : null

  // Build tree once (cached in SceneTraversal).
  const roots = SceneTraversal.buildTree(layers)

  // Pre-compute: any solo'd layer in the scene?
  const anySolo = layers.some((l) => l.type !== 'audio' && l.solo)
  const anyAudioSolo = layers.some(l => l.type === 'audio' && l.solo)

  // Pre-compute matches set (faceted query) — we need ancestors of matches.
  let matchIds: Set<string> | null = null
  if (!searchQuery.isEmpty) {
    matchIds = new Set<string>()
    for (const layer of layers) {
      if (matchesQuery(layer, searchQuery, searchPreds)) matchIds.add(layer.id)
    }
    // Add ancestors of every match so the path stays visible. (A nested
    // matching layer needs its parents drawn so the user can read the
    // hierarchy — they appear unstyled vs. the matched row.)
    const ancestorsOf = new Set<string>()
    matchIds.forEach((id) => {
      const ancestors = SceneTraversal.getAncestors(roots, id)
      for (const node of ancestors) ancestorsOf.add(node.layer.id)
    })
    ancestorsOf.forEach((id) => matchIds!.add(id))
  }

  // Pre-compute solo ancestors set (so a solo'd nested layer is reachable).
  let visibleByFilter: Set<string> | null = null
  if (anySolo || anyAudioSolo) {
    visibleByFilter = new Set<string>()
    for (const layer of layers) {
      if ((layer.type === 'audio' ? !anyAudioSolo : !anySolo) || layer.solo) {
        visibleByFilter.add(layer.id)
        const ancestors = SceneTraversal.getAncestors(roots, layer.id)
        for (const node of ancestors) visibleByFilter.add(node.layer.id)
      }
    }
  }

  const out: SceneExplorerRow[] = []
  const emit = (node: SceneNode) => {
    const { layer } = node
    if (visibleByFilter && !visibleByFilter.has(layer.id)) return
    if (matchIds && !matchIds.has(layer.id)) return
    if (visFilterSet && !visFilterSet.has(layer.id)) return
    // hidden layers are still emitted in the tree so the user can toggle
    // them back — the CELL renders a struck-through / dimmed style.
    const expanded = !collapsedIds.has(layer.id)
    out.push({
      id:          layer.id,
      kind:        'layer',
      layer,
      depth:       node.depth,
      hasChildren: node.children.length > 0,
      expanded,
      pinned:      !!layer.pinned,
    })

    // BL-57 C-lite — emit read-only sub-info rows below the layer when
    // the user has expanded its subtree. Independent of group expand state
    // so the user can have the children collapsed but still inspect what's
    // animating / what effects are applied.
    if (subExpanded.has(layer.id)) {
      const infoRows = buildLayerInfoRows(layer, node.depth + 1, timeline)
      for (const r of infoRows) out.push(r)
    }

    if (expanded) {
      const children = compare
        ? [...node.children].sort(compare)
        : node.children
      for (const child of children) emit(child)
    }
  }

  // Root-level ordering: pinned roots float to the top (BL-38 parity).
  // Within each (pinned / unpinned) bucket, apply the active sort so the
  // parent-child hierarchy is preserved (parent stays at top of its
  // subtree, children sort within their parent).
  const pinnedRoots   = roots.filter((n) => !!n.layer.pinned)
  const unpinnedRoots = roots.filter((n) => !n.layer.pinned)
  const orderedRoots = compare
    ? [...pinnedRoots].sort(compare).concat([...unpinnedRoots].sort(compare))
    : [...pinnedRoots, ...unpinnedRoots]
  for (const root of orderedRoots) emit(root)

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
 */
export function collectDescendants(layers: Layer[], rootId: string): Set<string> {
  const roots = SceneTraversal.buildTree(layers)
  const node = SceneTraversal.findNode(roots, rootId)
  const out = new Set<string>()
  if (!node) return out
  SceneTraversal.walk([node], (n) => {
    if (n.layer.id !== rootId) out.add(n.layer.id)
  })
  return out
}
