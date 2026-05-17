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

import type { Layer } from '@/lib/types'
import { SceneTraversal, type SceneNode } from '@/lib/scene/SceneTraversal'

export interface SceneExplorerRow {
  /** Stable id (= layer.id). Used as React key + selection key. */
  id: string
  /** The underlying layer. */
  layer: Layer
  /** Depth in the scene tree (0 = root). Drives left indentation. */
  depth: number
  /** Whether this row has children (i.e. is a parent). */
  hasChildren: boolean
  /** Whether this row's children are currently expanded. */
  expanded: boolean
  /** Whether this row is currently pinned (root-level only — see filtering). */
  pinned: boolean
}

export interface SceneExplorerFilterOptions {
  /** Layer ids whose children are hidden (collapsed groups). */
  collapsedIds: Set<string>
  /** Optional substring filter — case-insensitive match on name + type. */
  textFilter?: string
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
  const { collapsedIds, textFilter } = options
  const query = textFilter?.trim().toLowerCase() ?? ''

  // Build tree once (cached in SceneTraversal).
  const roots = SceneTraversal.buildTree(layers)

  // Pre-compute: any solo'd layer in the scene?
  const anySolo = layers.some((l) => l.solo)

  // Pre-compute matches set (text filter) — we need ancestors of matches.
  let matchIds: Set<string> | null = null
  if (query) {
    matchIds = new Set<string>()
    for (const layer of layers) {
      const nameHit = layer.name.toLowerCase().includes(query)
      const typeHit = layer.type.toLowerCase().includes(query)
      if (nameHit || typeHit) matchIds.add(layer.id)
    }
    // Add ancestors of every match so the path stays visible.
    const ancestorsOf = new Set<string>()
    matchIds.forEach((id) => {
      const ancestors = SceneTraversal.getAncestors(roots, id)
      for (const node of ancestors) ancestorsOf.add(node.layer.id)
    })
    ancestorsOf.forEach((id) => matchIds!.add(id))
  }

  // Pre-compute solo ancestors set (so a solo'd nested layer is reachable).
  let visibleByFilter: Set<string> | null = null
  if (anySolo) {
    visibleByFilter = new Set<string>()
    for (const layer of layers) {
      if (layer.solo) {
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
    // hidden layers are still emitted in the tree so the user can toggle
    // them back — the CELL renders a struck-through / dimmed style.
    const expanded = !collapsedIds.has(layer.id)
    out.push({
      id:          layer.id,
      layer,
      depth:       node.depth,
      hasChildren: node.children.length > 0,
      expanded,
      pinned:      !!layer.pinned,
    })
    if (expanded) {
      for (const child of node.children) emit(child)
    }
  }

  // Root-level ordering: pinned roots float to the top (BL-38 parity).
  const pinnedRoots   = roots.filter((n) => !!n.layer.pinned)
  const unpinnedRoots = roots.filter((n) => !n.layer.pinned)
  for (const root of [...pinnedRoots, ...unpinnedRoots]) emit(root)

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
