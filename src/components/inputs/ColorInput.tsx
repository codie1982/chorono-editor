'use client'
import { useEffect, useRef, useState } from 'react'
import { usePropertyExpressionField } from './expressions/usePropertyExpressionField'
import { parseAnimatableColor, animatableColorToCss } from '@/lib/color/ColorValue'

interface Props { value: string; onChange(value: string): void; propertyPath?: string; fieldLabel?: string }

/** Native color/text picker plus shared formula affordance. CSS/alpha values
 * retain their text representation; the native picker borrows an opaque RGB
 * swatch. Read-only formulas cannot accidentally trigger a picker or literal
 * source write. No expression runs in the color input itself. */
export default function ColorInput({ value, onChange, propertyPath, fieldLabel }: Props) {
  const picker = useRef<HTMLInputElement>(null), dirty = useRef(false), latest = useRef(value)
  const [draft, setDraft] = useState(value), [error, setError] = useState('')
  const field = usePropertyExpressionField('color', value, propertyPath, fieldLabel, {
    onResult: result => onChange(animatableColorToCss(result)),
    onOpen: () => { dirty.current = false; setDraft(latest.current); setError('') },
  })
  const identity = useRef(field.identity)
  const shown = typeof field.value === 'string' ? field.value : animatableColorToCss(field.value)
  if (latest.current !== shown || identity.current !== field.identity) dirty.current = false
  identity.current = field.identity
  latest.current = shown
  useEffect(() => { dirty.current = false; setDraft(shown); setError('') }, [shown, field.identity])
  /** Validate the entire CSS literal before one source write. Invalid drafts
   * retain the authored color and remain editable; native picker writes RGB. */
  const commit = () => {
    if (!dirty.current) return
    dirty.current = false
    if (!parseAnimatableColor(draft)) { setError('Enter a supported CSS color.'); return }
    setError(''); if (draft !== latest.current) onChange(draft)
  }
  const color = parseAnimatableColor(shown), hex = color ? '#' + [color.r, color.g, color.b].map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('') : '#000000'
  return <div className="min-w-0"><div className="flex items-center gap-1">
    <div className="flex min-w-0 flex-1 rounded border border-gray-600 overflow-hidden focus-within:border-blue-500">
      <button type="button" disabled={field.readOnly} onClick={event => { event.preventDefault(); picker.current?.click() }} aria-label={fieldLabel ? 'Pick ' + fieldLabel : 'Pick colour'}
        className="shrink-0 w-10 h-8 cursor-pointer border-r border-gray-600 disabled:cursor-default focus-visible:outline focus-visible:outline-blue-400" style={{ background: shown }} title="Pick colour" />
      <input ref={picker} type="color" value={hex} disabled={field.readOnly} onChange={event => onChange(event.target.value)} className="sr-only" tabIndex={-1} />
      <input aria-label={fieldLabel} type="text" value={draft} readOnly={field.readOnly} onChange={event => { dirty.current = true; setDraft(event.target.value); setError('') }} maxLength={512}
        aria-invalid={!!error} onBlur={commit} onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur() }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dirty.current = false; setDraft(latest.current); setError(''); event.currentTarget.blur() }
        }}
        className="min-w-0 flex-1 bg-gray-800 px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus-visible:outline-blue-400" />
    </div>{field.button}
  </div>{error && <p role="alert" className="mt-1 text-xs text-amber-300">{error}</p>}{field.diagnostics}</div>
}
