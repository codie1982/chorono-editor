'use client'

/** Explicit cross-panel navigation and temporary viewport focus. These native
 * buttons never select, hide or key source objects by themselves. */
export function LayerFocusControls({ selected, canIsolate, isolated, onTimeline, onIsolate, onExit }: {
  selected: boolean; canIsolate: boolean; isolated: boolean
  onTimeline?: () => void; onIsolate?: () => void; onExit?: () => void
}) {
  const style = 'rounded px-2 py-1 text-[10px] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400'
  return <>
    {onTimeline && <button disabled={!selected} onClick={onTimeline} aria-label="Show selection in Timeline"
      title="Show selected layers and animation tracks in Timeline; selection alone does not scroll it"
      className={`${style} bg-gray-700 text-gray-200 hover:bg-gray-600`}>▤ Timeline</button>}
    {onIsolate && <button disabled={!isolated && !canIsolate} onClick={isolated ? onExit : onIsolate}
      aria-label={isolated ? 'Exit layer isolation' : 'Isolate selection and children'} aria-pressed={isolated}
      title={isolated ? 'Restore the full viewport; keep all edits' : 'Temporarily view the selected layers and their children'}
      className={`${style} ${isolated ? 'bg-amber-700 text-amber-100' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>
      {isolated ? '⊡ Exit isolate' : '⊡ Isolate'}
    </button>}
  </>
}

/** Reserved UI row above the canvas, so isolation can be exited even with the
 * Layers tab closed. It is not painted into animation or export surfaces. */
export function LayerIsolationBar({ count, onExit }: { count: number; onExit: () => void }) {
  if (!count) return null
  return <div role="status" className="shrink-0 flex items-center gap-2 px-3 py-1 text-[11px] bg-amber-950 text-amber-100 border-b border-amber-800">
    <span>Isolation · {count} selected {count === 1 ? 'branch' : 'branches'} and children</span>
    <button onClick={onExit} className="ml-auto underline focus-visible:outline focus-visible:outline-2" aria-label="Exit viewport isolation">Exit isolation</button>
  </div>
}
