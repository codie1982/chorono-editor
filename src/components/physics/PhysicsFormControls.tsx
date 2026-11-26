import type { ReactNode } from 'react'

export const labelClass = 'flex flex-col gap-1 text-xs leading-5 text-gray-400'
export const inputClass = 'min-h-11 w-full rounded border border-gray-600 bg-gray-800 px-2 py-2 text-xs text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
export const toggleRowClass = 'flex min-h-11 items-center gap-2 rounded border border-gray-700 bg-gray-950/40 px-3 py-2 text-xs leading-5 text-gray-300 focus-within:ring-2 focus-within:ring-blue-400'

/** Groups one cohesive physics setting area without owning form state. */
export function PhysicsFieldset({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="space-y-2 rounded border border-gray-700 bg-gray-950/35 p-3">
    <legend className="px-1 text-xs font-semibold text-gray-200">{title}</legend>
    {children}
  </fieldset>
}

/** Labelled numeric field with a visible unit and a 44 px interaction target. */
export function PhysicsNumberField({ label, unit, value, onChange, min, max, step = 'any' }: {
  label: string
  unit: string
  value: number
  onChange(value: number): void
  min?: number
  max?: number
  step?: number | 'any'
}) {
  return <label className={labelClass}>
    <span className="flex justify-between gap-2"><span>{label}</span><span className="text-xs text-gray-500">{unit}</span></span>
    <input aria-label={`${label} (${unit})`} type="number" value={Number.isNaN(value) ? '' : value}
      min={min} max={max} step={step}
      onChange={event => onChange(event.target.value === '' ? NaN : Number(event.target.value))}
      className={`${inputClass} font-mono tabular-nums`} />
  </label>
}

/** Inline status or recovery message; meaning is expressed by text, not colour alone. */
export function PhysicsInlineNotice({ children, tone = 'neutral' }: {
  children: ReactNode
  tone?: 'neutral' | 'warning'
}) {
  return <p className={`rounded border p-2 text-xs leading-5 ${tone === 'warning'
    ? 'border-amber-800 bg-amber-950/25 text-amber-200'
    : 'border-gray-700 bg-gray-950/40 text-gray-400'}`}>{children}</p>
}
