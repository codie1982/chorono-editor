'use client'

/** Explicit Find action and reversible filter-exception feedback. Does not move
 * keyboard focus or alter selection/source; the panel owns rows and scrolling. */
export function FindSelectedButton({ disabled, onFind, compact = false }: { disabled: boolean; onFind: () => void; compact?: boolean }) {
  return <button aria-label="Find selected" disabled={disabled} onClick={() => onFind()} title="Find selected layer · reveal and scroll to the selection; keep search filters"
    className={`shrink-0 rounded text-[10px] bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${compact ? 'h-6 w-6 inline-flex items-center justify-center' : 'px-2 py-1'}`}>
    {compact ? <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="8" cy="8" r="4" /><path d="M8 0v5M8 11v5M0 8h5M11 8h5" />
    </svg> : 'Find selected'}</button>
}

/** Feedback is outside the scroll canvas and does not author timeline membership. */
export function FoundSelectionNotice({ onRestore }: { onRestore: () => void }) {
  return <div role="status" className="flex items-center gap-2 border-b border-gray-700 px-2 py-1 text-[10px] text-gray-300 bg-gray-800">
    <span>Find selection is active; current filters are preserved.</span>
    <button className="ml-auto shrink-0 text-blue-300 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" onClick={onRestore}>Restore filters</button>
  </div>
}
