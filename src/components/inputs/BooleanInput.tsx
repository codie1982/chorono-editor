'use client'
import { usePropertyExpressionField } from './expressions/usePropertyExpressionField'

/** Native toggle with a separate shared fx action. Literal clicks never open a
 * modal, and saved/live recipes require explicit Convert before literal edits. */
export function BooleanInput({ value, onChange, propertyPath, label, help, disabled }: {
  value: boolean; onChange(value: boolean): void; propertyPath?: string; label: string; help?: string; disabled?: boolean
}) {
  const field = usePropertyExpressionField('boolean', value, propertyPath, label, { onResult: result => onChange(result as boolean), disabled })
  return <div className="min-w-0 text-xs text-gray-300"><div className="flex items-center gap-2">
    <label className="flex min-h-7 flex-1 items-center gap-2 cursor-pointer">
      <input type="checkbox" aria-label={label} checked={field.value === true} disabled={disabled || field.readOnly} onChange={event => onChange(event.target.checked)} className="accent-blue-500 focus-visible:outline focus-visible:outline-blue-400" />
      <span>{label}</span>
    </label>{field.button}
  </div>{help && <p className="text-gray-400">{help}</p>}{field.diagnostics}</div>
}
