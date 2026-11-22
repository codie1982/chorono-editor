'use client'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import type { SplineFilletController } from './useSplineFillet'
const input = 'rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 disabled:opacity-40 focus-visible:outline focus-visible:outline-blue-300'

/** Progressive Point-mode controls in the existing dock. Preview settings own
 * no source/history; a visible diagnostic accompanies every refused Apply. */
export function SplineFilletControls({ controller: c, expanded = false }: { expanded?: boolean; controller: SplineFilletController }) {
  return <details open={expanded || c.active || undefined} className="rounded border border-gray-700 p-2" aria-label="Spline Fillet">
    <summary className="cursor-pointer select-none font-semibold">Fillet</summary>
    <div className="space-y-2 pt-2">
      <p className="text-gray-400">{c.eligible ? `${c.pointCount} corner(s) selected` : c.selectionReason}</p>
      {!c.active ? <button type="button" className={input} disabled={c.disabled || !c.eligible} onClick={c.open}>Preview Fillet</button> : <>
        <label className="flex items-center justify-between gap-2"><span>Radius</span><span className="flex items-center gap-1"><CalculationNumberInput aria-label="Fillet radius" value={Number.isFinite(c.settings.radiusPx) ? c.settings.radiusPx : ''} min={.1} max={10000} step="any" className={input + ' w-24'}
          onCalculate={radiusPx => c.setSettings({ radiusPx })} onChange={e => c.setSettings({ radiusPx: e.target.valueAsNumber })} />px</span></label>
        <p className="text-gray-400">Circular radius in composition px. Original curves stay Bézier. Tangent arcs replace corners; ambiguous or overlapping solutions refuse.</p>
        <p role="status">{c.pending ? 'Calculating Fillet…' : c.result ? `${c.result.cuts.length} rounded corner(s) · preview only` : ''}</p>
        {c.error && <p role="alert" className="text-amber-300">{c.error}</p>}
        <div className="flex gap-2"><button type="button" className={input + ' bg-blue-700'} disabled={!c.canApply} onClick={c.apply}>Apply Fillet</button><button type="button" className={input} onClick={c.close}>Cancel Fillet</button></div>
      </>}
    </div>
  </details>
}
