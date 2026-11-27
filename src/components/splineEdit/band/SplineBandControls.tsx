'use client'
import type { SplineBandController } from './useSplineBand'
import { bandSettingsFields } from '@/lib/spline/band/settingsFields'
import { ModifierSettingsForm } from '@/components/editorGeometry/ModifierSettingsForm'
const button = 'min-h-8 rounded border border-gray-600 px-2 py-1.5 text-xs disabled:opacity-40'
/** Geometry-only native Outline form over the shared class/field schema. Paint
 * is independently editable in Properties after Apply; no scene writes here. */
export function SplineBandControls({ controller: c }: { controller: SplineBandController }) {
  return <details open={c.active || undefined} aria-label="Spline Outline band" className="rounded border border-gray-700 p-2">
    <summary className="cursor-pointer font-semibold">Outline · Live</summary>
    <div className="space-y-2 pt-2"><p className="text-gray-400">{c.eligible ? `${c.chainCount} selected chain(s)` : c.selectionReason}</p>
      {!c.active ? <button type="button" className={button} disabled={c.disabled || !c.eligible} onClick={c.open}>Preview Outline</button> : <>
        <ModifierSettingsForm descriptor={{ type: 'outlineBand', label: 'Outline', category: 'spline', addable: false, fields: bandSettingsFields }} assets={[]}
          settings={c.settings} onChange={patch => c.setSettings(previous => ({ ...previous, ...patch }))} />
        <p className="text-gray-400">Local px · source points stay editable. Apply saves a live Outline; moving the source updates its band automatically. Open contours use Center / Left / Right. All source Objects using this Outline share its settings; appearance is in Properties.</p>
        <p role="status">{c.pending ? 'Calculating Outline…' : c.result ? `${c.result.outputVertices} vertices` : ''}</p>
        {!!c.result?.bevelFallbacks && <p className="text-amber-200">{c.result.bevelFallbacks} miter join(s) fall back to bevel.</p>}
        {c.error && <p role="alert" className="text-amber-300">{c.error}</p>}
        <div className="flex gap-2"><button type="button" className={button + ' border-orange-400'} disabled={!c.canApply} onClick={c.apply}>Apply Outline</button><button type="button" className={button} onClick={c.close}>Cancel Outline</button></div>
      </>}
    </div>
  </details>
}
