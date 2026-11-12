'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { usePropertyExpressionField } from './expressions/usePropertyExpressionField'

/** String/enum property adapter. Text editing and option selection remain
 * native; complete text drafts commit once on blur/Enter (Ctrl+Enter for
 * multiline), Escape cancels. fx opens separately without triggering the label's literal control. */
export function TextInput({ value, onChange, propertyPath, fieldLabel, options, suggestions, className = '', multiline = false }: {
  value: string; onChange(value: string): void; propertyPath?: string; fieldLabel?: string;
  options?: readonly { value: string; label: string }[]; suggestions?: readonly string[]; className?: string; multiline?: boolean
}) {
  const suggestionsId = useId()
  const [draft, setDraft] = useState(value), dirty = useRef(false), latest = useRef(value)
  const field = usePropertyExpressionField('string', value, propertyPath, fieldLabel, {
    onResult: result => onChange(result as string), options: options?.map(option => option.value),
    onOpen: () => { dirty.current = false; setDraft(latest.current) },
  })
  const identity = useRef(field.identity)
  const shown = String(field.value)
  if (latest.current !== shown || identity.current !== field.identity) dirty.current = false
  identity.current = field.identity
  latest.current = shown
  useEffect(() => { dirty.current = false; setDraft(shown) }, [shown, field.identity])
  /** Commit one complete literal; selection changes invalidate pending drafts. */
  const commit = () => { if (!dirty.current) return; dirty.current = false; if (draft !== latest.current) onChange(draft) }
  const events = {
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { dirty.current = true; setDraft(event.target.value) },
    onBlur: commit,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dirty.current = false; setDraft(latest.current); event.currentTarget.blur() }
      if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur() }
    },
  }
  const style = 'min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-100 focus-visible:outline focus-visible:outline-blue-400 ' + className
  return <div className="min-w-0"><div className="flex items-start gap-1">
    {options ? <select aria-label={fieldLabel} value={String(field.value)} disabled={field.readOnly} onChange={event => onChange(event.target.value)} className={style}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select> : multiline ? <textarea aria-label={fieldLabel} value={draft} readOnly={field.readOnly} {...events} className={style} />
      : <input aria-label={fieldLabel} type="text" list={suggestions ? suggestionsId : undefined} value={draft} readOnly={field.readOnly} {...events} className={style} />}
    {suggestions && <datalist id={suggestionsId}>{suggestions.map(value => <option key={value} value={value} />)}</datalist>}{field.button}
  </div>{field.diagnostics}</div>
}
