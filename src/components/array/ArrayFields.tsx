import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { BooleanInput } from '../inputs/BooleanInput'
import type { ReactNode } from 'react'

/** Cohesive numeric form controls for the Array tool. Values are finite source
 * units; labels stay visible and identify the same keyboard-editable inputs. */
export function ArraySection({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="mb-3 border-b border-slate-700 pb-3"><legend className="mb-2 text-xs font-semibold text-slate-300">{title}</legend>{children}</fieldset>
}

/** No rounding/clamping is hidden in this input. The domain validates negative,
 * fractional and excessive counts with a visible diagnostic before Apply. */
export function ArrayNumber({ label, value, onChange, step = 'any' }: {
  label: string; value: number; onChange: (value: number) => void; step?: number | 'any'
}) {
  return <label className="mb-2 flex items-center gap-2 text-xs text-slate-300">{label}
    <CalculationNumberInput step={step} aria-label={`Array ${label}`} value={value}
      onChange={event => { const number = Number(event.target.value); if (Number.isFinite(number)) onChange(number) }}
      className="ml-auto w-24 rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-white focus:border-blue-400 focus:outline-none" onCalculate={calculated => { const number = calculated; if (Number.isFinite(number)) onChange(number) }} />
  </label>
}

/** Vector inputs in the explicitly selected Array coordinate space. */
export function ArrayVector({ label, value, onChange }: { label: string; value: { x: number; y: number }; onChange: (value: { x: number; y: number }) => void }) {
  return <div className="mb-2 grid grid-cols-2 gap-2"><ArrayNumber label={`${label} X`} value={value.x} onChange={x => onChange({ ...value, x })} />
    <ArrayNumber label={`${label} Y`} value={value.y} onChange={y => onChange({ ...value, y })} /></div>
}

/** Boolean field whose native label supplies pointer and keyboard alternatives. */
export function ArrayCheck({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <BooleanInput label={'Array ' + label} value={checked} disabled={disabled} onChange={onChange} />
}
