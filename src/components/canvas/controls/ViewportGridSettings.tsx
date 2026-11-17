import { useEffect, useRef, useState } from 'react'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { GRID_SPACING_MIN, GRID_SPACING_MAX, validGridSpacing } from '@/lib/snap/gridSettings'

export interface ViewportGridSettingsProps {
  showGrid: boolean
  onToggleGrid(): void
  gridInFront: boolean
  onToggleGridFront(): void
  gridSize: number
  onGridSizeChange(value: number): void
}

/** Non-modal viewport preferences, never project source or Undo data. Spacing
 * shares the snap owner's composition-pixel setting. Valid drafts update the
 * viewport immediately; an empty/out-of-range draft resets on blur. The parent
 * owns outside-click/Escape dismissal and restores focus to its settings entry. */
export function ViewportGridSettings(p: ViewportGridSettingsProps & { onClose(): void }) {
  const [draft, setDraft] = useState(String(p.gridSize))
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  useEffect(() => { setDraft(String(p.gridSize)) }, [p.gridSize])
  const invalid = draft === '' || !validGridSpacing(Number(draft))
  /** Keep invalid typing local; source/drag snapping receives finite px only. */
  const change = (value: string) => {
    setDraft(value)
    if (value !== '' && validGridSpacing(Number(value))) p.onGridSizeChange(Number(value))
  }
  return <section role="dialog" aria-label="Viewport settings" className="p-3 w-72 space-y-3 text-xs text-gray-200">
    <header className="flex items-center justify-between gap-3">
      <h2 className="font-semibold">Viewport settings</h2>
      <button aria-label="Close viewport settings" onClick={p.onClose}
        className="rounded p-1 hover:bg-gray-700 focus-visible:outline focus-visible:outline-blue-400">✕</button>
    </header>
    <label className="flex items-center gap-2"><input type="checkbox" checked={p.showGrid} onChange={p.onToggleGrid} />Show grid</label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={p.gridInFront} onChange={p.onToggleGridFront} />Grid on top of layers</label>
    <label className="flex items-center justify-between gap-3">
      <span>Grid spacing</span><span className="flex items-center gap-1">
        <CalculationNumberInput ref={input} aria-label="Grid spacing" aria-invalid={invalid}
          min={GRID_SPACING_MIN} max={GRID_SPACING_MAX} step="any" value={draft}
          onChange={event => change(event.target.value)} onCalculate={value => change(String(value))}
          onBlur={() => { if (invalid) setDraft(String(p.gridSize)) }}
          className="w-24 rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-right focus:border-blue-400 focus:outline-none" />
        <span className="text-gray-400">px</span>
      </span>
    </label>
    <p className="text-[11px] text-gray-400">Composition pixels · 1–10,000 px. Also used by Snap to Grid.</p>
    <p className="border-t border-gray-700 pt-2 text-[11px] text-gray-400">Editor overlay only. Hidden in preview and exports.</p>
  </section>
}
