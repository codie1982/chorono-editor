import { CalculationRangeInput } from '@/components/inputs/CalculationNumberInput'
import { useEffect, useRef, useState } from 'react'

// ── Snap menu (top-right dropdown — SVGator-style) ───────────────────────────

interface SnapMenuProps {
  enabled: boolean;     onToggleEnabled: () => void
  toObjects: boolean;   onToggleObjects: () => void
  toPoints:  boolean;   onTogglePoints:  () => void
  toGuides:  boolean;   onToggleGuides:  () => void
  toGrid:    boolean;   onToggleGrid:    () => void
  toPixel:   boolean;   onTogglePixel:   () => void
  gridSize:  number;    onGridSizeChange: (n: number) => void
}

export function SnapMenu(p: SnapMenuProps) {
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

  const items: Array<{ label: string; value: boolean; onToggle: () => void; disabled?: boolean }> = [
    { label: 'Snap to Objects', value: p.toObjects, onToggle: p.onToggleObjects, disabled: !p.enabled },
    { label: 'Snap to Points',  value: p.toPoints,  onToggle: p.onTogglePoints,  disabled: !p.enabled },
    { label: 'Snap to Guides',  value: p.toGuides,  onToggle: p.onToggleGuides,  disabled: !p.enabled },
    { label: 'Snap to Grid',    value: p.toGrid,    onToggle: p.onToggleGrid,    disabled: !p.enabled },
    { label: 'Snap to Pixel',   value: p.toPixel,   onToggle: p.onTogglePixel,   disabled: !p.enabled },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Snap settings"
        className={`px-2 py-1 text-xs font-mono rounded border flex items-center gap-1
          ${p.enabled
            ? 'bg-blue-600/90 border-blue-500 text-white hover:bg-blue-500'
            : 'bg-gray-900/90 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
      >
        🧲 Snap <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 min-w-[220px] bg-gray-900 border border-gray-700
                        rounded shadow-xl py-1 z-50 dock-overlay-in">
          {items.map((it) => (
            <button
              key={it.label}
              disabled={it.disabled}
              onClick={() => !it.disabled && it.onToggle()}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs
                ${it.disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-200 hover:bg-gray-800 cursor-pointer'}`}
            >
              <span className="w-3 inline-block">{it.value ? '✓' : ''}</span>
              <span className="flex-1 text-left">{it.label}</span>
            </button>
          ))}
          {/* Inline grid-size slider when Snap to Grid is on */}
          {p.toGrid && p.enabled && (
            <div className="px-3 py-1.5 flex items-center gap-2 border-t border-gray-800 mt-1 pt-2">
              <span className="text-[10px] text-gray-400">Grid</span>
              <CalculationRangeInput aria-label="p grid Size" min={2} max={100} step={1}
                value={p.gridSize}
                onChange={(e) => p.onGridSizeChange(Number(e.target.value))}
                className="flex-1 accent-blue-500" onCalculate={calculated => p.onGridSizeChange(calculated)} />
              <span className="text-[10px] font-mono text-gray-300 w-10 text-right">{p.gridSize}px</span>
            </div>
          )}
          <div className="h-px bg-gray-800 my-1" />
          <button
            onClick={p.onToggleEnabled}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs
                       text-gray-200 hover:bg-gray-800 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span className="w-3 inline-block">{p.enabled ? '✓' : ''}</span>
              Enable Snapping
            </span>
            <span className="text-[10px] font-mono text-gray-500">Alt + S</span>
          </button>
        </div>
      )}
    </div>
  )
}
