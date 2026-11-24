'use client'
import type { SplineOutlineController } from './useSplineOutline'
import type { OutlineSettings } from '@/lib/spline/outline'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'

const input = 'rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 disabled:opacity-40'
/** Progressive controls inside the existing Spline & Boolean dock. Replace is the default; Keep source explicitly appends. Invalid numeric text
 * disables Apply through domain validation.
 * Controls own no scene, worker, cache or persistence. */
export function SplineOutlineControls({ controller: c, expanded = false, title = 'Offset Path' }: { expanded?: boolean; title?: string; controller: SplineOutlineController }) {
  const change = <K extends keyof OutlineSettings>(key: K, value: OutlineSettings[K]) => c.setSettings(previous => ({ ...previous, [key]: value }))
  return <details open={expanded || c.active || undefined} className="rounded border border-gray-700 p-2" aria-label="Spline Offset Path">
    <summary className="cursor-pointer select-none font-semibold">{title}</summary>
    <div className="space-y-2 pt-2">
      <p className="text-gray-400">{c.eligible ? `${c.contourCount} contour(s) or edge chain(s) selected.` : c.selectionReason}</p>
      {!c.active ? <button type="button" className={input} disabled={c.disabled || !c.eligible} onClick={c.open}>Preview Offset</button> : <>
        <label className="flex items-center justify-between gap-2">Direction<select aria-label="Offset direction" className={input} value={c.settings.side} onChange={e => change('side', e.target.value as OutlineSettings['side'])}>
          {(c.closed ? ['inside', 'outside'] : ['left', 'right', 'both']).map(side => <option key={side} value={side}>{side === 'inside' ? 'Inset · Inside' : side === 'outside' ? 'Outset · Outside' : side[0].toUpperCase() + side.slice(1)}</option>)}
        </select></label>
        <OutlineNumber label="Offset distance" value={c.settings.distancePx} min={.01} max={10000} onChange={v => change('distancePx', v)} />
        <label className="flex items-center justify-between gap-2">Join<select aria-label="Offset join" className={input} value={c.settings.join} onChange={e => change('join', e.target.value as OutlineSettings['join'])}>
          <option value="miter">Miter</option><option value="bevel">Bevel</option><option value="round">Round</option>
        </select></label>
        {c.settings.join === 'miter' && <OutlineNumber label="Offset miter limit" value={c.settings.miterLimit} min={1} max={100} unit="×" onChange={v => change('miterLimit', v)} />}
        <OutlineNumber label="Offset curve tolerance" value={c.settings.tolerancePx} min={.05} max={5} onChange={v => change('tolerancePx', v)} />
        <label className="flex min-h-8 items-center gap-2"><input type="checkbox" aria-label="Keep Offset source" checked={c.keepSource}
          onChange={event => c.setKeepSource(event.target.checked)} />Keep source</label>
        <p className="text-gray-400">Composition px · {c.keepSource ? 'adds a new Object; source stays' : 'replaces selected contours or edge chains'}. Curves are approximated within the stated tolerance.</p>
        <p role="status">{c.pending ? 'Calculating Offset…' : c.result ? `${c.result.outputVertices} vertices · ${c.result.objects.length} result Object(s)` : ''}</p>
        {!!c.result?.bevelFallbacks && <p className="text-amber-200">{c.result.bevelFallbacks} miter join(s) use bevel at the chosen limit.</p>}
        {c.error && <p role="alert" className="text-amber-300">{c.error}</p>}
        <div className="flex gap-2"><button type="button" className={input + ' bg-blue-700'} disabled={!c.canApply} onClick={c.apply}>Apply Offset</button><button type="button" className={input} onClick={c.close}>Cancel Offset</button></div>
      </>}
    </div>
  </details>
}
/** Shared calculation widget; geometry is committed only by Apply, never by
 * input scrubbing. Units are logical composition pixels except miter ratio. */
function OutlineNumber({ label, value, min, max, unit = 'px', onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange(value: number): void }) {
  return <label className="flex items-center justify-between gap-2"><span>{label}</span><span className="flex items-center gap-1"><CalculationNumberInput aria-label={label} value={Number.isFinite(value) ? value : ''} min={min} max={max} step="any"
    className={input + ' w-24'} onCalculate={onChange} onChange={event => onChange(event.target.valueAsNumber)} />{unit}</span></label>
}
