'use client'
// ── ImportMenu ────────────────────────────────────────────────────────────────
//
// Split-button toolbar entry point for the universal import pipeline, organized
// by SOURCE (not file type — the OS picker already filters file types):
//
//   [ ⤓ Import ▾ ]
//     ⤓ From File…          (default; multi-file picker, all formats)
//     🔗 From URL…           (https remote fetch)
//     📋 Paste from Clipboard
//     ── coming soon ──
//     ◇ Figma…  / 📐 CAD (DXF)…  (disabled — Phase 5/7)
//
// Clicking the main button = From File. The caret opens the source menu.

import { useEffect, useRef, useState } from 'react'
import { IMPORT_ACCEPT, IMPORT_FORMATS_LABEL } from '@/lib/import/acceptFormats'

interface Props {
  /** Import local files (default action + "From File…"). */
  onImportFiles: (files: FileList | File[]) => void
  /** Open the URL import flow. */
  onImportUrl: () => void
  /** Import an image from the clipboard. */
  onImportClipboard: () => void
}

export default function ImportMenu({ onImportFiles, onImportUrl, onImportClipboard }: Props) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef  = useRef<HTMLDivElement>(null)

  // Close on outside click / Esc
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const pickFiles = () => inputRef.current?.click()
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) onImportFiles(files)
    e.target.value = ''
  }

  const item = 'w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-blue-600 hover:text-white rounded transition-colors flex items-center gap-2'
  const itemDisabled = 'w-full text-left px-3 py-1.5 text-xs text-gray-600 cursor-not-allowed flex items-center gap-2'
  const sectionLabel = 'px-3 pt-2 pb-1 text-[9px] uppercase tracking-wider text-gray-500'

  return (
    <div ref={rootRef} className="relative flex items-stretch">
      {/* Main action — From File */}
      <button
        onClick={pickFiles}
        title={`Import file — ${IMPORT_FORMATS_LABEL}`}
        className="flex items-center gap-1 pl-2.5 pr-2 py-1.5 text-xs rounded-l
                   bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
      >
        <span className="text-sm leading-none">⤓</span> Import
      </button>
      {/* Caret — source menu */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Import sources"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`px-1.5 py-1.5 text-xs rounded-r border-l border-blue-700
                    ${open ? 'bg-blue-500' : 'bg-blue-600 hover:bg-blue-500'} text-white transition-colors`}
      >
        ▾
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={handleChange}
      />

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 w-56 bg-gray-900 border border-gray-700 rounded-lg
                     shadow-2xl z-50 py-1.5 animate-[dock-leaf-in_180ms_ease-out]"
          onClick={(e) => e.stopPropagation()}
        >
          <button className={item} onClick={() => { setOpen(false); pickFiles() }}>
            <span className="w-4 text-center">⤓</span> From File…
          </button>
          <button className={item} onClick={() => { setOpen(false); onImportUrl() }}>
            <span className="w-4 text-center">🔗</span> From URL…
          </button>
          <button className={item} onClick={() => { setOpen(false); onImportClipboard() }}>
            <span className="w-4 text-center">📋</span> Paste from Clipboard
          </button>

          <div className="h-px bg-gray-700 my-1 mx-2" />
          <div className={sectionLabel}>Coming soon</div>
          <button className={itemDisabled} disabled title="Planned — Phase 7">
            <span className="w-4 text-center">◇</span> Figma…
          </button>
          <button className={itemDisabled} disabled title="Planned — Phase 5">
            <span className="w-4 text-center">📐</span> CAD (DXF / DWG)…
          </button>
        </div>
      )}
    </div>
  )
}
