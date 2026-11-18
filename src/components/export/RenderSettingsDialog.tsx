'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import { acquireSequence, type RasterBackground } from '@/lib/export'
import {
  probeChoronoRender,
  transferToChoronoRender,
  type ChoronoRenderIntent,
  type ChoronoRenderTransferResult,
} from '@/lib/export/choronoRender/ChoronoRenderBridge'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import BaseExportDialog, { Field } from './BaseExportDialog'
import { useOutputOperation } from './hooks/useOutputOperation'

interface Props {
  scene: ChronoScene
  assets: AssetElementMap
  currentTimeMs: number
  onClose: () => void
  onTransferred?: (intent: ChoronoRenderIntent, result: ChoronoRenderTransferResult, warnings: string[]) => void
  onError?: (message: string) => void
  documentSignal?: AbortSignal
}

type ConnectionState = 'checking' | 'available' | 'unavailable'
type TransferPhase = 'idle' | 'rendering' | 'transferring'
const SCALES = [1, 2, 3, 4] as const
const MAX_DIMENSION = 4096
const MAX_RENDER_FRAMES = 1800

/**
 * Dedicated 2D final-output handoff. It renders an immutable PNG frame range
 * from the current editor document, then transfers that range to the private
 * local Chorono Render service. Chorono Render owns nondestructive finishing,
 * the destination picker, final PNG/MP4 encoding and cancellation after import.
 */
