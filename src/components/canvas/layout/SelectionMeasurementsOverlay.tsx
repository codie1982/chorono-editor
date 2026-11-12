import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { useEffect, useRef } from 'react'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import type { SelectionMeasurements } from './useSelectionMeasurements'

/** Exact selected-neighbor edge gaps in composition space, projected through
 * the same zoomed wrapper as selection frames. Lines are pointer-transparent;
 * labeled buttons retain selection and offer a keyboard-accessible input.
 * Negative values mean overlap, not distance along a diagonal or motion path.
 */
export function SelectionMeasurementsOverlay({ measurements, zoom, names }: {
  measurements: SelectionMeasurements
  zoom: number
  names: ReadonlyMap<string, string>
}) {
  const plan = measurements.plan
  if (!plan?.gaps.length) return null
  return <div data-selection-measurements className="absolute inset-0 z-40 pointer-events-none">
    <svg className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
      {plan.gaps.map(gap => {
        const x1 = gap.from.x * zoom, y1 = gap.from.y * zoom, x2 = gap.to.x * zoom, y2 = gap.to.y * zoom
        return <g key={gap.id} stroke={gap.gap < 0 ? '#fbbf24' : '#f472b6'} strokeWidth={1.5}>
          <path d={`M${x1},${y1}L${x2},${y2}`} strokeDasharray="3 2" />
          <path d={gap.axis === 'x' ? `M${x1},${y1 - 5}v10M${x2},${y2 - 5}v10`
            : `M${x1 - 5},${y1}h10M${x2 - 5},${y2}h10`} />
        </g>
      })}
    </svg>
    {plan.gaps.map(gap => {
      const direction = gap.axis === 'x' ? 'horizontal' : 'vertical'
      const label = `${Number(gap.gap.toFixed(2))}${gap.gap < 0 ? ' overlap' : ''}`
      return <button key={gap.id} type="button" data-gap-axis={gap.axis} data-gap-before-id={gap.beforeId} data-gap-after-id={gap.afterId}
        aria-label={`Edit ${direction} gap between ${names.get(gap.beforeId) ?? gap.beforeId} and ${names.get(gap.afterId) ?? gap.afterId}`}
        title={`${direction} edge gap in composition px. Click to edit; the active object in this pair stays fixed, otherwise the left/top object.`}
        className="absolute min-w-11 min-h-7 -translate-x-1/2 -translate-y-1/2 rounded border border-pink-400/70 bg-slate-950/95 px-1.5 text-[11px] font-mono text-pink-100 shadow pointer-events-auto hover:bg-pink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        style={{ left: (gap.from.x + gap.to.x) / 2 * zoom, top: (gap.from.y + gap.to.y) / 2 * zoom }}
        onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); measurements.open(gap.id, event.currentTarget) }}>{label}</button>
    })}
  </div>
}

/** Floating numeric alternative to dragging. The two names and fixed/moving
 * policy are explicit; Apply and Enter share one command, Escape cancels.
 * Event ownership prevents global delete/nudge/play shortcuts while editing.
 */
export function SelectionGapControls({ measurements, names }: {
  measurements: SelectionMeasurements
  names: ReadonlyMap<string, string>
}) {
  const input = useRef<HTMLInputElement>(null)
  const session = measurements.session
  useEffect(() => { if (session) { input.current?.focus(); input.current?.select() } }, [session])
  if (!session) return null
  const gap = session.plan.gaps.find(item => item.id === session.gapId)!
  return <form role="dialog" aria-modal="false" aria-label="Edit selection gap" data-selection-gap-controls
    className="absolute top-14 right-3 z-50 w-72 max-w-[calc(100%-24px)] rounded-lg border border-pink-500/60 bg-slate-900 p-3 text-slate-100 shadow-2xl"
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onSubmit={event => { event.preventDefault(); measurements.apply() }} onKeyDown={event => event.stopPropagation()} onKeyDownCapture={event => {
      if (!event.currentTarget.contains(event.target as Node)) return
      if (event.key === 'Escape') { event.preventDefault(); measurements.close() }
    }}>
    <div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-semibold">{gap.axis === 'x' ? 'Horizontal' : 'Vertical'} gap</p><DocumentationHelp topic="editor/canvas/snapping#measure-and-edit-selection-gaps" compact /></div>
    <p className="mb-2 text-xs text-slate-300 break-words">Fixed: {names.get(gap.fixedId) ?? gap.fixedId}<br />Moving: {names.get(gap.movingId) ?? gap.movingId}</p>
    <label className="block text-xs">Gap (px)<CalculationNumberInput ref={input} aria-label="Gap (px)" step="any" required value={measurements.value}
      onChange={event => measurements.setValue(event.target.value)} className="mt-1 w-full rounded border border-slate-500 bg-slate-950 px-2 py-2 text-sm focus:border-pink-400 focus:outline-none" onCalculate={calculated => measurements.setValue(String(calculated))} /></label>
    <p className="mt-2 text-xs text-slate-400">Edge to edge in composition pixels. Negative values overlap. Other selected objects stay in place.</p>
    {measurements.error && <p role="alert" className="mt-2 text-xs text-rose-200">{measurements.error}</p>}
    <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={measurements.close} aria-label="Cancel gap edit"
      className="rounded border border-slate-500 px-3 py-2 text-xs">Cancel</button><button type="submit" aria-label="Apply gap edit" disabled={measurements.stale}
      className="rounded bg-pink-700 px-3 py-2 text-xs text-white disabled:opacity-40">Apply</button></div>
  </form>
}
