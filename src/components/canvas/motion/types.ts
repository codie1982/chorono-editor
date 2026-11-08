import type { TrajectoryNode } from '@/lib/timeline/trajectory'
import type { TrajectoryNodeRef } from '@/lib/timeline/trajectory/commands'

export type MotionEditorMode = 'off' | 'select' | 'add' | 'draw'
export interface MotionPointDraft { x: number; y: number; timeMs: number }
export interface MotionDrawSettings {
  startMs: number
  endMs: number
  distribution: 'equal-time' | 'distance'
  mode: 'append' | 'replace-range'
}

/** Address the exact native position keys represented by a displayed node;
 * sparse axes remain absent so domain commands can preserve their source. */
export function trajectoryNodeRef(node: TrajectoryNode): TrajectoryNodeRef {
  return { timeMs: node.timeMs, xKeyId: node.xKey?.id, yKeyId: node.yKey?.id }
}

/** Paired position nodes are selected when either native axis key is selected. */
export function isMotionNodeSelected(node: TrajectoryNode, ids: ReadonlySet<string>): boolean {
  return node.keyIds.some(id => ids.has(id))
}

/** Shift toggles the complete node pair; plain selection preserves an already
 * selected group while ensuring both axes of the pressed node are included.
 * Inputs are borrowed read-only; the returned Set belongs to the UI caller. */
export function selectMotionNode(current: ReadonlySet<string>, node: TrajectoryNode, shift: boolean): Set<string> {
  const selected = isMotionNodeSelected(node, current)
  const result = new Set(shift || selected ? current : [])
  const remove = shift && node.keyIds.every(id => current.has(id))
  node.keyIds.forEach(id => remove ? result.delete(id) : result.add(id))
  return result
}
