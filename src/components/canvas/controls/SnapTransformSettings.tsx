import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'

/** Independent angle/scale precision controls. The owning snap hook validates
 * and stores settings; this panel owns no geometry, transforms or history. */
export function SnapTransformSettings({ kind, enabled, step, onEnabled, onStep }: {
  kind: 'rotation' | 'scale'; enabled: boolean; step: number
  onEnabled?: (value: boolean) => void; onStep?: (value: number) => void
}) {
  const rotation = kind === 'rotation', label = rotation ? 'Rotation step' : 'Scale step'
  return <div role="tabpanel" aria-label={rotation ? 'Rotation snapping' : 'Scale snapping'} className="space-y-3 p-3 text-xs text-gray-200">
    <label className="flex min-h-9 items-center gap-2"><input type="checkbox" aria-label={rotation ? 'Enable rotation snapping' : 'Enable scale snapping'} checked={enabled} disabled={!onEnabled}
      onChange={event => onEnabled?.(event.target.checked)} className="accent-blue-500" />
      {rotation ? 'Enable rotation snapping' : 'Enable scale snapping'}</label>
    <label className="flex items-center justify-between gap-3">{label}<span className="flex items-center gap-1">
      <CalculationNumberInput aria-label={label} min={1} max={rotation ? 180 : 100} step="any" value={step}
        disabled={!enabled || !onStep} onChange={event => onStep?.(Number(event.target.value))} onCalculate={value => onStep?.(value)}
        className="w-24 rounded border border-gray-600 bg-gray-800 px-2 py-1 disabled:opacity-40" />{rotation ? '°' : '%'}</span></label>
    <div className="flex gap-2">{(rotation ? [15, 45, 90] : [5, 10, 25]).map(value => <button key={value}
      aria-label={`Set ${kind} snap step to ${value}${rotation ? ' degrees' : ' percent'}`} aria-pressed={step === value}
      disabled={!enabled || !onStep} onClick={() => onStep?.(value)} className="rounded border border-gray-600 px-3 py-1 hover:bg-gray-700 disabled:opacity-40">{value}{rotation ? '°' : '%'}</button>)}</div>
    <p className="text-[11px] leading-relaxed text-gray-400">{rotation
      ? 'Local angle for one object; rotation delta around the shared pivot for a selection.'
      : 'Scale gizmo increments relative to the starting size. A 10% step gives 100%, 110%, 120%…'}</p>
    <p className="text-[11px] text-gray-400">Independent of Move snapping.</p>
  </div>
}
