'use client'
import { useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import { exportSVG, downloadBlob } from '@/lib/export'

interface Props {
  scene: ChronoScene
  /** Current playhead — animated transforms/opacity captured at this time. */
  timeMs: number
  onClose: () => void
  onExported?: (filename: string, warnings: string[]) => void
  onError?: (message: string) => void
}

/**
 * BL-84 — static SVG export dialog. Converts the current frame to an SVG
 * document (shapes/paths/text/groups) and downloads it. Background can be the
 * composition colour or transparent (common for logos / icons).
 */
export default function SVGExportDialog({ scene, timeMs, onClose, onExported, onError }: Props) {
  const [transparent, setTransparent] = useState(true)
  const [busy, setBusy] = useState(false)

  const handleExport = () => {
    setBusy(true)
    try {
      const result = exportSVG(scene, {
        timeMs,
        background: transparent ? 'transparent' : 'scene',
      })
      const blob = new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' })
      downloadBlob(blob, result.filename)
      onExported?.(result.filename, result.warnings)
      onClose()
    } catch (err) {
      onError?.((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-sm w-full mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
            Export SVG
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        <div className="mb-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Background</div>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
              className="accent-blue-500"
            />
            Transparent
          </label>
        </div>

        <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
          Vector export covers shapes, paths, text and groups. Images, video,
          particles and effects are skipped (a warning lists them).
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
          >
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
