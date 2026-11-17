import type { Layer } from '@/lib/types'
import { LayerIndex } from '@/lib/scene/LayerIndex'

export interface LegacyLayerRow {
  layer: Layer; realIdx: number; depth: number; hasChildren: boolean; collapsed: boolean
}

/** Legacy Layers-panel adapter. Reuses LayerIndex but retains this panel's
 * reverse-z siblings and strict undefined-parent roots (orphans/empty-string
 * parents are not promoted). Collapse never removes source data. Iterative,
 * guarded traversal handles deep imports without recursion/array-filter scans.
 * Optional isolation re-roots only the borrowed view, retaining full-source
 * realIdx values for reorder callbacks. Valid scenes have unique ids; repeated object identities are visited once. */
export function buildLegacyLayerRows(layers: Layer[], collapsed: ReadonlySet<string>, layerScope?: ReadonlySet<string> | null): LegacyLayerRow[] {
  const sources = layerScope ? layers.filter(layer => layerScope.has(layer.id)) : layers
  const index = new LayerIndex(sources), positions = new Map(layers.map((layer, i) => [layer, i]))
  const roots = layerScope ? sources.filter(layer => !layer.parentId || !index.get(layer.parentId))
    : index.roots.filter(layer => layer.parentId === undefined)
  const pending = roots.map(layer => ({ layer, depth: 0 }))
  const visited = new Set<Layer>(), rows: LegacyLayerRow[] = []
  while (pending.length) {
    const { layer, depth } = pending.pop()!
    if (visited.has(layer)) continue
    visited.add(layer)
    const children = index.childrenOf(layer.id), isCollapsed = collapsed.has(layer.id)
    rows.push({ layer, realIdx: positions.get(layer)!, depth, hasChildren: children.length > 0, collapsed: isCollapsed })
    if (!isCollapsed) for (const child of children) pending.push({ layer: child, depth: depth + 1 })
  }
  return rows
}
