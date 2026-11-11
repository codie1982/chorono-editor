'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NumericPropertyInput } from './NumericPropertyContext'
import { inspectNumericFormula, numericInputExpression, type NumericConstraints } from '@/lib/editor/inputExpressions/NumericInputExpression'
import { makeNumericExpressionCommand, numericExpressionBlock, numericExpressionConstraints } from '@/lib/editor/inputExpressions/NumericExpressionCommand'
import { readPropertyPath } from '@/lib/scene/properties/readPropertyPath'

/** Explicit draft editor for A1 constant numeric recipes. Apply/Convert alone
 * commit. Stale source keeps the draft and requires Review current source;
 * invalid/animated/driven inputs preserve keys and values. Native dialog owns
 * modal focus; cleanup returns focus without committing a numeric blur draft. */
export function NumericFormulaEditor({ input, limits, initialFormula, onClose }: { initialFormula?: string; input: NumericPropertyInput; limits: NumericConstraints; onClose(): void }) {
  const initial = useRef(input.getScene()), [expected, setExpected] = useState(initial.current)
  const layer = expected.layers.find(item => item.id === input.layerId)
  const saved = layer && numericInputExpression(layer, input.path)
  const [formula, setFormula] = useState(initialFormula ?? saved?.formula ?? String((layer && readPropertyPath(layer, input.path)) ?? 0))
  const [error, setError] = useState(''), dialog = useRef<HTMLDialogElement>(null), heading = useId()
  let constraints = limits
  try { if (layer) { const rule = numericExpressionConstraints(layer, input.path); constraints = { min: Math.max(rule.min ?? -Infinity, limits.min ?? -Infinity), max: Math.min(rule.max ?? Infinity, limits.max ?? Infinity) } } } catch { /* The blocked reason below describes capability. */ }
  const result = inspectNumericFormula(formula, constraints)
  const stale = input.getScene() !== expected
  const blocked = !layer ? 'The target layer no longer exists.' : numericExpressionBlock(expected, layer, input.path)
  const activeGesture = input.isTransactionActive?.() ?? false
  useEffect(() => {
    const previous = document.activeElement, element = dialog.current!
    element.showModal()
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  /** Recheck synchronously at the final command boundary, including native
   * gesture ownership; a failed attempt leaves the text draft editable. */
  const apply = (value: string | null) => {
    try {
      if (input.isTransactionActive?.()) throw new Error('Finish the active gesture before applying a formula.')
      input.dispatch(makeNumericExpressionCommand(expected, input.layerId, input.path, value, limits)); onClose()
    } catch (failure) { setError((failure as Error).message) }
  }
  return createPortal(<dialog ref={dialog} aria-labelledby={heading} className="w-[min(440px,90vw)] rounded-lg border border-gray-600 bg-gray-900 p-4 text-gray-100 shadow-2xl backdrop:bg-black/50"
    onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => event.stopPropagation()}>
    <h2 id={heading} className="text-sm font-semibold">Expression · {input.label}</h2>
    <p className="my-2 text-xs text-gray-400">Evaluated when applied · pi/e available · trig uses radians.</p>
    <p className="mb-2 text-xs text-gray-400">Values use this field's units.{Number.isFinite(constraints.min) ? ` Minimum: ${constraints.min}.` : ''}{Number.isFinite(constraints.max) ? ` Maximum: ${constraints.max}.` : ''}</p>
    <label className="block text-xs">Formula
      <input autoFocus aria-label={`Formula for ${input.label}`} value={formula} maxLength={4096} onChange={event => { setFormula(event.target.value); setError('') }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!result.error && !blocked && !stale && !activeGesture) apply(formula) } }}
        className="my-2 w-full rounded border border-gray-600 bg-gray-950 p-2 font-mono text-sm focus:outline focus:outline-blue-400" />
    </label>
    <output className="block text-sm" aria-live="polite">{result.error ?? `Result: ${result.value}`}</output>
    {blocked && <p className="mt-2 text-xs text-amber-300">{blocked}</p>}
    {(stale || error) && <p role="alert" className="mt-2 text-xs text-amber-300">{error || 'Source changed. Review its current value before applying this draft.'}</p>}
    {activeGesture && <p className="mt-2 text-xs text-amber-300">Finish the active gesture first.</p>}
    {stale && <button type="button" onClick={() => { setExpected(input.getScene()); setError('') }} className="mt-2 text-xs underline">Review current source</button>}
    <div className="mt-4 flex flex-wrap justify-end gap-2 text-xs">
      {saved && <button type="button" disabled={stale || activeGesture} onClick={() => apply(null)} className="rounded border border-gray-600 p-2 disabled:opacity-40">Convert to value</button>}
      <button type="button" onClick={onClose} className="rounded border border-gray-600 p-2">Cancel</button>
      <button type="button" disabled={!!result.error || !!blocked || stale || activeGesture} onClick={() => apply(formula)} className="rounded bg-blue-600 p-2 disabled:opacity-40">Apply formula</button>
    </div>
  </dialog>, document.body)
}
