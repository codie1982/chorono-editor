'use client'

/** Reserved UI row above the canvas, so isolation can be exited even with the
 * Layers tab closed. It is not painted into animation or export surfaces. */
export function LayerIsolationBar({ count, onExit }: { count: number; onExit: () => void }) {
  if (!count) return null
  return <div role="status" className="shrink-0 flex items-center gap-2 px-3 py-1 text-[11px] bg-amber-950 text-amber-100 border-b border-amber-800">
    <span>Isolation · {count} selected {count === 1 ? 'branch' : 'branches'} and children</span>
    <button onClick={onExit} className="ml-auto underline focus-visible:outline focus-visible:outline-2" aria-label="Exit viewport isolation">Exit isolation</button>
  </div>
}
