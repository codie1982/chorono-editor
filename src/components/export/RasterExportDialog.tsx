'use client'
import { useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import {
  exportRasterImage,
  downloadBlob,
  type RasterFormat,
  type RasterBackground,
} from '@/lib/export'

interface Props {
  scene: ChronoScene
  assets: AssetElementMap
  /** Current playhead — the frame that will be captured. */
  timeMs: number
  onClose: () => void
  /** Notify parent of completion (for a toast). Warnings may be empty. */
  onExported?: (filename: string, warnings: string[]) => void
  /** Notify parent of failure. */
  onError?: (message: string) => void
}

const FORMATS: Array<{ id: RasterFormat; label: string; note: string }> = [
  { id: 'png',  label: 'PNG',  note: 'Lossless · alpha' },
  { id: 'webp', label: 'WEBP', note: 'Small · alpha' },
  { id: 'jpeg', label: 'JPEG', note: 'Small · no alpha' },
]

const SCALES = [1, 2, 3, 4] as const

/**
 * BL-80 — single-frame raster export (PNG / WEBP / JPEG). Renders the current
 * playhead frame at the chosen resolution/background and downloads it. Fully
 * client-side via RasterExportEngine + the shared CanvasRenderer.
 */
export default function RasterExportDialog({
  scene, assets, timeMs, onClose, onExported, onError,
}: Props) {
  const [format,      setFormat]      = useState<RasterFormat>('png')
  const [scale,       setScale]       = useState<number>(1)
  const [transparent, setTransparent] = useState(false)
  const [quality,     setQuality]     = useState(92)
  const [busy,        setBusy]        = useState(false)

  const { width, height } = scene.composition
  const outW = Math.round(width * scale)
  const outH = Math.round(height * scale)
  const isLossy = format === 'webp' || format === 'jpeg'
  const alphaLost = transparent && format === 'jpeg'

  const handleExport = async () => {
    setBusy(true)
    try {
      const background: RasterBackground = transparent ? 'transparent' : 'scene'
      const result = await exportRasterImage(scene, assets, {
        format,
        timeMs,
        scale,
        background,
        quality: quality / 100,
      })
      downloadBlob(result.blob, result.filename)
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
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-md w-full mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
            Export Image
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        {/* Format */}
        <Field label="Format">
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`p-2 rounded border text-left transition-colors
                  ${format === f.id
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300'}`}
              >
                <div className="text-xs font-medium">{f.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{f.note}</div>
              </button>
            ))}
          </div>
        </Field>

        {/* Resolution */}
        <Field label={`Resolution — ${outW}×${outH}`}>
          <div className="grid grid-cols-4 gap-2">
            {SCALES.map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`py-1.5 rounded border text-xs transition-colors
                  ${scale === s
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300'}`}
              >
                {s}×
              </button>
            ))}
          </div>
        </Field>

        {/* Background */}
        <Field label="Background">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
              className="accent-blue-500"
            />
            Transparent
          </label>
          {alphaLost && (
            <div className="text-[10px] text-amber-400 mt-1">
              ⚠ JPEG has no alpha — transparent will export as white.
            </div>
          )}
        </Field>

        {/* Quality (lossy only) */}
        {isLossy && (
          <Field label={`Quality — ${quality}%`}>
            <input
              type="range" min={10} max={100} value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-3">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">{label}</div>
      {children}
    </div>
  )
}
