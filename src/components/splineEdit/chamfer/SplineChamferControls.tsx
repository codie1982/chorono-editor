'use client'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import type { SplineChamferController } from './useSplineChamfer'
const input = 'rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 disabled:opacity-40 focus-visible:outline focus-visible:outline-blue-300'

/** Progressive Point-mode controls in the existing dock. Preview settings own
 * no source/history; a visible diagnostic accompanies every refused Apply. */
export function SplineChamferControls({ controller: c }: { controller: SplineChamferController }) {
  return <details open={c.active || undefined} className="rounded border border-gray-700 p-2" aria-label="Spline Chamfer">
    <summary className="cursor-pointer select-none font-semibold">Chamfer</summary>
    <div className="space-y-2 pt-2">
      <p className="text-gray-400">{c.eligible ? `${c.pointCount} corner(s) selected` : c.selectionReason}</p>
      {!c.active ? <button type="button" className={input} disabled={c.disabled || !c.eligible} onClick={c.open}>Preview Chamfer</button> : <>
        <label className="flex items-center justify-between gap-2"><span>Cut distance</span><span className="flex items-center gap-1"><CalculationNumberInput aria-label="Chamfer distance" value={Number.isFinite(c.settings.distancePx) ? c.settings.distancePx : ''} min={.1} max={10000} step="any" className={input + ' w-24'}
          onCalculate={distancePx => c.setSettings({ distancePx })} onChange={e => c.setSettings({ distancePx: e.target.valueAsNumber })} />px</span></label>
        <p className="text-gray-400">Distance along each adjacent edge in composition px. Curves stay Bézier; corners become straight bevels. Overlapping cuts refuse.</p>
        <p role="status">{c.pending ? 'Calculating Chamfer…' : c.result ? `${c.result.cuts.length} bevel(s) · preview only` : ''}</p>
        {c.error && <p role="alert" className="text-amber-300">{c.error}</p>}
        <div className="flex gap-2"><button type="button" className={input + ' bg-blue-700'} disabled={!c.canApply} onClick={c.apply}>Apply Chamfer</button><button type="button" className={input} onClick={c.close}>Cancel Chamfer</button></div>
      </>}
    </div>
  </details>
}
