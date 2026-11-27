'use client'

import { useEffect, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import {
  acquireRasterImage,
  acquireSequence,
  downloadOutput,
  type RasterBackground,
} from '@/lib/export'
import { probeChoronoRender, transferToChoronoRender } from '@/lib/export/choronoRender/ChoronoRenderBridge'
import {
  preferredRenderBackend,
  renderArtifact,
  toChoronoRenderIntent,
  type RenderBackendId,
  type RenderCompletion,
  type RenderIntent,
} from '@/lib/export/render/RenderBackendSelection'
import { useSessionOutputFilename } from '@/components/editorSession/SessionOutputContext'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import BaseExportDialog, { Field } from './BaseExportDialog'
import { useOutputOperation } from './hooks/useOutputOperation'

interface Props {
  scene: ChronoScene
  assets: AssetElementMap
  currentTimeMs: number
  onClose: () => void
  onCompleted?: (completion: RenderCompletion, warnings: string[]) => void
  onError?: (message: string) => void
  documentSignal?: AbortSignal
}

type ConnectionState = 'checking' | 'available' | 'unavailable'
type RenderPhase = 'idle' | 'rendering' | 'transferring'
const SCALES = [1, 2, 3, 4] as const
const CHORONO_MAX_DIMENSION = 4096
const CHORONO_MAX_FRAMES = 1800
const BUILTIN_MAX_FRAMES = 4096

/**
 * Unified final-output dialog with capability-aware backend selection.
 * Chorono Render is selected whenever its authenticated local service exists;
 * the user may still choose the built-in renderer. Without Chorono Render,
 * stills download as PNG and video intent downloads as a PNG sequence ZIP.
 * Neither backend mutates the scene, undo history or editable animation data.
 */
export default function RenderSettingsDialog({ scene, assets, currentTimeMs, onClose,
  onCompleted, onError, documentSignal }: Props) {
  const sessionFilename = useSessionOutputFilename()
  const [intent, setIntent] = useState<RenderIntent>('video')
  const [backend, setBackend] = useState<RenderBackendId | null>(null)
  const [fps, setFps] = useState(Math.round(scene.composition.frameRate || 30))
  const [scale, setScale] = useState(1)
  const [transparent, setTransparent] = useState(false)
  const [connection, setConnection] = useState<ConnectionState>('checking')
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [phase, setPhase] = useState<RenderPhase>('idle')
  const operation = useOutputOperation(documentSignal)
  const { busy, cancelling, progress } = operation

  useEffect(() => {
    const controller = new AbortController()
    setConnection('checking')
    setBackend(null)
    void probeChoronoRender(controller.signal).then(status => {
      setConnection(status.available ? 'available' : 'unavailable')
      setBackend(preferredRenderBackend(status.available))
    }).catch(error => {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setConnection('unavailable')
        setBackend('builtin')
      }
    })
    return () => controller.abort()
  }, [connectionAttempt])

  useEffect(() => { if (!busy) setPhase('idle') }, [busy])

  const resolvedBackend = backend ?? 'builtin'
  const artifact = renderArtifact(resolvedBackend, intent)
  const width = Math.round(scene.composition.width * scale)
  const height = Math.round(scene.composition.height * scale)
  const videoFrames = Math.max(1, Math.round(scene.composition.durationMs / 1000 * fps))
  const selectedFrames = intent === 'still' ? 1 : videoFrames
  const frameLimit = resolvedBackend === 'chorono' ? CHORONO_MAX_FRAMES : BUILTIN_MAX_FRAMES
  const validation = resolvedBackend === 'chorono' && (width > CHORONO_MAX_DIMENSION || height > CHORONO_MAX_DIMENSION)
    ? `Chorono Render accepts dimensions up to ${CHORONO_MAX_DIMENSION} px.`
    : resolvedBackend === 'chorono' && intent === 'video' && (width % 2 !== 0 || height % 2 !== 0)
      ? 'MP4 requires even pixel dimensions. Choose another scale or composition size.'
      : intent === 'video' && videoFrames > frameLimit
        ? `${resolvedBackend === 'chorono' ? 'Chorono Render' : 'Built-in renderer'} accepts at most ${frameLimit} frames; this render has ${videoFrames}.`
        : null

  const fail = (message: string) => {
    setPhase('idle')
    onError?.(message)
  }

  /** Render with the selected backend. Built-in output downloads immediately;
   * Chorono output transfers a managed PNG archive for final PNG/MP4 finishing. */
  async function handleRender() {
    if (!backend || connection === 'checking' || validation) return
    const background: RasterBackground = transparent ? 'transparent' : 'scene'
    setPhase('rendering')

    if (backend === 'builtin' && intent === 'still') {
      await operation.run(signal => acquireRasterImage(scene, assets, {
        format: 'png', timeMs: Math.max(0, currentTimeMs), scale, background,
      }, { signal }), lease => {
        const filename = sessionFilename(lease.value.filename)
        downloadOutput(lease, value => value.blob, filename)
        onCompleted?.({ backend, intent, artifact: 'png', frameCount: 1, filename }, lease.value.warnings)
        onClose()
      }, fail)
      return
    }

    if (backend === 'builtin') {
      await operation.run((signal, report) => acquireSequence(scene, assets, {
        format: 'png', fps, scale, background,
      }, { signal }, report), lease => {
        const filename = sessionFilename(lease.value.filename)
        downloadOutput(lease, value => value.blob, filename)
        onCompleted?.({ backend, intent, artifact: 'png-sequence', frameCount: lease.value.frameCount, filename }, lease.value.warnings)
        onClose()
      }, fail)
      return
    }

    await operation.run((signal, report) => acquireSequence(scene, assets, {
      format: 'png', fps, scale, background,
      ...(intent === 'still' ? { startTimeMs: Math.max(0, currentTimeMs), frameCount: 1 } : {}),
    }, { signal }, report), async (lease, context) => {
      setPhase('transferring')
      const title = scene.composition.id.trim() || 'Chorono 2D scene'
      const result = await transferToChoronoRender(lease.value.blob, {
        title, fps, intent: toChoronoRenderIntent(intent),
      }, context.signal)
      if (context.isCurrent()) {
        onCompleted?.({ backend, intent, artifact, frameCount: result.frameCount }, lease.value.warnings)
        onClose()
      }
    }, fail)
  }

  const percent = progress ? Math.round(progress.frame / progress.total * 100) : 0
  const statusMessage = connection === 'checking'
    ? 'Checking for Chorono Render…'
    : connection === 'available'
      ? backend === 'chorono'
        ? 'Chorono Render is connected and selected by default.'
        : 'Chorono Render is connected. Built-in renderer selected manually.'
      : 'Chorono Render was not found. Built-in renderer selected.'
  const statusTone = connection === 'available' ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300'
    : connection === 'unavailable' ? 'border-amber-700/60 bg-amber-950/30 text-amber-200'
      : 'border-gray-700 bg-gray-800/60 text-gray-300'
  const primaryLabel = busy
    ? phase === 'transferring' ? 'Sending…' : 'Rendering…'
    : backend === 'chorono' ? 'Continue in Chorono Render'
      : intent === 'still' ? 'Render PNG' : 'Render PNG Sequence'

  return (
    <BaseExportDialog title="Render Settings" helpTopic="export/sequence" onClose={onClose}
      closeDisabled={busy} maxWidth="max-w-lg" footer={<>
        <button type="button" onClick={busy ? operation.cancel : onClose} disabled={cancelling}
          className="min-h-9 rounded bg-gray-700 px-3 text-xs text-gray-200 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50">
          {cancelling ? 'Cancelling…' : 'Cancel'}
        </button>
        <button type="button" onClick={() => void handleRender()}
          disabled={busy || !backend || connection === 'checking' || Boolean(validation)}
          className="min-h-9 rounded bg-indigo-600 px-4 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
          {primaryLabel}
        </button>
      </>}>
      <fieldset disabled={busy || connection === 'checking'} className="mb-4">
        <legend className="mb-1.5 text-[10px] uppercase tracking-wide text-gray-500">Renderer</legend>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['chorono', 'Chorono Render', connection === 'available' ? 'Connected · preferred' : 'Not installed or not running'],
            ['builtin', 'Built-in renderer', 'PNG stills · PNG sequence video'],
          ] as const).map(([value, label, description]) => {
            const unavailable = value === 'chorono' && connection !== 'available'
            return <label key={value}
              className={`min-h-16 rounded-md border p-3 text-left transition-colors focus-within:ring-2 focus-within:ring-indigo-400 ${
                unavailable ? 'cursor-not-allowed border-gray-800 bg-gray-900/50 text-gray-600' : 'cursor-pointer'
              } ${backend === value ? 'border-indigo-400 bg-indigo-950/50 text-white' : !unavailable ? 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-500' : ''}`}>
              <input type="radio" name="render-backend" value={value} checked={backend === value}
                disabled={unavailable} onChange={() => setBackend(value)} className="sr-only" />
              <span className="block text-xs font-semibold">{label}</span>
              <span className="mt-1 block text-[11px] leading-4 text-gray-400">{description}</span>
            </label>
          })}
        </div>
      </fieldset>

      <fieldset disabled={busy} className="mb-4">
        <legend className="mb-1.5 text-[10px] uppercase tracking-wide text-gray-500">Output</legend>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['still', 'Current frame', 'Render the playhead as one PNG frame.'],
            ['video', 'Video', resolvedBackend === 'chorono' ? 'Finish as MP4 in Chorono Render.' : 'Download a PNG sequence ZIP.'],
          ] as const).map(([value, label, description]) => (
            <label key={value}
              className={`min-h-20 cursor-pointer rounded-md border p-3 text-left transition-colors focus-within:ring-2 focus-within:ring-indigo-400 ${
                intent === value ? 'border-indigo-400 bg-indigo-950/50 text-white' : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-500'
              }`}>
              <input type="radio" name="render-output" value={value} checked={intent === value}
                onChange={() => setIntent(value)} className="sr-only" />
              <span className="block text-xs font-semibold">{label}</span>
              <span className="mt-1 block text-[11px] leading-4 text-gray-400">{description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        {intent === 'video' && <Field label="Frame rate">
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
        {resolvedBackend === 'chorono' && intent === 'video' && transparent && <p className="mt-1 text-[11px] text-amber-300">
          MP4 has no alpha; Chorono Render composites transparent pixels on black.
        </p>}
      </Field>

      <div className={`mb-3 rounded-md border px-3 py-2 text-[11px] ${statusTone}`} role="status" aria-live="polite" aria-atomic="true">
        <div className="flex items-center justify-between gap-3">
          <span>{statusMessage}</span>
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
        <p className="mt-1 text-gray-500">{resolvedBackend === 'chorono'
          ? 'Frames are prepared here. Final PNG/MP4 encoding and file saving happen in Chorono Render.'
          : intent === 'still'
            ? 'The built-in renderer downloads a PNG directly.'
            : 'The built-in renderer downloads a PNG sequence ZIP. Start Chorono Render to finish an MP4.'}</p>
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
