import type { Layer } from '../types'
import { LayerIndex } from '../scene/LayerIndex'

export type SelectionRootResult = { ok: false; reason: string; layerId?: string } | {
  ok: true
  readonly roots: readonly Layer[]
  /** Nearest parent first; borrowed records from this same source snapshot. */
  readonly ancestors: ReadonlyMap<string, readonly Layer[]>
}

/** Resolve independent selected roots in authored scene order. A selected
 * descendant inherits its selected ancestor's edit and is never moved twice.
 * Missing selected IDs/parents, cycles and chains beyond 64 ancestors return a
 * diagnostic rather than repairing topology. Locks, visibility and transform
 * editability are deliberately separate consumers' policies: a locked object
 * can still be measured. No inputs mutate; returned records borrow the scene.
 */
export function resolveSelectionRoots(layers: readonly Layer[], ids: Iterable<string>,
  index = new LayerIndex(layers)): SelectionRootResult {
  const selected = new Set(ids), ancestors = new Map<string, readonly Layer[]>()
  for (const id of Array.from(selected)) {
    const layer = index.get(id)
    if (!layer) return { ok: false, reason: 'Selected layer no longer exists.', layerId: id }
    const chain: Layer[] = [], visited = new Set([id])
    let parentId = layer.parentId
    while (parentId) {
      if (visited.has(parentId) || chain.length >= 64) return { ok: false, reason: 'Cyclic or excessively deep parent hierarchy.', layerId: id }
      visited.add(parentId)
      const parent = index.get(parentId)
      if (!parent) return { ok: false, reason: 'Selected layer references a missing parent.', layerId: id }
      chain.push(parent); parentId = parent.parentId
    }
    ancestors.set(id, chain)
  }
  return { ok: true, ancestors, roots: layers.filter(layer => selected.has(layer.id)
    && !ancestors.get(layer.id)!.some(parent => selected.has(parent.id))) }
}
