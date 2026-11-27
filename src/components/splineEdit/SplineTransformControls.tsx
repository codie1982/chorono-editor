'use client'
import { useState } from 'react'
import { CalculationNumberInput } from '../inputs/CalculationNumberInput'

/** Delta-only local transform form. Apply makes one undoable geometry command;
 * values are UI state, never serialized transform layers or animation channels.
 * Selection changes remount the form in its host. Positive nonzero scale only. */
export function SplineTransformControls({ disabled, onApply }: { disabled: boolean;
  onApply(value: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }): void }) {
  const [values, setValues] = useState({ x: 0, y: 0, rotation: 0, scaleX: 100, scaleY: 100 })
  return <fieldset disabled={disabled} className="space-y-2 rounded border border-gray-700 p-2">
    <legend>Selection transform · local</legend>
    <div className="grid grid-cols-2 gap-2">{(['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const).map(field => <label key={field} className="space-y-1">
      <span>{({ x: 'Move X (px)', y: 'Move Y (px)', rotation: 'Rotate (°)', scaleX: 'Scale X (%)', scaleY: 'Scale Y (%)' })[field]}</span>
      <CalculationNumberInput aria-label={`Spline selection ${field}`} step="any" min={field.startsWith('scale') ? .01 : undefined}
        className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-gray-100" value={values[field]}
        onCalculate={value => { if (Number.isFinite(value)) setValues(before => ({ ...before, [field]: value })) }}
        onChange={event => { if (event.target.value !== '' && Number.isFinite(+event.target.value)) setValues(before => ({ ...before, [field]: +event.target.value })) }} />
    </label>)}</div>
    <button type="button" className="rounded border border-blue-500 px-2 py-1.5 disabled:opacity-40" onClick={() => {
      onApply({ ...values, scaleX: values.scaleX / 100, scaleY: values.scaleY / 100 })
    }}>Apply selection transform</button>
    <p className="text-gray-400">Around the selected anchors’ center. Move, Rotate and Scale tools also drag the selected geometry.</p>
  </fieldset>
}
