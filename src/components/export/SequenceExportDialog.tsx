'use client'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { useSessionOutputFilename } from '@/components/editorSession/SessionOutputContext'
import { useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import {
  acquireSequence,
  downloadOutput,
  type RasterFormat,
  type RasterBackground,
} from '@/lib/export'
import BaseExportDialog, { Field } from './BaseExportDialog'
import {useOutputOperation} from './hooks/useOutputOperation'

interface Props {
  scene: ChronoScene
  assets: AssetElementMap
  onClose: () => void
  onExported?: (filename: string, frameCount: number, warnings: string[]) => void
  onError?: (message: string) => void
  documentSignal?:AbortSignal
}

const FORMATS: Array<{ id: RasterFormat; label: string }> = [
  { id: 'png',  label: 'PNG' },
  { id: 'webp', label: 'WEBP' },
  { id: 'jpeg', label: 'JPEG' },
]

const SCALES = [1, 2, 3, 4] as const

/**
 * BL-83 — image sequence export. Renders the composition to numbered frames at
 * the chosen fps and downloads them as a ZIP. Progress is shown per frame.
 */
export default function SequenceExportDialog({ scene, assets, onClose, onExported, onError,documentSignal }: Props) {
  const sessionFilename=useSessionOutputFilename()
  const [format, setFormat]           = useState<RasterFormat>('png')
  const [fps, setFps]                 = useState(scene.composition.frameRate || 30)
  const [scale, setScale]             = useState(1)
  const [transparent, setTransparent] = useState(false)
  const operation=useOutputOperation(documentSignal)
  const {busy,cancelling,progress}=operation

  const durationMs = scene.composition.durationMs
  const estFrames = Math.max(1, Math.round((durationMs / 1000) * fps))
  const alphaLost = transparent && format === 'jpeg'

  const handleExport = async () => {
    const background: RasterBackground = transparent ? 'transparent' : 'scene'
    await operation.run((signal,report)=>acquireSequence(
        scene, assets,
        { format, fps, scale, background },
        {signal},report,
      ),lease=>{
      const result=lease.value
      const filename=sessionFilename(result.filename)
      downloadOutput(lease,value=>value.blob,filename)
      onExported?.(filename, result.frameCount, result.warnings)
      onClose()
    },onError)
  }

  const pct = progress ? Math.round((progress.frame / progress.total) * 100) : 0

  return (
    <BaseExportDialog
      title="Export Image Sequence"
      helpTopic="export/sequence"
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <>
          <button onClick={busy?operation.cancel:onClose} disabled={cancelling}
            className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50">
            {cancelling?'Cancelling…':'Cancel'}
          </button>
          <button onClick={handleExport} disabled={busy}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50">
            {busy ? 'Rendering…' : 'Export'}
          </button>
        </>
      }
    >
        <Field label="Format">
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                disabled={busy}
                className={`py-1.5 rounded border text-xs transition-colors disabled:opacity-50
                  ${format === f.id
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="FPS">
            <CalculationNumberInput aria-label="fps" min={1} max={120} value={fps} disabled={busy}
              onChange={(e) => setFps(Math.max(1, Number(e.target.value)))}
              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 disabled:opacity-50" onCalculate={calculated => setFps(Math.max(1, calculated))} />
          </Field>
          <Field label={`Resolution (${scale}×)`}>
            <div className="grid grid-cols-4 gap-1">
              {SCALES.map((s) => (
                <button
                  key={s} onClick={() => setScale(s)} disabled={busy}
                  className={`py-1 rounded border text-[11px] transition-colors disabled:opacity-50
                    ${scale === s ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300'}`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Background">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input type="checkbox" checked={transparent} disabled={busy}
              onChange={(e) => setTransparent(e.target.checked)} className="accent-blue-500" />
            Transparent
          </label>
          {alphaLost && (
            <div className="text-[10px] text-amber-400 mt-1">⚠ JPEG has no alpha — exported as white.</div>
          )}
        </Field>

        <div className="text-[10px] text-gray-500 mb-3">
          ≈ {estFrames} frames → ZIP (frame_####.{format === 'jpeg' ? 'jpg' : format})
        </div>

        {progress && (
          <div className="mb-3">
            <div className="h-2 bg-gray-800 rounded overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[10px] text-gray-400 mt-1">{progress.frame} / {progress.total} frames ({pct}%)</div>
          </div>
        )}
    </BaseExportDialog>
  )
}
