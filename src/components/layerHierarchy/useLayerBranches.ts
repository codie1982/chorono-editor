'use client'
import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import type { Layer } from '@/lib/types'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import type { SubtreeFlag } from '@/lib/editor/branches/SubtreeCommands'

/** Shared panel adapter. Traversal/counts use committed source, not filtered or
 * mounted rows. Expansion changes local UI only; flag callbacks supply the
 * selected roots to the editor command owner, which resolves current scope
 * again at commit. No timers, scene copy or history state is retained here.
 */
export function useLayerBranches({ layers, selectedId, selectedIds, setCollapsedIds, onSetFlag }: {
  layers: readonly Layer[]; selectedId: string | null; selectedIds: ReadonlySet<string>
  setCollapsedIds: Dispatch<SetStateAction<Set<string>>>
  onSetFlag?: (roots: readonly string[], field: SubtreeFlag, value: boolean) => void
}) {
  const index = useMemo(() => new LayerIndex(layers), [layers])
  const roots = useMemo(() => Array.from(selectedIds.size ? selectedIds : selectedId ? [selectedId] : []).filter(id => !!index.get(id)), [selectedId, selectedIds, index])
  const ids = useMemo(() => index.subtreeIds(roots), [index, roots])
  const summary = useMemo(() => {
    const counts: Record<SubtreeFlag, number> = { hidden: 0, locked: 0, solo: 0, frozen: 0 }
    let hasChildren = false
    ids.forEach(id => {
      const layer = index.get(id)!
      if (index.childrenOf(id).length) hasChildren = true
      for (const field of Object.keys(counts) as SubtreeFlag[]) if (layer[field]) counts[field]++
    })
    return { counts, hasChildren }
  }, [index, ids])
  const setExpanded = useCallback((targets: readonly string[], expanded: boolean) => {
    const scope = index.subtreeIds(targets)
    setCollapsedIds(previous => {
      const next = new Set(previous)
      scope.forEach(id => expanded ? next.delete(id) : next.add(id))
      return next.size === previous.size ? previous : next
    })
  }, [index, setCollapsedIds])
  const setFlag = useCallback((targets: readonly string[], field: SubtreeFlag, value: boolean) => onSetFlag?.(targets, field, value), [onSetFlag])
  return { roots, ids, ...summary, setExpanded, setFlag }
}
