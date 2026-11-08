import type { MotionDrawSettings } from './types'

interface Props {
  settings: MotionDrawSettings
  onChange: (settings: MotionDrawSettings) => void
  pointCount: number
  durationMs: number
  canApply: boolean
  onApply: () => void
  onClear: () => void
  onCancel: () => void
}

/** Bounded click-to-place route settings with explicit time/distribution and
 * replacement scope. Draft points/preview remain transient until Apply; Cancel
 * never edits native keys. The domain validates collisions and point limits. */
export function MotionDrawingPanel(props: Props) {
  const { settings, onChange } = props
  return <fieldset className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-700 pt-2">
    <legend className="text-xs text-slate-200">Route preview · {props.pointCount}/128 points · click canvas to place</legend>
    {([['startMs', 'Start ms'], ['endMs', 'End ms']] as const).map(([field, text]) => <label key={field} className="flex flex-col gap-0.5 text-xs text-slate-300">{text}
      <input aria-label={`Draw motion ${text}`} type="number" min={0} max={props.durationMs} step="any" value={settings[field]}
        onChange={event => onChange({ ...settings, [field]: Number(event.target.value) })}
        className="w-20 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-white" />
    </label>)}
    <label className="flex flex-col gap-0.5 text-xs text-slate-300">Timing
      <select aria-label="Draw motion timing" value={settings.distribution} onChange={event => onChange({ ...settings, distribution: event.target.value as MotionDrawSettings['distribution'] })}
        className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-white"><option value="equal-time">Equal time</option><option value="distance">By distance</option></select>
    </label>
    <label className="flex flex-col gap-0.5 text-xs text-slate-300">Existing keys
      <select aria-label="Draw motion existing keys" value={settings.mode} onChange={event => onChange({ ...settings, mode: event.target.value as MotionDrawSettings['mode'] })}
        className="rounded border border-slate-600 bg-slate-950 px-2 py-1 text-white"><option value="append">Append · reject collisions</option><option value="replace-range">Replace start–end range</option></select>
    </label>
    <button type="button" disabled={!props.canApply} onClick={props.onApply} className="min-h-8 rounded bg-sky-700 px-3 text-xs text-white disabled:opacity-40">Apply route</button>
    <button type="button" disabled={!props.pointCount} onClick={props.onClear} className="min-h-8 rounded border border-slate-600 px-2 text-xs">Clear points</button>
    <button type="button" onClick={props.onCancel} className="min-h-8 rounded border border-slate-600 px-2 text-xs">Cancel route</button>
  </fieldset>
}
