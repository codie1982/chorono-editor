import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { GRID_SPACING_MIN, GRID_SPACING_MAX } from '@/lib/snap/gridSettings'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import { useEffect, useRef, useState } from 'react'
import { SnapTransformSettings } from './SnapTransformSettings'

// ── Snap menu (top-right dropdown — SVGator-style) ───────────────────────────

interface SnapMenuProps {
  enabled: boolean;     onToggleEnabled: () => void
  toObjects: boolean;   onToggleObjects: () => void
  toPoints:  boolean;   onTogglePoints:  () => void
  toParent:  boolean;   onToggleParent:  () => void
  toGuides:  boolean;   onToggleGuides:  () => void
  toGrid:    boolean;   onToggleGrid:    () => void
  toPixel:   boolean;   onTogglePixel:   () => void
  gridSize:  number;    onGridSizeChange: (n: number) => void
  radiusPx: number; onRadiusChange: (n: number) => void
  onClearTargets: () => void
  gridVisible?: boolean; onGridVisible?: (value: boolean) => void
  gridInFront?: boolean; onGridInFront?: (value: boolean) => void
  onResetSettings?: () => void
  angleEnabled?: boolean; angleStep?: number; onAngleEnabled?: (value: boolean) => void; onAngleStep?: (value: number) => void
  scaleEnabled?: boolean; scaleStep?: number; onScaleEnabled?: (value: boolean) => void; onScaleStep?: (value: number) => void
}

/** Multi-target precision palette. Native checkboxes stay independent; options
 * edit the shared owning hook, while this component owns only tabs/open focus. */
