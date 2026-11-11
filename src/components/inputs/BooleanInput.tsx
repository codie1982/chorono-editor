'use client'
import { useEffect, useState } from 'react'
import { useNumericPropertyInput } from './expressions/NumericPropertyContext'
import { PropertyFormulaEditor } from './expressions/PropertyFormulaEditor'
import { propertyExpressionConstraints } from '@/lib/expression/properties/PropertyExpressionCapability'

/** Native boolean control with a separate formula affordance. Clicking the
 * label/checkbox never opens a modal or performs a double-click toggle trick.
 * Live values share the inspector frame and lock literal edits until explicit
 * Convert/Remove. No timers/evaluation loops are owned by a checkbox. */
export function BooleanInput({ value, onChange, propertyPath, label, help }: {
  value: boolean; onChange(value: boolean): void; propertyPath: string; label: string; help?: string
}) {
  const input = useNumericPropertyInput(propertyPath, label), live = input?.layer?.propertyExpressions?.fields[propertyPath]
  const key = input ? JSON.stringify([input.layerId, propertyPath]) : ''
  const target = input ? 'layers.' + input.layerId + '.' + propertyPath : ''
  const evaluated = live && input?.frame?.overrides.get(target)
  const shown = typeof evaluated === 'boolean' ? evaluated : value
  const error = live && (input?.frame?.expressionErrors?.get(target) ?? input?.frame?.expressionErrors?.get('scene'))
  let formulaSupported = false
  try { if (input?.layer) { propertyExpressionConstraints(input.layer, propertyPath, 'boolean'); formulaSupported = true } } catch { /* Keep unsupported controls on their existing literal contract. */ }
  const [editing, setEditing] = useState<string | null>(null)
  useEffect(() => { setEditing(null) }, [key])
  return <div className="min-w-0 text-xs text-gray-300">
    <div className="flex items-center gap-2">
      <label className="flex min-h-7 flex-1 items-center gap-2 cursor-pointer">
        <input type="checkbox" aria-label={label} checked={shown} disabled={!!live} onChange={event => onChange(event.target.checked)} className="accent-blue-500 focus-visible:outline focus-visible:outline-blue-400" />
        <span>{label}</span>
      </label>
      {input && (formulaSupported || live) && <button type="button" aria-label={'Edit expression for ' + label} onClick={() => setEditing(key)} title={live ? 'Live boolean formula: ' + live.formula : 'Edit a boolean formula'}
        className={'h-7 w-8 rounded border border-gray-600 focus-visible:outline focus-visible:outline-blue-400 ' + (live ? 'bg-violet-900/50 text-violet-200' : 'text-gray-300 hover:bg-gray-700')}>fx</button>}
    </div>
    {help && <p className="text-gray-400">{help}</p>}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {editing === key && input && <PropertyFormulaEditor key={key} input={input} limits={{}} kind="boolean" onClose={() => setEditing(null)} />}
  </div>
}