export default function RenderSettingsDialog({ scene, assets, currentTimeMs, onClose,
  onTransferred, onError, documentSignal }: Props) {
  const [intent, setIntent] = useState<ChoronoRenderIntent>('mp4')
  const [fps, setFps] = useState(Math.round(scene.composition.frameRate || 30))
  const [scale, setScale] = useState(1)
  const [transparent, setTransparent] = useState(false)
  const [connection, setConnection] = useState<ConnectionState>('checking')
  const [connectionMessage, setConnectionMessage] = useState('Checking Chorono Render…')
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [phase, setPhase] = useState<TransferPhase>('idle')
  const operation = useOutputOperation(documentSignal)
  const { busy, cancelling, progress } = operation

  useEffect(() => {
    const controller = new AbortController()
    setConnection('checking')
    setConnectionMessage('Checking Chorono Render…')
    void probeChoronoRender(controller.signal).then(status => {
      setConnection(status.available ? 'available' : 'unavailable')
      setConnectionMessage(status.message)
    }).catch(error => {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setConnection('unavailable')
        setConnectionMessage('Start Chorono Render and try again.')
      }
    })
    return () => controller.abort()
  }, [connectionAttempt])

  useEffect(() => { if (!busy) setPhase('idle') }, [busy])

  const width = Math.round(scene.composition.width * scale)
  const height = Math.round(scene.composition.height * scale)
  const videoFrames = Math.max(1, Math.round(scene.composition.durationMs / 1000 * fps))
  const selectedFrames = intent === 'still' ? 1 : videoFrames
  const validation = width > MAX_DIMENSION || height > MAX_DIMENSION
    ? `Chorono Render accepts dimensions up to ${MAX_DIMENSION} px.`
    : intent === 'mp4' && (width % 2 !== 0 || height % 2 !== 0)
      ? 'MP4 requires even pixel dimensions. Choose another scale or composition size.'
      : intent === 'mp4' && videoFrames > MAX_RENDER_FRAMES
        ? `This render has ${videoFrames} frames; Chorono Render accepts at most ${MAX_RENDER_FRAMES}.`
        : null

  /** Render and transfer one bounded request. Source scene, history and caches
   * remain untouched; stale document results cannot publish completion. */
  const handleRender = useCallback(async () => {
    if (validation || connection !== 'available') return
    const background: RasterBackground = transparent ? 'transparent' : 'scene'
    setPhase('rendering')
    await operation.run((signal, report) => acquireSequence(scene, assets, {
      format: 'png', fps, scale, background,
      ...(intent === 'still' ? { startTimeMs: Math.max(0, currentTimeMs), frameCount: 1 } : {}),
    }, { signal }, report), async (lease, context) => {
      setPhase('transferring')
      const title = scene.composition.id.trim() || 'Chorono 2D scene'
      const result = await transferToChoronoRender(lease.value.blob, { title, fps, intent }, context.signal)
      if (context.isCurrent()) {
        onTransferred?.(intent, result, lease.value.warnings)
        onClose()
      }
    }, message => {
      setPhase('idle')
      onError?.(message)
    })
  }, [assets, connection, currentTimeMs, fps, intent, onClose, onError, onTransferred,
    operation, scale, scene, transparent, validation])

  const percent = progress ? Math.round(progress.frame / progress.total * 100) : 0
  const connectionTone = connection === 'available' ? 'text-emerald-300 border-emerald-700/60 bg-emerald-950/30'
    : connection === 'unavailable' ? 'text-amber-200 border-amber-700/60 bg-amber-950/30'
      : 'text-gray-300 border-gray-700 bg-gray-800/60'

  return (
    <BaseExportDialog title="Render Settings" helpTopic="export/sequence" onClose={onClose}
      closeDisabled={busy} maxWidth="max-w-lg" footer={<>
        <button type="button" onClick={busy ? operation.cancel : onClose} disabled={cancelling}
          className="min-h-9 rounded bg-gray-700 px-3 text-xs text-gray-200 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50">
          {cancelling ? 'Cancelling…' : 'Cancel'}
        </button>
        <button type="button" onClick={() => void handleRender()}
          disabled={busy || connection !== 'available' || Boolean(validation)}
          className="min-h-9 rounded bg-indigo-600 px-4 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? (phase === 'transferring' ? 'Sending…' : 'Rendering…') : 'Continue in Chorono Render'}
        </button>
      </>}>
      <fieldset disabled={busy} className="mb-4">
        <legend className="mb-1.5 text-[10px] uppercase tracking-wide text-gray-500">Output</legend>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['still', 'Current frame', 'Finish and save one PNG frame.'],
            ['mp4', 'MP4 video', 'Render the complete timeline, then encode MP4.'],
          ] as const).map(([value, label, description]) => (
            <label key={value}
              className={`min-h-20 cursor-pointer rounded-md border p-3 text-left transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-400 ${
                intent === value ? 'border-indigo-400 bg-indigo-950/50 text-white' : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-500'
              }`}>
              <input type="radio" name="chorono-render-output" value={value} checked={intent === value}
                onChange={() => setIntent(value)} className="sr-only" />
              <span className="block text-xs font-semibold">{label}</span>
              <span className="mt-1 block text-[11px] leading-4 text-gray-400">{description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        {intent === 'mp4' && <Field label="Frame rate">
          <CalculationNumberInput aria-label="Video frame rate" min={1} max={120} value={fps} disabled={busy}
            onChange={event => setFps(Math.min(120, Math.max(1, Math.round(Number(event.target.value) || 1))))}
            onCalculate={value => setFps(Math.min(120, Math.max(1, Math.round(value))))}
            className="min-h-9 w-full rounded border border-gray-600 bg-gray-800 px-2 text-xs text-gray-200 disabled:opacity-50" />
        </Field>}
        <Field label={`Resolution · ${width} × ${height}`}>
          <div className="grid grid-cols-4 gap-1" aria-label="Resolution scale">
            {SCALES.map(value => <button key={value} type="button" disabled={busy}
              aria-pressed={scale === value} onClick={() => setScale(value)}
              className={`min-h-9 rounded border text-[11px] disabled:opacity-50 ${scale === value
                ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
              {value}×
            </button>)}
          </div>
        </Field>
      </div>

      <Field label="Background">
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-gray-300">
          <input type="checkbox" checked={transparent} disabled={busy}
            onChange={event => setTransparent(event.target.checked)} className="accent-indigo-500" />
          Transparent background
        </label>
        {intent === 'mp4' && transparent && <p className="mt-1 text-[11px] text-amber-300">
          MP4 has no alpha; Chorono Render composites transparent pixels on black.
        </p>}
      </Field>

      <div className={`mb-3 rounded-md border px-3 py-2 text-[11px] ${connectionTone}`} role="status" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <span>{connectionMessage}</span>
          {connection === 'unavailable' && <button type="button" disabled={busy}
            onClick={() => setConnectionAttempt(value => value + 1)}
            className="shrink-0 rounded border border-amber-600 px-2 py-1 text-amber-100 hover:bg-amber-900/50 disabled:opacity-50">
            Retry
          </button>}
        </div>
      </div>

      {validation && <p role="alert" className="mb-3 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-[11px] text-red-200">
        {validation}
      </p>}

      <div className="mb-3 text-[11px] leading-4 text-gray-400">
        {selectedFrames.toLocaleString()} PNG {selectedFrames === 1 ? 'frame' : 'frames'} · {width} × {height}
        {intent === 'still' ? ` · playhead ${Math.max(0, currentTimeMs).toFixed(0)} ms` : ` · ${fps} FPS`}
        <p className="mt-1 text-gray-500">Frames are prepared here. Final PNG/MP4 encoding and file saving happen in Chorono Render.</p>
      </div>

      {busy && <div className="mb-2" role="status" aria-live="polite">
        <div className="h-2 overflow-hidden rounded bg-gray-800" role="progressbar"
          aria-label={phase === 'transferring' ? 'Sending frames to Chorono Render' : 'Rendering frames'}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase === 'transferring' ? undefined : percent}>
          <div className={`h-full bg-indigo-500 transition-[width] motion-reduce:transition-none ${phase === 'transferring' ? 'w-full motion-safe:animate-pulse' : ''}`}
            style={phase === 'rendering' ? { width: `${percent}%` } : undefined} />
        </div>
        <p className="mt-1 text-[10px] tabular-nums text-gray-400">
          {phase === 'transferring' ? 'Sending rendered frames…' : `${progress?.frame ?? 0} / ${progress?.total ?? selectedFrames} frames (${percent}%)`}
        </p>
      </div>}
    </BaseExportDialog>
  )
}
