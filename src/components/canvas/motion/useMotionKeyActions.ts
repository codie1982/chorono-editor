import { useCallback } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { TrajectoryNode } from '@/lib/timeline/trajectory'
import { deleteTrajectoryNodes, duplicateTrajectoryNodes, retimeTrajectoryNodes, setTrajectoryPoint,
  type TrajectoryEditResult } from '@/lib/timeline/trajectory/commands'
import { makeBatchCmd } from '@/lib/editor/commands-batch'
import type { MotionPointDraft } from './types'
import { trajectoryNodeRef } from './types'

interface Options {
  editor: EditorStateReturn
  timelineId: string
  layerId: string
  selectedNodes: readonly TrajectoryNode[]
  onSelect: (ids: Set<string>) => void
  onSeek?: (localMs: number) => void
  onWarning: (message: string) => void
}

/** Native key actions shared by toolbar, keyboard and numeric inspector.
 * Each preflights on synchronous source before one dispatch; no intermediate
 * retime/value edit enters history. Sparse axis filling and collisions remain
 * owned by trajectory commands. Active pointer transactions reject UI commands. */
export function useMotionKeyActions(options: Options) {
  const { editor, timelineId, layerId, selectedNodes, onSelect, onSeek, onWarning } = options
  const apply = useCallback((build: () => TrajectoryEditResult) => {
    if (editor.isTransactionActive()) { onWarning('Finish or cancel the active drag before editing keys.'); return false }
    try {
      const result = build()
      if (result.command) editor.dispatchCommand(result.command)
      onSelect(new Set(result.selectedIds))
      onWarning(result.diagnostics.join(' '))
      return true
    } catch (error) { onWarning(error instanceof Error ? error.message : String(error)); return false }
  }, [editor, onSelect, onWarning])
  const remove = useCallback(() => apply(() => deleteTrajectoryNodes(editor.getScene(), {
    timelineId, layerId, nodes: selectedNodes.map(trajectoryNodeRef),
  })), [apply, editor, timelineId, layerId, selectedNodes])
  const duplicate = useCallback((deltaTimeMs: number) => apply(() => duplicateTrajectoryNodes(editor.getScene(), {
    timelineId, layerId, nodes: selectedNodes.map(trajectoryNodeRef), deltaTimeMs,
  })), [apply, editor, timelineId, layerId, selectedNodes])
  const numeric = useCallback((draft: MotionPointDraft) => {
    const node = selectedNodes.length === 1 ? selectedNodes[0] : undefined
    if (!node) return
    let actualTimeMs = node.timeMs
    const applied = apply(() => {
      let source = editor.getScene()
      const commands = [], diagnostics: string[] = []
      let ids = node.keyIds
      if (draft.timeMs !== node.timeMs) {
        const retimed = retimeTrajectoryNodes(source, { timelineId, layerId, nodes: [trajectoryNodeRef(node)], deltaTimeMs: draft.timeMs - node.timeMs })
        if (retimed.command) { commands.push(retimed.command); source = retimed.command.execute(source) }
        diagnostics.push(...retimed.diagnostics); ids = retimed.selectedIds
        // Floating-point delta addition need not reproduce the typed decimal
        // bit-for-bit. Place/seek at the retimed record's exact native time.
        const moved = source.timelines.find(timeline => timeline.id === timelineId)?.tracks
          .flatMap(track => track.keyframes).find(key => ids.includes(key.id))
        if (!moved) throw new Error('The retimed motion key no longer exists.')
        actualTimeMs = moved.timeMs
      }
      if (draft.x !== node.world.x || draft.y !== node.world.y) {
        const placed = setTrajectoryPoint(source, { timelineId, layerId, timeMs: actualTimeMs, worldPoint: { x: draft.x, y: draft.y } })
        if (placed.command) commands.push(placed.command)
        diagnostics.push(...placed.diagnostics); ids = placed.selectedIds
      }
      return { command: commands.length ? makeBatchCmd('Edit motion key values', commands) : null, selectedIds: ids, diagnostics }
    })
    if (applied) onSeek?.(actualTimeMs)
  }, [apply, editor, timelineId, layerId, selectedNodes, onSeek])
  return { apply, remove, duplicate, numeric }
}
