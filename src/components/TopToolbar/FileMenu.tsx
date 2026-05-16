'use client'
import { useEffect, useRef, useState } from 'react'

interface FileMenuProps {
  /** Current scene filename (composition.id by default). */
  filename: string
  onRename:        (next: string) => void
  onNewScene:      () => void
  onOpenSceneJson: () => void
  onSaveSceneJson: () => void
  onExportRuntime: () => void
  onCopySceneJson: () => void
  onShowShortcuts: () => void
  onResetLayout:   () => void
}

/**
 * Hamburger dropdown (Rive-style File menu). Stays mounted; visibility
 * controlled by local state. Closes on outside click + Esc.
 */
export default function FileMenu(props: FileMenuProps) {
  const { filename } = props
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // ── Close on outside click / Esc ────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown',   esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown',   esc)
    }
  }, [open])

  const item =
    "w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-blue-600 hover:text-white rounded transition-colors"
  const itemDanger =
    "w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-600 hover:text-white rounded transition-colors"
  const sectionLabel =
    "px-3 pt-2 pb-1 text-[9px] uppercase tracking-wider text-gray-500"
  const divider = "h-px bg-gray-700 my-1 mx-2"

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`w-9 h-9 flex flex-col justify-center items-center gap-[3px] rounded
          ${open ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'} transition-colors`}
      >
        <span className="w-4 h-[2px] bg-gray-300" />
        <span className="w-4 h-[2px] bg-gray-300" />
        <span className="w-4 h-[2px] bg-gray-300" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 w-64 bg-gray-900 border border-gray-700 rounded-lg
                     shadow-2xl z-50 py-1.5 animate-[dock-leaf-in_180ms_ease-out]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Filename ── */}
          <div className="px-3 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-gray-500 mb-1">Filename</div>
            <input
              type="text"
              value={filename}
              onChange={(e) => props.onRename(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200
                         focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className={divider} />

          {/* ── File ops ── */}
          <button className={item} onClick={() => { setOpen(false); props.onNewScene() }}>
            ＋ New Scene
          </button>
          <button className={item} onClick={() => { setOpen(false); props.onOpenSceneJson() }}>
            ⇪ Open Scene JSON…
          </button>
          <button className={item} onClick={() => { setOpen(false); props.onSaveSceneJson() }}>
            ⤓ Save Scene JSON
          </button>

          <div className={divider} />

          {/* ── Export ── */}
          <div className={sectionLabel}>Export</div>
          <button className={item} onClick={() => { setOpen(false); props.onExportRuntime() }}>
            ⤓ Runtime JSON (lean)
          </button>
          <button className={item} onClick={() => { setOpen(false); props.onCopySceneJson() }}>
            ⧉ Copy Scene JSON to clipboard
          </button>

          <div className={divider} />

          {/* ── Layout ── */}
          <div className={sectionLabel}>Layout</div>
          <button className={item} onClick={() => { setOpen(false); props.onResetLayout() }}>
            ⊞ Reset Panel Layout
          </button>

          <div className={divider} />

          {/* ── Help ── */}
          <div className={sectionLabel}>Help</div>
          <button className={item} onClick={() => { setOpen(false); props.onShowShortcuts() }}>
            ⌨ Show Shortcuts (Cmd+/)
          </button>
          <a
            href="https://github.com/anthropics/claude-code"
            target="_blank" rel="noopener noreferrer"
            className={item + ' block'}
            onClick={() => setOpen(false)}
          >
            📖 Documentation
          </a>
        </div>
      )}
    </div>
  )
}
