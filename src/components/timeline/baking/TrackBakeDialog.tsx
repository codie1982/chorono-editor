'use client'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import type { ChronoScene } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { BakeOptions } from '@/lib/animation/baking/bake'
import { buildCurvePath } from '@/lib/timeline/curveMath'
import { curveSignalPreview } from '@/lib/timeline/curveSignalPreview'
import { useTrackBakeJob } from './useTrackBakeJob'

/** Track-specific BakeService view. Dense numerical buffers never enter source
 * or history until explicit Apply. Source checks prevent delayed previews from
 * replacing manual edits; cancel/unmount drops the prepared track. Source and
 * baked paths share the real evaluator and axes. Capture-phase focus handling
 * includes Help even when it stops bubbling keys.
 */
export default function TrackBakeDialog({ scene, editor, timelineId, target, onClose }: {
  scene: ChronoScene; editor: EditorStateReturn; timelineId: string; target: string; onClose: () => void
}) {
  const timeline = scene.timelines.find(item => item.id === timelineId)!, source = timeline?.tracks.find(track => track.target === target)
  const documentSignal = useRef(editor.getDocumentSignal())
  const [options, setOptions] = useState<BakeOptions>({ startMs: 0, endMs: timeline?.durationMs ?? 0, fps: 60, tolerance: 0.005 })
  const [error, setError] = useState('')
  const bake = useTrackBakeJob(editor), preview = bake.snapshot?.preview ?? null
  const dialog = useRef<HTMLDivElement>(null)
  const status = bake.snapshot?.status, stale = status === 'stale'
  const active = status === 'queued' || status === 'running', committing = status === 'committing'
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, signal = documentSignal.current
    const abort = () => close.current()
    dialog.current?.focus(); signal.addEventListener('abort', abort)
    return () => { signal.removeEventListener('abort', abort); if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => { bake.checkSource() }, [bake.checkSource, scene])
  const plot = useMemo(() => {
    if (!preview || !source) return null
    const range = curveSignalPreview([source, preview.track], options.startMs, options.endMs).range
    const viewport = { startMs: options.startMs, endMs: options.endMs, widthPx: 320, heightPx: 96, range }
    return { source: buildCurvePath(source, viewport), baked: buildCurvePath(preview.track, viewport) }
  }, [preview, source, options])
  if (!source || !timeline) return null
  const update = (key: 'startMs' | 'endMs' | 'fps' | 'tolerance', value: string) => {
    setOptions(previous => ({ ...previous, [key]: value.trim() ? Number(value) : NaN })); bake.discard(); setError('')
  }
  const sample = () => {
    try {
      if (editor.isTransactionActive()) throw new Error('Finish the active gesture before preparing a bake.')
      bake.start({ timelineId, timelineDurationMs: timeline.durationMs, target, source, options }); setError('')
    } catch (failure) { setError((failure as Error).message) }
  }
  const apply = async () => {
    if (!preview || stale || editor.isTransactionActive()) return
    try { await bake.commit(); onClose() }
    catch (failure) { setError((failure as Error).message) }
  }
  return <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div role="dialog" aria-modal="true" aria-label="Bake track to keyframes" ref={dialog} tabIndex={-1}
      className="w-[560px] max-w-[95vw] max-h-[90vh] overflow-auto rounded border border-gray-600 bg-gray-900 p-4 text-xs text-gray-200 shadow-2xl"
      onKeyDownCapture={event => {
        // A nested Calculate once dialog is portalled outside this DOM subtree.
        if (!event.currentTarget.contains(event.target as Node)) return
        if (event.key === 'Escape' && !committing) { event.preventDefault(); event.stopPropagation(); onClose() }
        if (event.key === 'Tab') {
          const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>('a[href],input:not([disabled]),button:not([disabled])'))
          const first = controls[0], last = controls[controls.length - 1]
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
      }}>
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold mb-1">Bake track to keyframes</h2><DocumentationHelp topic="editor/timeline/controllers#bake-a-property-track-to-keyframes" compact /></div><p className="font-mono text-[10px] break-all text-gray-400 mb-3">{target}</p>
      <div className="grid grid-cols-2 gap-3">
        {([['startMs', 'Start · local ms'], ['endMs', 'End · local ms'], ['fps', 'Samples / second'], ['tolerance', 'Value tolerance · 0–1']] as const).map(([key, label]) =>
          <label key={key} className="flex flex-col gap-1">{label}<CalculationNumberInput aria-label={label} step="any" value={Number.isNaN(options[key]) ? '' : options[key]}
            onChange={event => update(key, event.target.value)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1 focus-visible:outline focus-visible:outline-blue-400" onCalculate={calculated => update(key, String(calculated))} /></label>)}
      </div>
      <p className="text-[11px] text-gray-400 my-3">Converts this channel's controller, track modifiers and time remapping to linear keys. Existing keys and segment modifiers outside the window stay; removed track processors no longer run outside it. Other channels stay unchanged.</p>
      {bake.snapshot && <div className="my-3 rounded border border-gray-700 bg-gray-950/60 p-2">
        <div role="status" aria-atomic="true" className="flex items-center justify-between gap-3">
          <span className="font-medium text-gray-200">{statusLabel(bake.snapshot.status)}</span>
          <span className="font-mono tabular-nums text-[10px] text-gray-400">{Math.round(bake.snapshot.progress.value * 100)}%</span>
        </div>
        <p className="mt-1 text-[10px] text-gray-400">{bake.snapshot.progress.message}</p>
        {(active || committing) && <div role="progressbar" aria-label="Bake progress" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(bake.snapshot.progress.value * 100)} className="mt-2 h-1.5 overflow-hidden rounded bg-gray-800">
          <div className="h-full bg-blue-500" style={{ width: `${Math.round(bake.snapshot.progress.value * 100)}%` }} />
        </div>}
      </div>}
      {(error || bake.snapshot?.error) && <p role="alert" className="text-red-300 my-2">{error || bake.snapshot?.error}</p>}
      {preview && <div role="status" className="my-3 border border-gray-700 rounded p-2">
        <p>{preview.report.sampleCount} samples → {preview.report.keyCount} keys · {preview.report.retainedOutsideKeys} keys kept outside</p>
        <p>Maximum sample error: {preview.report.maxSampleError.toPrecision(4)} · midpoint error: {preview.report.maxMidpointError.toPrecision(4)} (property units)</p>
        <p className="text-[10px] text-gray-400">Tolerance controls simplification at samples. Between-sample accuracy depends on FPS; these probes do not prove continuous equality.</p>
        {plot && <svg role="img" aria-label="Source blue and baked amber curve preview" viewBox="0 0 320 96" className="w-full h-28 bg-gray-950 my-2">
          <path d={plot.source} stroke="#38bdf8" fill="none" strokeWidth="2" /><path d={plot.baked} stroke="#fbbf24" fill="none" strokeWidth="1" strokeDasharray="3 2" />
        </svg>}
      </div>}
      <div className="flex justify-end gap-2 mt-3">
        <button disabled={committing} onClick={onClose} className="cursor-pointer rounded px-3 py-1 bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline">Close</button>
        {active
          ? <button onClick={bake.cancel} className="cursor-pointer rounded border border-gray-600 px-3 py-1 text-gray-100 focus-visible:outline">Cancel bake</button>
          : <button disabled={committing} onClick={sample} className={`cursor-pointer rounded px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline ${preview ? 'border border-gray-600 text-gray-100' : 'bg-blue-700'}`}>{preview ? 'Refresh preview' : 'Preview bake'}</button>}
        <button disabled={!preview || stale || committing} onClick={() => void apply()} className="cursor-pointer rounded px-3 py-1 bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline">Apply bake</button>
      </div>
    </div>
  </div>
}

function statusLabel(status: NonNullable<ReturnType<typeof useTrackBakeJob>['snapshot']>['status']): string {
  switch (status) {
    case 'idle': return 'Ready'
    case 'queued': return 'Queued'
    case 'running': return 'Preparing preview'
    case 'preview-ready': return 'Preview ready'
    case 'committing': return 'Applying bake'
    case 'completed': return 'Bake completed'
    case 'cancelled': return 'Bake cancelled'
    case 'stale': return 'Source changed'
    case 'failed': return 'Bake failed'
  }
}
