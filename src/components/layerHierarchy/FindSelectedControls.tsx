'use client'

/** Explicit Find action and reversible filter-exception feedback. Does not move
 * keyboard focus or alter selection/source; the panel owns rows and scrolling. */
export function FindSelectedButton({ disabled, onFind }: { disabled: boolean; onFind: () => void }) {
  return <button disabled={disabled} onClick={() => onFind()} title="Show and scroll to selected layer paths without changing source or filters"
    className="shrink-0 rounded px-2 py-1 text-[10px] bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">Find selected</button>
}

/** Feedback is outside the scroll canvas and does not author timeline membership. */
export function FoundSelectionNotice({ onRestore }: { onRestore: () => void }) {
  return <div role="status" className="flex items-center gap-2 border-b border-gray-700 px-2 py-1 text-[10px] text-gray-300 bg-gray-800">
    <span>Find selection is active; current filters are preserved.</span>
    <button className="ml-auto shrink-0 text-blue-300 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" onClick={onRestore}>Restore filters</button>
  </div>
}
