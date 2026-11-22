import { useEffect, useRef, useState } from 'react'
import type { ShapeStroke } from '@/lib/types'
import { activeStrokeDash, parseStrokeDash, strokeStyle, withStrokeStyle, type StrokeStyle } from '@/lib/paint/strokeStyle'
import { PaintNumber, paintSelectClass } from './ImagePaintControls'

/** One native style update per committed dash edit. Solid retains the inactive
 * sequence; invalid text/zero-only lengths never replace valid authored paint. */
export function StrokeDashControls({ stroke, onChange }: { stroke: ShapeStroke; onChange(stroke: ShapeStroke): void }) {
  const cancelBlur = useRef(false)
  const [draft, setDraft] = useState((stroke.dashArray ?? []).join(', ')), [error, setError] = useState('')
  useEffect(() => { setDraft((stroke.dashArray ?? []).join(', ')); setError('') }, [stroke.dashArray])
  const enabled = activeStrokeDash(stroke).length > 0, sequence = stroke.dashArray?.length ? stroke.dashArray : [Math.max(1, stroke.width) * 3, Math.max(1, stroke.width) * 2]
  const apply = (values: number[]) => {
    try { parseStrokeDash(values.join(',')); onChange({ ...stroke, dashEnabled: true, dashArray: values }); setError('') }
    catch (error) { setError(String(error instanceof Error ? error.message : error)) }
  }
  const commit = () => {
    if (cancelBlur.current) { cancelBlur.current = false; return }
    if (draft === (stroke.dashArray ?? []).join(', ')) return
    try { apply(parseStrokeDash(draft)) } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
  }
  return <div className="space-y-2">
    <label className="block space-y-1">Stroke Style<select aria-label="Spline stroke style" value={strokeStyle(stroke)} className={paintSelectClass}
      onChange={event => onChange(withStrokeStyle(stroke, event.target.value as StrokeStyle))}>
      <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
    </select></label>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" aria-label="Dashed line enabled" checked={enabled}
      onChange={event => onChange(event.target.checked ? withStrokeStyle(stroke, 'dashed') : withStrokeStyle(stroke, 'solid'))} />Dashed Line</label>
    {enabled && <>
      <div className="grid grid-cols-2 gap-2">
        <PaintNumber label="Dash length" unit="px" min={0} value={sequence[0]} onChange={value => apply([value, ...sequence.slice(1)])} />
        <PaintNumber label="Gap length" unit="px" min={0} value={sequence[1] ?? sequence[0]} onChange={value => apply([sequence[0], value, ...sequence.slice(2)])} />
      </div>
      <label className="block space-y-1 text-xs">Dash Sequence<input aria-label="Dash sequence" value={draft} placeholder="8, 4, 2, 4" className={paintSelectClass}
        onChange={event => { setDraft(event.target.value); setError('') }} onBlur={commit} onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelBlur.current = true; setDraft(sequence.join(', ')); setError(''); event.currentTarget.blur() }
        }} /></label>
    </>}
    {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
  </div>
}
