'use client'
import { memo } from 'react'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import type { SubtreeFlag } from '@/lib/editor/branches/SubtreeCommands'

export const SUBTREE_FLAG_ACTIONS: readonly { label: string; field: SubtreeFlag; value: boolean }[] = [
  { label: 'Lock subtree', field: 'locked', value: true }, { label: 'Unlock subtree', field: 'locked', value: false },
  { label: 'Solo subtree', field: 'solo', value: true }, { label: 'Clear subtree solo', field: 'solo', value: false },
  { label: 'Freeze subtree', field: 'frozen', value: true }, { label: 'Unfreeze subtree', field: 'frozen', value: false },
]

/** Stateless shared subtree controls; displayed count is the source forest,
 * including hidden/collapsed/filtered descendants. Source operations remain
 * distinct from panel collapse and delegate a single reversible command.
 */
function SubtreeOperationsToolbar({ selectedCount, affectedCount, hasChildren, counts, canSetFlag, onExpand, onCollapse, onSetFlag }: {
  selectedCount: number; affectedCount: number; hasChildren: boolean; counts: Record<SubtreeFlag, number>
  canSetFlag: (field: SubtreeFlag) => boolean; onExpand: () => void; onCollapse: () => void
  onSetFlag: (field: SubtreeFlag, value: boolean) => void
}) {
  const button = 'rounded px-2 py-1 text-[10px] text-gray-200 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400'
  return <div role="group" aria-label="Selected subtree operations" className="flex flex-wrap items-center gap-1 border-b border-gray-700 bg-gray-900 px-2 py-1 shrink-0">
    <span className="text-[10px] text-gray-400 mr-1" title="Selected layers and all source descendants, including hidden, filtered and collapsed children.">{selectedCount} selected · {affectedCount} with children</span>
    <button className={button} disabled={!hasChildren} onClick={onExpand}>Expand subtree</button>
    <button className={button} disabled={!hasChildren} onClick={onCollapse}>Collapse subtree</button>
    <button className={button} disabled={!canSetFlag('hidden') || !counts.hidden} onClick={() => onSetFlag('hidden', false)}>Show subtree</button>
    <button className={button} disabled={!canSetFlag('hidden') || counts.hidden === affectedCount} onClick={() => onSetFlag('hidden', true)}>Hide subtree</button>
    <select aria-label="More subtree actions" className={button} value="" onChange={event => {
      const action = SUBTREE_FLAG_ACTIONS[Number(event.target.value)]
      if (action) onSetFlag(action.field, action.value)
    }}>
      <option value="" disabled>More subtree actions…</option>
      {SUBTREE_FLAG_ACTIONS.map((action, index) => <option key={action.label} value={index}
        disabled={!canSetFlag(action.field) || (action.value ? counts[action.field] === affectedCount : counts[action.field] === 0)}>{action.label}</option>)}
    </select>
    <DocumentationHelp topic="editor/layers/scene-explorer#work-with-a-branch" compact />
  </div>
}
export default memo(SubtreeOperationsToolbar)
