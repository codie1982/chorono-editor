import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import type { Layer } from '@/lib/types'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { useLayerBranches } from '@/components/layerHierarchy/useLayerBranches'
import type { SubtreeFlag } from '@/lib/editor/branches/SubtreeCommands'

/** Compatibility adapter for the former Explorer-only hidden callback. New
 * panels use useLayerBranches. Keeps one source traversal/expansion policy and
 * preserves the old callback's changed-descendant-ID contract. */
export function useSceneExplorerBranches({ layers, selectedId, selectedIds, setCollapsedIds, onHidden }: {
  layers: readonly Layer[]; selectedId: string | null; selectedIds: ReadonlySet<string>
  setCollapsedIds: Dispatch<SetStateAction<Set<string>>>
  onHidden?: (ids: string[], field: 'hidden', value: boolean) => void
}) {
  const index = useMemo(() => new LayerIndex(layers), [layers])
  const onSetFlag = useCallback((roots: readonly string[], field: SubtreeFlag, value: boolean) => {
    if (field !== 'hidden') return
    const changed = Array.from(index.subtreeIds(roots)).filter(id => !!index.get(id)?.hidden !== value)
    if (changed.length) onHidden?.(changed, 'hidden', value)
  }, [index, onHidden])
  const branches = useLayerBranches({ layers, selectedId, selectedIds, setCollapsedIds, onSetFlag })
  const setHidden = useCallback((roots: readonly string[], value: boolean) => branches.setFlag(roots, 'hidden', value), [branches.setFlag])
  return { ...branches, hiddenCount: branches.counts.hidden, setHidden }
}
