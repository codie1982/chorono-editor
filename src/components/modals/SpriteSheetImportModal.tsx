'use client'
// ── SpriteSheetImportModal (BL-07b) ───────────────────────────────────────────
// Collects the grid layout (columns/rows/fps) for a sprite-sheet image, with a
// live preview overlaying the grid, then imports it as a frameSequence layer.

import { useEffect, useId, useRef, useState } from 'react'
import { buildSpriteGrid } from '@/lib/frameSequence/spriteGrid'
import { editorMediaProbes } from '@/lib/asset/metadata/editorMediaProbes'
import type { MediaProbeSource, ImagePreviewLease } from '@/lib/asset/metadata'
import type { SpriteImportOptions } from '@/lib/import/types'

interface Props {
  file:     File
  onImport: (opts: SpriteImportOptions) => void
  onClose:  () => void
  /** Private hosts/tests may supply the same owned-preview contract. */
  probes?: Pick<MediaProbeSource, 'preview'>
}

/** Sprite configuration borrows one native preview pin. No direct image URL
 * or second unmanaged <img> is created. Native settlement/disposal stays with
 * the probe service through StrictMode/unmount cancellation; stale pins release.
 * Grid uses constant DOM/CSS rather than allocating one element per frame. */
export default function SpriteSheetImportModal({ file, onImport, onClose, probes = editorMediaProbes }: Props) {
  const dialogId=useId()
  const [columns, setColumns] = useState(4)
  const [rows, setRows]       = useState(4)
  const [fps, setFps]         = useState(12)
  const [dims, setDims]       = useState<{ w: number; h: number } | null>(null)

  const previewHost = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    let live = true, pin: ImagePreviewLease | undefined
    setDims(null); setError(null)
    void probes.preview(file, { signal: abort.signal }).then(lease => {
      if (!live) { lease.release(); return }
      pin = lease
      try {
        const image = lease.element
        image.className = 'max-w-full max-h-full object-contain'
        image.alt = file.name
        previewHost.current?.append(image)
        setDims({ w: lease.width, h: lease.height })
      } catch (failure) { lease.release(); pin = undefined; setError((failure as Error).message) }
    }, failure => { if (live && failure.name !== 'AbortError') setError(failure.message) })
    return () => { live = false; abort.abort(); previewHost.current?.replaceChildren(); pin?.release() }
  }, [file, probes])

  let grid: ReturnType<typeof buildSpriteGrid> | null = null, gridError: string | null = null
  if (dims) {
    try { grid = buildSpriteGrid('preview', { imageWidth: dims.w, imageHeight: dims.h, columns, rows, fps }) }
    catch (failure) { gridError = (failure as Error).message }
  }
  const cols = grid?.columns ?? 1, rws = grid?.rows ?? 1, frameCount = grid?.frameCount ?? 0
  const cellW = grid?.frameWidth ?? 0, cellH = grid?.frameHeight ?? 0

  function submit() {
    if (!grid || error) return
    onImport({ columns: cols, rows: rws, fps: grid.fps })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`}
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[460px] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id={`${dialogId}-title`} className="text-sm font-semibold text-gray-100 truncate" title={file.name}>
            Import Sprite Sheet — {file.name}
          </h2>
          <button aria-label="Close sprite import" onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none shrink-0 ml-2">×</button>
        </div>

        {/* Preview with grid overlay */}
        <div className="relative mb-3 bg-gray-950 rounded border border-gray-700 flex items-center justify-center overflow-hidden" style={{ height: 200 }}>
          <div ref={previewHost} className="flex h-full w-full items-center justify-center" />
          {grid && <div className="absolute inset-0 pointer-events-none" aria-hidden="true"
            style={{ backgroundImage: 'linear-gradient(to right, rgb(56 189 248 / 0.3) 1px, transparent 1px), linear-gradient(to bottom, rgb(56 189 248 / 0.3) 1px, transparent 1px)',
              backgroundSize: `${100 / cols}% ${100 / rws}%` }} /> }
        </div>

        <div className="text-[10px] text-gray-500 mb-3">
          {dims ? `${dims.w}×${dims.h}px source · ${cellW}×${cellH}px cells` : 'Loading…'} · {frameCount} frames
        </div>

        {(error || gridError) && <p role="alert" className="mb-3 text-xs text-red-300">{error ?? gridError}</p>}
        {/* Grid inputs */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {([['Columns', columns, setColumns], ['Rows', rows, setRows], ['FPS', fps, setFps]] as const).map(
            ([label, val, set]) => (
              <div key={label}>
                <label htmlFor={`${dialogId}-${label}`} className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</label>
                <input
                  id={`${dialogId}-${label}`}
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
            disabled={!grid || !!error}
            className="text-[11px] px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import {frameCount} frames
          </button>
        </div>
      </div>
    </div>
  )
}
