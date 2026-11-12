'use client'
import { useRef, useState } from 'react'
import { expressionPrograms } from '@/lib/core/expression/ExpressionProgramCache'
import { evaluateTypedExpression } from '@/lib/core/expression/ExpressionInterpreter'
import { validateExpressionResult, type ExpressionValue, type ExpressionValueType } from '@/lib/core/expression/ExpressionValue'
import { sameInputExpressionValue, inputExpressionValue } from '@/lib/editor/inputExpressions/InputExpression'
import { ExpressionDialog } from './ExpressionDialog'

interface CalculationProps {
  label: string; value: unknown; kind: ExpressionValueType; onResult(value: ExpressionValue): void
  min?: number; max?: number; options?: readonly string[]; disabled?: boolean; onOpen?(): void
}

/** Explicit calculate-once alternative for operation/configuration controls.
 * The parent keeps its original validated commit workflow; formula text is a
 * transient draft and this UI says so. No fake layer, timer or hidden recipe. */
export function CalculationButton(props: CalculationProps) {
  const [editing, setEditing] = useState(false)
  return <><button type="button" aria-label={'Calculate ' + props.label} title="Calculate once" disabled={props.disabled}
    onMouseDown={event => event.preventDefault()} onClick={event => { event.preventDefault(); event.stopPropagation(); props.onOpen?.(); setEditing(true) }}
    className="h-7 w-7 shrink-0 rounded border border-gray-600 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-40 focus-visible:outline focus-visible:outline-blue-400">fx</button>
    {editing && <CalculationEditor {...props} onClose={() => setEditing(false)} />}</>
}

/** Capture a review value; preserve the draft on concurrent value changes and
 * require an explicit review. Apply uses the latest callback exactly once.
 * Only own whitelist context `value`, pi/e is available; no implicit scene/time. */
function CalculationEditor({ onClose, ...props }: CalculationProps & { onClose(): void }) {
  const latest = useRef(props); latest.current = props
  const [expected, setExpected] = useState(props.value), [formula, setFormula] = useState(() => {
    if (props.kind === 'number' || props.kind === 'boolean') return String(props.value)
    if (props.kind === 'vec2' && props.value && typeof props.value === 'object' && 'x' in props.value && 'y' in props.value) return `vec2(${props.value.x},${props.value.y})`
    return JSON.stringify(props.value ?? '')
  }), [error, setError] = useState('')
  const stale = !sameInputExpressionValue(expected, props.value, props.kind)
  let result: ExpressionValue | null = null, diagnostic = ''
  try {
    const program = expressionPrograms.get(formula)
    if (!program.ast) throw new Error(program.error ?? 'Invalid formula')
    result = validateExpressionResult(props.kind, evaluateTypedExpression(program.ast, { pi: Math.PI, e: Math.E, value: inputExpressionValue(expected, props.kind) as ExpressionValue }), props)
  } catch (failure) { diagnostic = (failure as Error).message }
  const apply = () => {
    try {
      if (latest.current.disabled || !sameInputExpressionValue(expected, latest.current.value, props.kind)) throw new Error('Value changed. Review the current value first.')
      if (diagnostic || result === null) throw new Error(diagnostic || 'No valid result')
      latest.current.onResult(result); onClose()
    } catch (failure) { setError((failure as Error).message) }
  }
  return <ExpressionDialog title={'Calculate once · ' + props.label} helpTopic="editor/properties#calculate-once-for-operation-settings" onClose={onClose}>
    <p className="my-3 text-xs text-gray-300">Apply the result to this setting. Formula text is not saved and never runs per frame. <code>value</code> is the reviewed value; pi/e are available.</p>
    <label className="text-xs">Formula<input data-expression-autofocus aria-label={'Calculation for ' + props.label} value={formula} maxLength={4096}
      onChange={event => { setFormula(event.target.value); setError('') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!diagnostic && !stale) apply() } }}
      className="my-2 w-full rounded border border-gray-600 bg-gray-950 p-2 font-mono text-sm focus-visible:outline focus-visible:outline-blue-400" /></label>
    <output aria-live="polite" className="block text-sm">{diagnostic || 'Result: ' + (typeof result === 'object' ? JSON.stringify(result) : result)}</output>
    {(stale || error) && <p role="alert" className="mt-2 text-xs text-amber-300">{error || 'Value changed. Review the current value first.'}</p>}
    {stale && <button type="button" onClick={() => { setExpected(props.value); setError('') }} className="my-2 text-xs underline">Review current value</button>}
    <div className="mt-4 flex justify-end gap-2 text-xs"><button type="button" onClick={onClose} className="rounded border border-gray-600 p-2">Cancel</button>
      <button type="button" disabled={!!diagnostic || stale || props.disabled} onClick={apply} className="rounded bg-blue-600 p-2 disabled:opacity-40">Apply result</button></div>
  </ExpressionDialog>
}
