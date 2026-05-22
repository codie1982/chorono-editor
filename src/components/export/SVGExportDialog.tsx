'use client'
import { useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import { exportSVG, downloadBlob } from '@/lib/export'
import BaseExportDialog from './BaseExportDialog'

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
  const [animated, setAnimated] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleExport = () => {
    setBusy(true)
    try {
      const result = exportSVG(scene, {
        timeMs,
        background: transparent ? 'transparent' : 'scene',
        animated,
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
    <BaseExportDialog
      title="Export SVG"
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <>
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
        </>
      }
    >
        <div className="mb-4 space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Options</div>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
              className="accent-blue-500"
            />
            Transparent background
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={animated}
              onChange={(e) => setAnimated(e.target.checked)}
              className="accent-blue-500"
            />
            Animated (SMIL — self-playing, looping)
          </label>
        </div>

        <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
          Vector export covers shapes, paths, text and groups. Images, video,
          particles and effects are skipped (a warning lists them).
          {animated && ' Animated mode maps transform/opacity tracks to looping SMIL.'}
        </p>
    </BaseExportDialog>
  )
}
