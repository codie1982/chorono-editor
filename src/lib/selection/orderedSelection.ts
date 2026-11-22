import { createLayerSelection, toggleLayerSelection, type LayerSelection } from './layerSelection'

export interface OrderedSelectionResult { selection: LayerSelection; anchorId: string | null }

/** Select list rows in displayed order, including virtualized rows but excluding
 * collapsed/filtered rows supplied by the caller. Shift replaces selection with
 * an inclusive range from a stable anchor; Ctrl/Cmd toggles one item; both add a
 * range. Plain click starts a new anchor. Missing anchors fall back to the visible
 * primary, then the clicked row. Inputs are borrowed, never mutated; an unknown
 * clicked ID is a no-op. O(n) in list size, with caller-owned output Sets.
 */
export function selectOrderedItem(current: LayerSelection, order: readonly string[], id: string,
  modifiers: { range: boolean; additive: boolean }, anchorId: string | null): OrderedSelectionResult {
  const end = order.indexOf(id)
  if (end < 0) return { selection: current, anchorId }
  if (!modifiers.range) return {
    selection: modifiers.additive ? toggleLayerSelection(current, id) : createLayerSelection([id], id), anchorId: id,
  }
  const anchor = anchorId && order.includes(anchorId) ? anchorId
    : current.primaryId && order.includes(current.primaryId) ? current.primaryId : id
  const start = order.indexOf(anchor), range = order.slice(Math.min(start, end), Math.max(start, end) + 1)
  return { selection: createLayerSelection(modifiers.additive ? [...Array.from(current.selectedIds), ...range] : range, id), anchorId: anchor }
}
