/** Immutable editor selection snapshot. Callers borrow selectedIds read-only;
 * every operation below owns a new Set when membership changes. Primary is
 * either a member or null, with insertion order providing a stable fallback. */
export interface LayerSelection {
  readonly selectedIds: ReadonlySet<string>
  readonly primaryId: string | null
}

/** Build a caller-owned selection, deduplicating IDs without sorting them.
 * The preferred primary is retained only when selected; empty input clears it.
 * Input iterables and their Sets are never mutated or retained. */
export function createLayerSelection(ids: Iterable<string>, preferredPrimary: string | null = null): LayerSelection {
  const selectedIds = new Set(ids)
  const primaryId = preferredPrimary != null && selectedIds.has(preferredPrimary)
    ? preferredPrimary : selectedIds.values().next().value ?? null
  return { selectedIds, primaryId }
}

/** Toggle one ID. Adding makes it primary; removing preserves the current
 * primary if possible, otherwise chooses the first remaining selected ID. */
export function toggleLayerSelection(selection: LayerSelection, id: string): LayerSelection {
  const ids = new Set(selection.selectedIds)
  if (!ids.delete(id)) {
    ids.add(id)
    return createLayerSelection(ids, id)
  }
  return createLayerSelection(ids, selection.primaryId)
}

/** Apply a geometry/query selection atomically. Replacement chooses its first
 * hit; add/subtract preserve the existing primary when it remains selected.
 * No input Set is mutated, including when result and input memberships match. */
export function combineLayerSelection(
  selection: LayerSelection, incoming: Iterable<string>, mode: 'replace' | 'add' | 'subtract',
): LayerSelection {
  if (mode === 'replace') return createLayerSelection(incoming)
  const ids = new Set(selection.selectedIds)
  for (const id of Array.from(incoming)) {
    if (mode === 'add') ids.add(id)
    else ids.delete(id)
  }
  return createLayerSelection(ids, selection.primaryId)
}

/** Drop IDs removed by delete, reset, import or undo. This is UI state only;
 * it never changes the scene or restores previously discarded selection.
 * Returns the original snapshot when already valid to avoid extra renders. */
export function retainLayerSelection(selection: LayerSelection, existingIds: ReadonlySet<string>): LayerSelection {
  const ids = Array.from(selection.selectedIds).filter(id => existingIds.has(id))
  if (ids.length === selection.selectedIds.size
      && (selection.primaryId === null ? ids.length === 0 : selection.selectedIds.has(selection.primaryId))) return selection
  return createLayerSelection(ids, selection.primaryId)
}
