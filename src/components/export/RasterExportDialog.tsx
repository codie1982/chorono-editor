'use client'
import { CalculationRangeInput } from '@/components/inputs/CalculationNumberInput'
import { useSessionOutputFilename } from '@/components/editorSession/SessionOutputContext'
import { useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import {
  acquireRasterImage,
  downloadOutput,
  type RasterFormat,
  type RasterBackground,
} from '@/lib/export'
import BaseExportDialog, { Field } from './BaseExportDialog'
import {useOutputOperation} from './hooks/useOutputOperation'

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
  documentSignal?:AbortSignal
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
  scene, assets, timeMs, onClose, onExported, onError,documentSignal,
}: Props) {
  const sessionFilename=useSessionOutputFilename()
  const [format,      setFormat]      = useState<RasterFormat>('png')
  const [scale,       setScale]       = useState<number>(1)
  const [transparent, setTransparent] = useState(false)
  const [quality,     setQuality]     = useState(92)
  const operation=useOutputOperation(documentSignal)
  const {busy,cancelling}=operation

  const { width, height } = scene.composition
  const outW = Math.round(width * scale)
  const outH = Math.round(height * scale)
  const isLossy = format === 'webp' || format === 'jpeg'
  const alphaLost = transparent && format === 'jpeg'

  const handleExport = async () => {
    const background: RasterBackground = transparent ? 'transparent' : 'scene'
    await operation.run(signal=>acquireRasterImage(scene, assets, {
        format,
        timeMs,
        scale,
        background,
        quality: quality / 100,
      },{signal}),lease=>{
      const result=lease.value
      const filename=sessionFilename(result.filename)
      downloadOutput(lease,value=>value.blob,filename)
      onExported?.(filename, result.warnings)
      onClose()
    },onError)
  }

  return (
    <BaseExportDialog
      title="Export Image"
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <>
          <button
            onClick={busy?operation.cancel:onClose}
            disabled={cancelling}
            className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50"
          >
            {cancelling?'Cancelling…':'Cancel'}
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
        {/* Format */}
        <Field label="Format">
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                disabled={busy}
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
                disabled={busy}
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
              disabled={busy}
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
            <CalculationRangeInput aria-label="quality" min={10} max={100} value={quality}
              disabled={busy}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full accent-blue-500" onCalculate={calculated => setQuality(calculated)} />
          </Field>
        )}
    </BaseExportDialog>
  )
}
