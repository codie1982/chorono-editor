import { useEffect, useRef, useState } from 'react'
import { ViewportGridSettings, type ViewportGridSettingsProps } from './ViewportGridSettings'

// ── View menu (rulers / grid front-back / guides) ───────────────────────────

interface ViewMenuProps extends ViewportGridSettingsProps {
  showRulers:    boolean; onToggleRulers:    () => void
  showGuides:    boolean; onToggleGuides:    () => void
  showMeasurements?: boolean; onToggleMeasurements?: () => void
  showMeshTriangles?: boolean; onToggleMeshTriangles?: () => void
}

/** View toggles and a compact settings popover share one outside-click boundary.
 * No scene mutation occurs; Escape returns focus to the invoking control. */
export function ViewMenu(p: ViewMenuProps) {
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const gear = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      // Calculate-once opens the shared native modal outside this popover.
      if (e.target instanceof Element && e.target.closest('dialog[open]')) return
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSettingsOpen(false) }
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (settingsOpen) { setSettingsOpen(false); requestAnimationFrame(() => gear.current?.focus()) }
      else { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('mousedown', close)
    ref.current?.addEventListener('keydown', escape)
    const owned = ref.current
    return () => { document.removeEventListener('mousedown', close); owned?.removeEventListener('keydown', escape) }
  }, [open, settingsOpen])

  const rows: Array<{ label: string; value: boolean; onToggle: () => void; kbd?: string }> = [
    { label: 'Show ruler',           value: p.showRulers,  onToggle: p.onToggleRulers,    kbd: 'Alt + R' },
    { label: 'Show guides',          value: p.showGuides,  onToggle: p.onToggleGuides,    kbd: 'Alt + L' },
  ]
  if (p.onToggleMeasurements) rows.push({ label: 'Show selection gaps', value: !!p.showMeasurements, onToggle: p.onToggleMeasurements })
  if (p.onToggleMeshTriangles) rows.push({ label: 'Show mesh triangles', value: !!p.showMeshTriangles, onToggle: p.onToggleMeshTriangles })

  return (
    <div ref={ref} className="relative">
      <button
        ref={trigger} aria-expanded={open}
        onClick={() => { setOpen((o) => !o); setSettingsOpen(false) }}
        title="View options"
        className="px-2 py-1 text-xs font-mono rounded border bg-gray-900/90 border-gray-700
                   text-gray-300 hover:bg-gray-800 flex items-center gap-1"
      >
        ⊞ View <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 min-w-[220px] bg-gray-900 border border-gray-700
                        rounded shadow-xl py-1 z-50 dock-overlay-in">
          {settingsOpen ? <ViewportGridSettings {...p} onClose={() => { setSettingsOpen(false); requestAnimationFrame(() => gear.current?.focus()) }} /> : <>{rows.map((r) => (
            <div key={r.label} className="flex items-center">
            <button
              aria-pressed={r.value}
              onClick={r.onToggle}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs
                         text-gray-200 hover:bg-gray-800 cursor-pointer focus-visible:outline focus-visible:outline-blue-400"
            >
              <span className="flex items-center gap-2">
                <span className="w-3 inline-block">{r.value ? '✓' : ''}</span>
                {r.label}
              </span>
              {r.kbd && <span className="text-[10px] font-mono text-gray-500">{r.kbd}</span>}
            </button>
            </div>
          ))}<div className="my-1 border-t border-gray-700" /><button ref={gear} aria-label="Viewport grid settings"
            onClick={() => setSettingsOpen(true)} className="w-full px-3 py-2 text-left text-xs text-gray-200 hover:bg-gray-800 focus-visible:outline focus-visible:outline-blue-400">Grid settings…</button></>}
        </div>
      )}
    </div>
  )
}
