'use client'
// ── SpriteSheetImportModal (BL-07b) ───────────────────────────────────────────
// Collects the grid layout (columns/rows/fps) for a sprite-sheet image, with a
// live preview overlaying the grid, then imports it as a frameSequence layer.

import { useEffect, useMemo, useState } from 'react'
import type { SpriteImportOptions } from '@/lib/import/types'

interface Props {
  file:     File
  onImport: (opts: SpriteImportOptions) => void
  onClose:  () => void
}

export default function SpriteSheetImportModal({ file, onImport, onClose }: Props) {
  const [columns, setColumns] = useState(4)
  const [rows, setRows]       = useState(4)
  const [fps, setFps]         = useState(12)
  const [dims, setDims]       = useState<{ w: number; h: number } | null>(null)

  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => {
    const img = new Image()
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [url])

  const cols = Math.max(1, Math.floor(columns))
  const rws  = Math.max(1, Math.floor(rows))
  const frameCount = cols * rws
  const cellW = dims ? Math.floor(dims.w / cols) : 0
  const cellH = dims ? Math.floor(dims.h / rws)  : 0

  function submit() {
    onImport({ columns: cols, rows: rws, fps: fps > 0 ? fps : 12 })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[460px] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-100 truncate" title={file.name}>
            Import Sprite Sheet — {file.name}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none shrink-0 ml-2">×</button>
        </div>

        {/* Preview with grid overlay */}
        <div className="relative mb-3 bg-gray-950 rounded border border-gray-700 flex items-center justify-center overflow-hidden" style={{ height: 200 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={file.name} className="max-w-full max-h-full object-contain" />
          <div className="absolute inset-0 pointer-events-none grid"
               style={{
                 gridTemplateColumns: `repeat(${cols}, 1fr)`,
                 gridTemplateRows:    `repeat(${rws}, 1fr)`,
               }}>
            {Array.from({ length: frameCount }).map((_, i) => (
              <div key={i} className="border border-sky-400/30" />
            ))}
          </div>
        </div>

        <div className="text-[10px] text-gray-500 mb-3">
          {dims ? `${dims.w}×${dims.h}px source · ${cellW}×${cellH}px cells` : 'Loading…'} · {frameCount} frames
        </div>

        {/* Grid inputs */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {([['Columns', columns, setColumns], ['Rows', rows, setRows], ['FPS', fps, setFps]] as const).map(
            ([label, val, set]) => (
              <div key={label}>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</label>
                <input
                  type="number"
                  min={1}
                  value={val}
                  onChange={(e) => set(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none focus:border-blue-500"
                />
              </div>
            ),
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[11px] px-3 py-1 rounded text-gray-300 hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!dims}
            className="text-[11px] px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import {frameCount} frames
          </button>
        </div>
      </div>
    </div>
  )
}
