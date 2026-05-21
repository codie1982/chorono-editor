import { useEffect, useRef, useState } from 'react'

// ── View menu (rulers / grid front-back / guides) ───────────────────────────

interface ViewMenuProps {
  showRulers:    boolean; onToggleRulers:    () => void
  gridInFront:   boolean; onToggleGridFront: () => void
  showGuides:    boolean; onToggleGuides:    () => void
}

export function ViewMenu(p: ViewMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const rows: Array<{ label: string; value: boolean; onToggle: () => void; kbd?: string }> = [
    { label: 'Show ruler',           value: p.showRulers,  onToggle: p.onToggleRulers,    kbd: 'Alt + R' },
    { label: 'Show guides',          value: p.showGuides,  onToggle: p.onToggleGuides,    kbd: 'Alt + L' },
    { label: 'Grid on top of layers',value: p.gridInFront, onToggle: p.onToggleGridFront },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="View options"
        className="px-2 py-1 text-xs font-mono rounded border bg-gray-900/90 border-gray-700
                   text-gray-300 hover:bg-gray-800 flex items-center gap-1"
      >
        ⊞ View <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 min-w-[220px] bg-gray-900 border border-gray-700
                        rounded shadow-xl py-1 z-50 dock-overlay-in">
          {rows.map((r) => (
            <button
              key={r.label}
              onClick={r.onToggle}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs
                         text-gray-200 hover:bg-gray-800 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="w-3 inline-block">{r.value ? '✓' : ''}</span>
                {r.label}
              </span>
              {r.kbd && <span className="text-[10px] font-mono text-gray-500">{r.kbd}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
