'use client'
import { useRef } from 'react'
import { createLayerSelection, type LayerSelection } from '@/lib/selection/layerSelection'
import { selectOrderedItem } from '@/lib/selection/orderedSelection'

/** Adapt displayed list order to one atomic external selection update. Keeps
 * only the last requested selection/anchor; external canvas selection or Clear
 * invalidates that anchor. Legacy hosts without a bulk callback retain their
 * additive callback behavior. Owns no source/history or DOM resources.
 */
export function useLayerListSelection(options: {
  order: readonly string[]; selectedId: string | null; selectedIds: ReadonlySet<string>
  onSelect: (id: string, additive: boolean) => void
  onSelectLayers?: (ids: readonly string[], primaryId: string | null) => void
}) {
  const previous = useRef<{ selection: LayerSelection; anchorId: string | null } | null>(null)
  return (id: string, shift = false, additive = false) => {
    if (!options.onSelectLayers) { options.onSelect(id, shift || additive); return }
    const current = createLayerSelection(options.selectedIds, options.selectedId), last = previous.current
    const unchanged = last && current.primaryId === last.selection.primaryId
      && current.selectedIds.size === last.selection.selectedIds.size
      && Array.from(current.selectedIds).every(key => last.selection.selectedIds.has(key))
    const result = selectOrderedItem(current, options.order, id, { range: shift, additive },
      unchanged ? last.anchorId : current.primaryId)
    previous.current = result
    options.onSelectLayers(Array.from(result.selection.selectedIds), result.selection.primaryId)
  }
}
