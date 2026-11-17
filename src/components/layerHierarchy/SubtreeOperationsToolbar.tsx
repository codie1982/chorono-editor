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
 * Compact presentation keeps the same native actions, accessible names and
 * capability rules; only labels become tooltip-backed icons in narrow panels.
 */
function SubtreeOperationsToolbar({ selectedCount, affectedCount, hasChildren, counts, canSetFlag, onExpand, onCollapse, onSetFlag, compact = false }: {
  compact?: boolean
  selectedCount: number; affectedCount: number; hasChildren: boolean; counts: Record<SubtreeFlag, number>
  canSetFlag: (field: SubtreeFlag) => boolean; onExpand: () => void; onCollapse: () => void
  onSetFlag: (field: SubtreeFlag, value: boolean) => void
}) {
  const button = `shrink-0 rounded text-[10px] text-gray-200 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${compact ? 'h-6 w-6 inline-flex items-center justify-center' : 'px-2 py-1'}`
  return <div role="group" aria-label="Selected subtree operations" className={`flex items-center gap-1 border-b border-gray-700 bg-gray-900 px-2 py-1 shrink-0 ${compact ? 'flex-nowrap' : 'flex-wrap'}`}>
    <span className={`text-[10px] text-gray-400 mr-1 ${compact ? 'min-w-0 flex-1 truncate' : ''}`} title={`${selectedCount} selected · ${affectedCount} with children. Includes hidden, filtered and collapsed descendants.`}>{selectedCount} selected · {affectedCount} with children</span>
    <button aria-label="Expand subtree" title="Expand subtree" className={button} disabled={!hasChildren} onClick={onExpand}>{compact ? <SubtreeActionIcon action="expand" /> : 'Expand subtree'}</button>
    <button aria-label="Collapse subtree" title="Collapse subtree" className={button} disabled={!hasChildren} onClick={onCollapse}>{compact ? <SubtreeActionIcon action="collapse" /> : 'Collapse subtree'}</button>
    <button aria-label="Show subtree" title="Show subtree" className={button} disabled={!canSetFlag('hidden') || !counts.hidden} onClick={() => onSetFlag('hidden', false)}>{compact ? <SubtreeActionIcon action="show" /> : 'Show subtree'}</button>
    <button aria-label="Hide subtree" title="Hide subtree" className={button} disabled={!canSetFlag('hidden') || counts.hidden === affectedCount} onClick={() => onSetFlag('hidden', true)}>{compact ? <SubtreeActionIcon action="hide" /> : 'Hide subtree'}</button>
    <label title="More subtree actions" className={compact ? `${button} relative focus-within:outline focus-within:outline-2 focus-within:outline-blue-400` : ''}>
    {compact && <SubtreeActionIcon action="more" />}
    <select aria-label="More subtree actions" className={compact ? 'absolute inset-0 w-full h-full opacity-0 cursor-pointer' : button} value="" onChange={event => {
      const action = SUBTREE_FLAG_ACTIONS[Number(event.target.value)]
      if (action) onSetFlag(action.field, action.value)
    }}>
      <option value="" disabled>More subtree actions…</option>
      {SUBTREE_FLAG_ACTIONS.map((action, index) => <option key={action.label} value={index}
        disabled={!canSetFlag(action.field) || (action.value ? counts[action.field] === affectedCount : counts[action.field] === 0)}>{action.label}</option>)}
    </select>
    </label>
    <DocumentationHelp topic="editor/layers/scene-explorer#work-with-a-branch" compact />
  </div>
}
export default memo(SubtreeOperationsToolbar)

/** Decorative vector glyphs; native control labels carry the action meaning. */
function SubtreeActionIcon({ action }: { action: 'expand' | 'collapse' | 'show' | 'hide' | 'more' }) {
  const tree = action === 'expand' || action === 'collapse'
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    {tree ? <><path d="M2 2h5v4H2zM4 6v6h3M9 9h5v5H9zM10.5 11.5h2" />{action === 'expand' && <path d="M11.5 10.5v2" />}</>
      : action === 'more' ? <path d="M3 8h.1M8 8h.1M13 8h.1" strokeWidth="2.5" />
      : <><path d="M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4z" /><circle cx="8" cy="8" r="1.8" />{action === 'hide' && <path d="M2 2l12 12" />}</>}
  </svg>
}
