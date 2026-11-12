'use client'
import { useCallback, useMemo, useState } from 'react'
import type { ChronoScene, Timeline } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { LayerTrackIndex } from '@/lib/timeline/LayerTrackIndex'
import { buildTimelineLayerRows } from '@/lib/timeline/hierarchy/timelineLayerRows'
import { makeSetSubtreeFlagCmd, type SubtreeFlag } from '@/lib/editor/branches/SubtreeCommands'
import { useLayerBranches } from '@/components/layerHierarchy/useLayerBranches'
import { useFindSelected } from '@/components/layerHierarchy/useFindSelected'

/** Timeline UI composition of shared hierarchy/branch commands. Branch collapse
 * is separate from property collapse. Filters and Find are local; every source
 * operation resolves current committed scene through the existing editor.
 */
export function useTimelineHierarchy({ scene, editor, timeline, trackIndex, filter, selectedId, selectedIds }: {
  scene: ChronoScene; editor: EditorStateReturn; timeline: Timeline | null; trackIndex: LayerTrackIndex
  filter: string; selectedId: string | null; selectedIds: ReadonlySet<string>
}) {
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(() => new Set())
  const [selectedOnly, setSelectedOnly] = useState(false)
  const find = useFindSelected(selectedId, selectedIds)
  const setFlag = useCallback((roots: readonly string[], field: SubtreeFlag, value: boolean) => {
    const command = makeSetSubtreeFlagCmd(editor.getScene(), roots, field, value)
    if (command) editor.dispatchCommand(command)
  }, [editor.getScene, editor.dispatchCommand])
  const branches = useLayerBranches({ layers: scene.layers, selectedId, selectedIds, setCollapsedIds: setCollapsedBranches, onSetFlag: setFlag })
  const model = useMemo(() => buildTimelineLayerRows(scene.layers, timeline, { collapsedIds: collapsedBranches,
    filter, selectedOnly, selectedId, selectedIds, revealIds: find.revealIds, trackIndex }),
  [scene.layers, timeline, collapsedBranches, filter, selectedOnly, selectedId, selectedIds, find.revealIds, trackIndex])
  const toggleBranch = useCallback((id: string) => setCollapsedBranches(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }), [])
  return { ...model, branches, find, selectedOnly, setSelectedOnly, collapsedBranches, setCollapsedBranches, toggleBranch }
}
