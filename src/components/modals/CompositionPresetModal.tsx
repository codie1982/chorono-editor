'use client'
import { useEffect, useRef, useState } from 'react'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import { COMPOSITION_PRESETS, type Composition } from '@/lib/types'
import { compositionSettingsValid, COMPOSITION_SETTINGS_LIMITS as limits } from '@/lib/scene/compositionSettings'
import { CompositionBackgroundControls } from '@/components/paint/CompositionBackgroundControls'
import type { Asset } from '@/lib/types'

interface Props { composition: Composition; assets?: readonly Asset[]; timelineId?: string | null; onApply: (next: Composition) => void; onClose: () => void }

/** Draft-only composition settings over the existing portable source contract.
 * Presets change dimensions without committing/closing. Apply emits one complete
 * composition, retaining gradients/audio/other metadata; source history belongs
 * to the host. Duration is edited in seconds and saved in milliseconds. Existing
 * key/clip times remain untouched. Native modal owns focus/Escape and releases it
 * on close; cancelling never calls onApply or changes the user's scene. The
 * main host synchronizes only its supplied active Timeline duration, not keys.
 */
export default function CompositionPresetModal({ composition, assets, timelineId, onApply, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [width, setWidth] = useState(composition.width), [height, setHeight] = useState(composition.height)
  const [fps, setFps] = useState(composition.frameRate), [seconds, setSeconds] = useState(composition.durationMs / 1000)
  const [background, setBackground] = useState(composition), [locked, setLocked] = useState(false)
  const ratio = useRef(composition.width / composition.height)
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close() }, [])
  const draft = { ...background, width, height, frameRate: fps, durationMs: seconds * 1000 }
  const valid = compositionSettingsValid(draft)
  const preset = COMPOSITION_PRESETS.find(p => p.width === width && p.height === height)?.id ?? 'custom'
  /** Constrain the other dimension only when aspect lock was explicitly enabled. */
  const dimension = (axis: 'width' | 'height', value: number) => {
    if (axis === 'width') { setWidth(value); if (locked) setHeight(Math.round(value / ratio.current)) }
    else { setHeight(value); if (locked) setWidth(Math.round(value * ratio.current)) }
  }
  const inputClass = 'w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-100'
  return <dialog ref={ref} aria-label="Composition settings" onCancel={event => { event.preventDefault(); onClose() }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-5 text-gray-200 shadow-2xl backdrop:bg-black/60">
    <header className="mb-5 flex items-center gap-3"><h2 className="text-base font-semibold">Composition settings</h2>
      <DocumentationHelp topic="editor/projects" className="ml-auto" /><button type="button" aria-label="Close composition settings" onClick={onClose} className="rounded px-2 py-1 hover:bg-gray-700">✕</button></header>
    <div className="space-y-5">
      <section className="space-y-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Canvas</h3>
        <Field label="Canvas preset"><select aria-label="Canvas preset" value={preset} className={inputClass} onChange={event => {
          const p = COMPOSITION_PRESETS.find(item => item.id === event.target.value)
          if (p && p.width > 0 && p.height > 0) { setWidth(p.width); setHeight(p.height); ratio.current = p.width / p.height }
        }}><option value="custom">Custom</option>{COMPOSITION_PRESETS.filter(p => p.id !== 'custom').map(p => <option key={p.id} value={p.id}>{p.name} · {p.width}×{p.height}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Width (px)"><CalculationNumberInput aria-label="width" value={width} min={limits.minSize} max={limits.maxSize} step={1}
            onChange={event => dimension('width', Number(event.target.value))} onCalculate={value => dimension('width', value)} className={inputClass} /></Field>
          <Field label="Height (px)"><CalculationNumberInput aria-label="height" value={height} min={limits.minSize} max={limits.maxSize} step={1}
            onChange={event => dimension('height', Number(event.target.value))} onCalculate={value => dimension('height', value)} className={inputClass} /></Field>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={locked} onChange={event => {
          if (width > 0 && height > 0) ratio.current = width / height
          setLocked(event.target.checked)
        }} />Lock aspect ratio</label><button type="button" onClick={() => { setWidth(height); setHeight(width); ratio.current = height / width }} className="rounded border border-gray-600 px-3 py-1.5 hover:bg-gray-800">Swap width / height</button></div>
      </section>
      <section className="space-y-3 border-t border-gray-700 pt-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Timing</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (seconds)"><CalculationNumberInput aria-label="Composition duration seconds" min={0} max={limits.maxDurationMs / 1000} step="any" value={seconds}
            onChange={event => setSeconds(Number(event.target.value))} onCalculate={setSeconds} className={inputClass} /></Field>
          <Field label="Frame rate (FPS)"><CalculationNumberInput aria-label="fps" min={limits.minFps} max={limits.maxFps} step="any" value={fps}
            onChange={event => setFps(Number(event.target.value))} onCalculate={setFps} className={inputClass} /></Field>
        </div>
        <div className="flex flex-wrap gap-1.5">{[23.976, 24, 25, 29.97, 30, 60].map(value => <button key={value} type="button" onClick={() => setFps(value)}
          className={`rounded border px-2 py-1 text-xs ${fps === value ? 'border-blue-500 bg-blue-600' : 'border-gray-600 hover:bg-gray-800'}`}>{value} fps</button>)}</div>
        {valid && <p className="text-xs text-gray-400">≈ {Math.max(1, Math.ceil(seconds * fps))} frames · {(1000 / fps).toFixed(2)} ms per frame</p>}
        <p className="text-xs leading-relaxed text-gray-400">{timelineId
          ? `Duration changes also update the active Timeline (${timelineId}). Other Timelines and content clips keep their own duration.`
          : 'Duration sets the default for new Timelines.'} Key times stay in milliseconds; FPS changes frame spacing, not animation speed. Keys beyond a shortened duration are preserved.</p>
      </section>
      <section className="border-t border-gray-700 pt-4"><h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Background</h3>
        <CompositionBackgroundControls composition={background} assets={assets} onChange={setBackground} /></section>
      {!valid && <p role="alert" className="text-xs text-red-300">Use 1–8192 px dimensions, 1–120 FPS and a duration from 0 to 3600 seconds.</p>}
      <footer className="flex justify-end gap-2 border-t border-gray-700 pt-4"><button type="button" onClick={onClose} className="rounded bg-gray-700 px-4 py-2 text-sm hover:bg-gray-600">Cancel</button>
        <button type="button" onClick={() => { if (valid) { onApply(draft); onClose() } }} disabled={!valid} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40">Apply</button></footer>
    </div>
  </dialog>
}

/** Explicit field label shared with native numeric/calculation controls. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-xs text-gray-400">{label}</span>{children}</label>
}
