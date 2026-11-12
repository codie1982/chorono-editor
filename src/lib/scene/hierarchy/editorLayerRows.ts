import type { Layer } from '../../types'
import { LayerIndex } from '../LayerIndex'

export interface EditorLayerRow {
  readonly layer: Layer
  readonly depth: number
  readonly hasChildren: boolean
  readonly expanded: boolean
  /** Structural/revealed row outside this panel's own match/scope. */
  readonly contextOnly: boolean
}
export interface EditorLayerRowsOptions {
  readonly collapsedIds?: ReadonlySet<string>
  /** Actual eligible/matching identities, before ancestor closure; null = all. */
  readonly matches?: ReadonlySet<string> | null
  /** Explicit Find action, UI-only override; never adds timeline membership. */
  readonly revealIds?: readonly string[]
  readonly compare?: (a: Layer, b: Layer) => number
}

/** Shared Explorer/Timeline hierarchy projection over LayerIndex. Parents always
 * precede children with correct depth, independent of flat serialization order.
 * Filtering retains ancestor context; collapse affects only rows. Sorting is
 * stable per sibling group, and pinning promotes roots only (never detaches a
 * pinned child). Explicit reveal contributes its paths without rewriting filters,
 * transforms, source membership or metadata. Source references are borrowed.
 * O(n + sibling sort); iterative traversal guards duplicate IDs and cycles.
 * Orphans/cyclic leftovers are displayed as view-only roots, never repaired in
 * source. No second parent graph, global cache, DOM or renderer state is owned.
 */
export function buildEditorLayerRows(layers: readonly Layer[], options: EditorLayerRowsOptions = {}): EditorLayerRow[] {
  const index = new LayerIndex(layers), visible = options.matches ? index.ancestorIds(options.matches) : null
  if (visible) index.ancestorIds(options.revealIds ?? []).forEach(id => visible.add(id))
  const compare = options.compare
  const order = (siblings: readonly Layer[], roots = false) => {
    const sorted = compare ? [...siblings].sort(compare) : [...siblings]
    return roots ? [...sorted.filter(layer => layer.pinned), ...sorted.filter(layer => !layer.pinned)] : sorted
  }
  const roots = layers.filter(layer => !layer.parentId || !index.get(layer.parentId))
  const result: EditorLayerRow[] = [], visited = new Set<string>()
  const walk = (sources: readonly Layer[]) => {
    const pending = sources.map(layer => ({ layer, depth: 0 })).reverse()
    while (pending.length) {
      const { layer, depth } = pending.pop()!
      if (visited.has(layer.id) || visible && !visible.has(layer.id)) continue
      visited.add(layer.id)
      const children = index.childrenOf(layer.id), expanded = !options.collapsedIds?.has(layer.id)
      result.push({ layer, depth, expanded, hasChildren: children.length > 0,
        contextOnly: !!options.matches && !options.matches.has(layer.id) })
      if (expanded) {
        const ordered = order(children)
        for (let i = ordered.length - 1; i >= 0; i--) pending.push({ layer: ordered[i], depth: depth + 1 })
      } else {
        // Collapsed descendants must not reappear as leftover roots below.
        index.subtreeIds([layer.id], false).forEach(id => visited.add(id))
      }
    }
  }
  walk(order(roots, true))
  // Malformed rootless cycles remain inspectable, but do not alter valid order.
  walk(layers.filter(layer => !visited.has(layer.id) && (!visible || visible.has(layer.id))))
  return result
}

/** Shared selection scope: the explicit set wins, primary is a legacy fallback.
 * Resolve hidden/collapsed/filtered descendants from source, never DOM rows. */
export function selectedBranchIds(layers: readonly Layer[], selectedId: string | null, selectedIds?: ReadonlySet<string>): Set<string> {
  return new LayerIndex(layers).subtreeIds(selectedIds?.size ? selectedIds : selectedId ? [selectedId] : [])
}
