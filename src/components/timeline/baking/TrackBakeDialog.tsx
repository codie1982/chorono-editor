'use client'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { prepareBake, type BakeOptions } from '@/lib/animation/baking/bake'
import { makeApplyTrackBakeCmd } from '@/lib/editor/commands-track'
import { buildCurvePath } from '@/lib/timeline/curveMath'
import { curveSignalPreview } from '@/lib/timeline/curveSignalPreview'

/** One bounded, synchronous conversion preview. Dense numerical buffers never
 * enter source/history until explicit Apply. Revision/document/track checks
 * prevent delayed previews replacing manual edits. Cancel/unmount drops the
 * prepared track. Source and baked paths share the real evaluator and axes.
 */
export default function TrackBakeDialog({ scene, editor, timelineId, target, onClose }: {
  scene: ChronoScene; editor: EditorStateReturn; timelineId: string; target: string; onClose: () => void
}) {
  const timeline = scene.timelines.find(item => item.id === timelineId)!, source = timeline?.tracks.find(track => track.target === target)
  const revision = useRef(editor.getRevision()), documentSignal = useRef(editor.getDocumentSignal())
  const [options, setOptions] = useState<BakeOptions>({ startMs: 0, endMs: timeline?.durationMs ?? 0, fps: 60, tolerance: 0.005 })
  const [preview, setPreview] = useState<ReturnType<typeof prepareBake> | null>(null), [error, setError] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const stale = revision.current !== editor.getRevision() || documentSignal.current.aborted
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, signal = documentSignal.current
    const abort = () => close.current()
    dialog.current?.focus(); signal.addEventListener('abort', abort)
    return () => { signal.removeEventListener('abort', abort); if (previous?.isConnected) previous.focus() }
  }, [])
  const plot = useMemo(() => {
    if (!preview || !source) return null
    const range = curveSignalPreview([source, preview.track], options.startMs, options.endMs).range
    const viewport = { startMs: options.startMs, endMs: options.endMs, widthPx: 320, heightPx: 96, range }
    return { source: buildCurvePath(source, viewport), baked: buildCurvePath(preview.track, viewport) }
  }, [preview, source, options])
  if (!source || !timeline) return null
  const update = (key: 'startMs' | 'endMs' | 'fps' | 'tolerance', value: string) => {
    setOptions(previous => ({ ...previous, [key]: value.trim() ? Number(value) : NaN })); setPreview(null); setError('')
  }
  const sample = () => {
    setPreview(null)
    try {
      if (stale || editor.isTransactionActive()) throw new Error('Source changed or a gesture is active. Reopen Bake from the current track.')
      if (options.endMs > timeline.durationMs) throw new Error('The bake window must be inside the active timeline.')
      setPreview(prepareBake(source, { ...options, signal: documentSignal.current, keyIdPrefix: timelineId })); setError('')
    } catch (failure) { setError((failure as Error).message) }
  }
  const apply = () => {
    if (!preview || stale || editor.isTransactionActive()) return
    try { editor.dispatchCommand(makeApplyTrackBakeCmd(timelineId, target, source, preview.track, options)); onClose() }
    catch (failure) { setError((failure as Error).message) }
  }
  return <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div role="dialog" aria-modal="true" aria-label="Bake track to keyframes" ref={dialog} tabIndex={-1}
      className="w-[560px] max-w-[95vw] max-h-[90vh] overflow-auto rounded border border-gray-600 bg-gray-900 p-4 text-xs text-gray-200 shadow-2xl"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
        if (event.key === 'Tab') {
          const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>('input,button:not([disabled])'))
          const first = controls[0], last = controls[controls.length - 1]
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
      }}>
      <h2 className="text-sm font-semibold mb-1">Bake track to keyframes</h2><p className="font-mono text-[10px] break-all text-gray-400 mb-3">{target}</p>
      <div className="grid grid-cols-2 gap-3">
        {([['startMs', 'Start · local ms'], ['endMs', 'End · local ms'], ['fps', 'Samples / second'], ['tolerance', 'Value tolerance · 0–1']] as const).map(([key, label]) =>
          <label key={key} className="flex flex-col gap-1">{label}<CalculationNumberInput aria-label={label} step="any" value={Number.isNaN(options[key]) ? '' : options[key]}
            onChange={event => update(key, event.target.value)} className="bg-gray-800 border border-gray-600 rounded px-2 py-1 focus-visible:outline focus-visible:outline-blue-400" onCalculate={calculated => update(key, String(calculated))} /></label>)}
      </div>
      <p className="text-[11px] text-gray-400 my-3">Converts this channel's controller, track modifiers and time remapping to linear keys. Existing keys and segment modifiers outside the window stay; removed track processors no longer run outside it. Other channels stay unchanged.</p>
      {(error || stale) && <p role="alert" className="text-red-300 my-2">{error || 'Source changed. Close and preview the current track again.'}</p>}
      {preview && <div role="status" className="my-3 border border-gray-700 rounded p-2">
        <p>{preview.report.sampleCount} samples → {preview.report.keyCount} keys · {preview.report.retainedOutsideKeys} keys kept outside</p>
        <p>Maximum sample error: {preview.report.maxSampleError.toPrecision(4)} · midpoint error: {preview.report.maxMidpointError.toPrecision(4)} (property units)</p>
        <p className="text-[10px] text-gray-400">Tolerance controls simplification at samples. Between-sample accuracy depends on FPS; these probes do not prove continuous equality.</p>
        {plot && <svg role="img" aria-label="Source blue and baked amber curve preview" viewBox="0 0 320 96" className="w-full h-28 bg-gray-950 my-2">
          <path d={plot.source} stroke="#38bdf8" fill="none" strokeWidth="2" /><path d={plot.baked} stroke="#fbbf24" fill="none" strokeWidth="1" strokeDasharray="3 2" />
        </svg>}
      </div>}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="rounded px-3 py-1 bg-gray-700 focus-visible:outline">Cancel</button>
        <button disabled={stale} onClick={sample} className="rounded px-3 py-1 bg-blue-700 disabled:opacity-40 focus-visible:outline">Preview bake</button>
        <button disabled={!preview || stale} onClick={apply} className="rounded px-3 py-1 bg-amber-600 disabled:opacity-40 focus-visible:outline">Apply bake</button>
      </div>
    </div>
  </div>
}