export function SnapMenu(p: SnapMenuProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'snaps' | 'rotation' | 'scale' | 'options'>('snaps')
  const tabs = ['snaps', 'rotation', 'scale', 'options'] as const
  const ref = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState<number>()
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('dialog[open]')) return
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    // A resized dock must keep every option reachable below its trigger.
    // Observe only while open; scrolling belongs to this temporary palette.
    const viewport = ref.current?.closest('[data-testid="canvas-viewport"]')
    const resize = () => {
      const bounds = ref.current?.getBoundingClientRect()
      if (bounds) setMaxHeight(Math.max(80, Math.min(window.innerHeight, viewport?.getBoundingClientRect().bottom ?? window.innerHeight) - bounds.bottom - 12))
    }
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize)
    if (viewport) observer?.observe(viewport)
    window.addEventListener('resize', resize)
    document.addEventListener('mousedown', close)
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); document.removeEventListener('mousedown', close) }
  }, [open])

  const items: Array<{ label: string; value: boolean; onToggle: () => void; disabled?: boolean; hint?: string }> = [
    { label: 'Snap to Object Edges', value: p.toObjects, onToggle: p.onToggleObjects, disabled: !p.enabled },
    { label: 'Snap to Points',  value: p.toPoints,  onToggle: p.onTogglePoints,  disabled: !p.enabled },
    { label: 'Snap to Parent Edges', value: p.toParent, onToggle: p.onToggleParent, disabled: !p.enabled },
    { label: 'Snap to Guides',  value: p.toGuides,  onToggle: p.onToggleGuides,  disabled: !p.enabled },
    { label: 'Snap to Grid', value: p.toGrid, onToggle: p.onToggleGrid, disabled: !p.enabled || p.gridVisible === false,
      hint: p.gridVisible === false ? 'Show the viewport grid to enable grid snapping.' : undefined },
    { label: 'Snap to Pixel',   value: p.toPixel,   onToggle: p.onTogglePixel,   disabled: !p.enabled },
  ]

  return (
    <div ref={ref} className="relative" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); ref.current?.querySelector('button')?.focus() } }}>
      <button
        onClick={() => { setOpen((o) => !o); setTab('snaps') }}
        title="Snap settings"
        aria-expanded={open}
        className={`px-2 py-1 text-xs font-mono rounded border flex items-center gap-1
          ${p.enabled || p.angleEnabled || p.scaleEnabled
            ? 'bg-blue-600/90 border-blue-500 text-white hover:bg-blue-500'
            : 'bg-gray-900/90 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
      >
        🧲 Snap <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Grid and Snap settings" style={{ maxHeight }} className="absolute top-full right-0 mt-1 w-[360px] max-w-[calc(100vw-32px)] bg-gray-900 border border-gray-700
                        rounded shadow-xl py-1 z-50 overflow-y-auto dock-overlay-in">
          <header className="flex items-center justify-between px-3 py-2 text-xs text-gray-200"><strong>Grid &amp; Snap Settings</strong>
            <span className="flex items-center gap-2"><DocumentationHelp topic="editor/canvas/snapping" /><button aria-label="Close Snap settings" onClick={() => { setOpen(false); ref.current?.querySelector('button')?.focus() }} className="rounded p-1 hover:bg-gray-700">✕</button></span></header>
          <div role="tablist" aria-label="Snap settings sections" className="flex gap-1 border-y border-gray-700 px-3 py-1"
            onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 3)) % tabs.length]; setTab(next); ref.current?.querySelector<HTMLButtonElement>(`[data-snap-tab="${next}"]`)?.focus() } }}>
            {tabs.map(value => <button key={value} data-snap-tab={value} role="tab" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
              onClick={() => setTab(value)} className={`rounded px-3 py-1 text-xs focus-visible:outline focus-visible:outline-blue-400 ${tab === value ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>{value === 'snaps' ? 'Move' : value === 'rotation' ? 'Rotate' : value === 'scale' ? 'Scale' : 'Options'}</button>)}
          </div>
          {tab === 'snaps' && <div role="tabpanel" aria-label="Snap targets">
          <p className="px-3 pt-2 text-[10px] text-gray-400">Choose multiple targets · nearest per axis</p>
          <div className="grid grid-cols-2 gap-x-1 px-1 py-2">{items.map((it) => (
            <label
              key={it.label}
              title={it.hint} className={`min-h-9 flex items-center gap-2 px-2 py-1.5 text-[11px]
                ${it.disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-200 hover:bg-gray-800 cursor-pointer'}`}
            >
              <input type="checkbox" aria-label={it.label} data-snap-target={it.label} checked={it.value} disabled={it.disabled} onChange={it.onToggle} className="accent-blue-500" />
              <span className="flex-1 text-left">{it.label.replace('Snap to ', '')}</span>
            </label>
          ))}</div></div>}
          {tab === 'rotation' && <SnapTransformSettings kind="rotation" enabled={!!p.angleEnabled} step={p.angleStep ?? 15} onEnabled={p.onAngleEnabled} onStep={p.onAngleStep} />}
          {tab === 'scale' && <SnapTransformSettings kind="scale" enabled={!!p.scaleEnabled} step={p.scaleStep ?? 10} onEnabled={p.onScaleEnabled} onStep={p.onScaleStep} />}
          {/* Same composition-pixel spacing as View → viewport settings. */}
          {tab === 'options' && <div role="tabpanel" aria-label="Snap options" className="space-y-3 px-3 py-3">
            {p.onGridVisible && <label className="flex min-h-8 items-center gap-2 text-xs text-gray-300"><input type="checkbox" aria-label="Show viewport grid" checked={!!p.gridVisible} onChange={event => p.onGridVisible?.(event.target.checked)} />Show viewport grid</label>}
            {p.onGridInFront && <label className="flex min-h-8 items-center gap-2 text-xs text-gray-300"><input type="checkbox" aria-label="Grid on top of layers" checked={!!p.gridInFront} onChange={event => p.onGridInFront?.(event.target.checked)} />Grid on top of layers</label>}
            <label className="flex items-center justify-between gap-2 text-xs text-gray-300"><span>Snap radius</span><span className="flex items-center gap-1">
              <CalculationNumberInput aria-label="Snap radius" min={1} max={30} step={1} value={p.radiusPx}
                onChange={event => p.onRadiusChange(Number(event.target.value))} onCalculate={p.onRadiusChange}
                className="w-20 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-right" /><span className="text-[10px]">screen px</span></span></label>
            <label className="flex items-center justify-between gap-2 text-xs text-gray-300">
              <span>Grid spacing</span><span className="flex items-center gap-1">
              <CalculationNumberInput aria-label="Snap grid spacing" min={GRID_SPACING_MIN} max={GRID_SPACING_MAX} step="any"
                value={p.gridSize}
                onChange={(e) => p.onGridSizeChange(Number(e.target.value))}
                className="w-24 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-right" onCalculate={calculated => p.onGridSizeChange(calculated)} />
              <span className="text-[10px] font-mono text-gray-300">px</span></span>
            </label><p className="text-[10px] leading-relaxed text-gray-400">Visibility and spacing are shared with View → Grid settings.</p>
            {p.onResetSettings && <button type="button" onClick={p.onResetSettings} className="w-full rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800">Reset Snap settings</button>}
          </div>}
          {(tab === 'snaps' || tab === 'options') && <><div className="h-px bg-gray-800 my-1" />
          <div className="flex items-center gap-1 pr-3"><label
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs
                         text-gray-200 hover:bg-gray-800 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={p.enabled} onChange={p.onToggleEnabled} className="accent-blue-500" />
              Enable Snapping
            </span>
            <span className="text-[10px] font-mono text-gray-500">Alt + S</span>
          </label>
          <button onClick={p.onClearTargets} className="shrink-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-700 focus-visible:outline focus-visible:outline-blue-400">Clear all</button></div></>}
        </div>
      )}
    </div>
  )
}
