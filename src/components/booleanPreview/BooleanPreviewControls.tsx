'use client'
import type { BooleanOperation } from '@/lib/geometry/boolean'
import type { BooleanPreviewController } from './useBooleanPreview'

const input = 'rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 focus-visible:outline focus-visible:outline-blue-300'
/** Compact progressive-disclosure preview controls. A is explicitly named and
 * B is the union of remaining inputs for subtraction. Neutral overlay represents
 * area geometry, not the source paint/masks/effects. Cancel never dispatches an editor command. Apply commits a protected recipe
 * and original sources as one Undo; generated geometry is runtime-only. */
export function BooleanPreviewControls({ controller: c }: { controller: BooleanPreviewController }) {
  if (c.targets.length < 2) return null
  return <section aria-label="Boolean preview" className="shrink-0 border-b border-gray-700 p-3 space-y-2 text-xs text-gray-300">
    <div className="flex items-center justify-between gap-2"><span className="font-semibold">{c.selectedOperationId ? 'Boolean operation' : 'Boolean preview'}</span>
      <button type="button" className={input} disabled={c.disabled || c.targets.length > 8} onClick={c.active ? c.close : c.open}>{c.active ? 'Close preview' : c.selectedOperationId ? 'Edit Operation' : 'Preview Boolean'}</button></div>
    {!c.active ? <p className="text-gray-400">Select 2–8 closed shapes, splines or spline Objects. Source geometry stays editable.</p> : <>
      <label className="flex items-center gap-2">Operation<select aria-label="Boolean operation" className={input + ' flex-1'} value={c.operation} onChange={event => c.setOperation(event.target.value as BooleanOperation)}>
        <option value="union">Union · A ∪ B</option><option value="subtract">Subtract</option><option value="intersect">Intersect · A ∩ B</option>
      </select></label>
      <p className="break-words">A: {c.targets[0]?.label}<br />B: {c.targets.slice(1).map(target => target.label).join(' + ')}</p>
      {c.operation === 'subtract' && <label className="flex items-center gap-2">Order<select aria-label="Boolean subtraction order" className={input + ' flex-1'} value={c.reverse ? 'ba' : 'ab'} onChange={event => c.setReverse(event.target.value === 'ba')}><option value="ab">A − B</option><option value="ba">B − A</option></select></label>}
      <label className="flex items-center gap-2">Curve tolerance<input aria-label="Boolean curve tolerance" type="number" min="0.01" max="10" step="0.05" className={input + ' w-20'} value={c.tolerancePx} onChange={event => c.setTolerance(event.target.valueAsNumber)} /> px</label>
      <div role="status" aria-live="polite">{c.pending ? 'Calculating preview…' : c.result ? c.result.polygons ? `${c.result.polygons} areas · ${c.result.holes} holes · ${c.result.outputVertices} vertices` : 'No area · valid empty result' : ''}</div>
      {c.error && <p role="alert" className="text-amber-300">{c.error}</p>}
      {c.applyReason && <p className="text-amber-300">{c.applyReason}</p>}
      <div className="flex gap-2"><button type="button" className={input + ' bg-blue-700'} disabled={!c.canApply} onClick={c.apply}>Apply Boolean</button><button type="button" className={input} onClick={c.close}>Cancel</button></div>
      <p className="text-gray-400">Purple overlay: area geometry. Apply keeps original sources under an operation group; the result uses A’s paint. Independent input animation is preserved by refusing Apply.</p>
    </>}
  </section>
}
