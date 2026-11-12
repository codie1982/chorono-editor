'use client'
import { useRef, useState } from 'react'
import { ExpressionDialog } from './ExpressionDialog'
import type { NumericPropertyInput } from './NumericPropertyContext'
import { type NumericConstraints } from '@/lib/editor/inputExpressions/NumericInputExpression'
import { inputExpressionBlock, assertExpressionTarget } from '@/lib/editor/inputExpressions/ExpressionAuthoringGuard'
import { makeInputExpressionCommand } from '@/lib/editor/inputExpressions/InputExpressionCommand'
import { inputExpression } from '@/lib/editor/inputExpressions/InputExpression'
import { expressionPrograms } from '@/lib/core/expression/ExpressionProgramCache'
import { evaluateTypedExpression, type ExpressionValue, type ExpressionValueType } from '@/lib/core/expression/expressionEvaluator'
import { validatePropertyExpressionValue } from '@/lib/expression/properties/PropertyExpressionValue'
import { makeRemovePropertyExpressionCmd, makeReplaceLiveWithConstantCmd, makeSetPropertyExpressionCmd } from '@/lib/editor/inputExpressions/PropertyExpressionCommand'
import { readPropertyPath } from '@/lib/scene/properties/readPropertyPath'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import { ExpressionSourcesEditor } from './ExpressionSourcesEditor'
import { PropertyExpressionBakePanel } from './PropertyExpressionBakePanel'

/** Source-bound scalar draft editor sharing numeric and boolean modal behavior. Apply/Convert alone commit;
 * preview uses the production driver graph with a captured explicit playhead.
 * Stale source retains text but requires review; target replacement unmounts the
 * draft. Native modal owns focus and restores it without committing blur text. */
export function PropertyFormulaEditor({ input, limits, initialFormula, kind = 'number', onClose }: { kind?: ExpressionValueType; initialFormula?: string; input: NumericPropertyInput; limits: NumericConstraints; onClose(): void }) {
  const initial = useRef(input.getScene()), [expected, setExpected] = useState(initial.current)
  const layer = expected.layers.find(item => item.id === input.layerId)
  const saved = layer && inputExpression(layer, input.path), live = layer?.propertyExpressions?.fields[input.path]
  const [mode, setMode] = useState<'constant' | 'live'>(live ? 'live' : 'constant')
  const initialValue = layer && readPropertyPath(layer, input.path)
  const [formula, setFormula] = useState(initialFormula ?? live?.formula ?? saved?.formula ?? (kind === 'number' ? String(initialValue ?? 0) : kind === 'boolean' ? String(initialValue ?? false) : kind === 'vec2' && initialValue && typeof initialValue === 'object' ? `vec2(${(initialValue as {x:number}).x},${(initialValue as {y:number}).y})` : JSON.stringify(initialValue ?? '')))
  const [timelineId, setTimelineId] = useState(live?.timelineId ?? input.timelineId ?? expected.timelines[0]?.id ?? '')
  const [sources, setSources] = useState(live?.sources ?? {})
  const [baking, setBaking] = useState(false)
  const reviewClock = useRef({ timeMs: input.timeMs, externalTime: input.externalTime })
  const [error, setError] = useState('')
  let constraints = limits, liveSupported = true
  try { if (layer) { const rule = assertExpressionTarget(layer, input.path, kind); liveSupported = rule.live; constraints = { min: Math.max(rule.min ?? -Infinity, limits.min ?? -Infinity), max: Math.min(rule.max ?? Infinity, limits.max ?? Infinity) } } } catch { /* Capability reason is shown below. */ }
  const review = { timeMs: reviewClock.current.timeMs, options: { externalTime: reviewClock.current.externalTime, paramValues: input.frame?.paramValues } }
  const definition = { resultType: kind, formula, timelineId, sources,
    ...(Number.isFinite(constraints.min) ? { min: constraints.min } : {}), ...(Number.isFinite(constraints.max) ? { max: constraints.max } : {}),
    ...(live?.timeOffsetMs === undefined ? {} : { timeOffsetMs: live.timeOffsetMs }) }
  let result: { value: ExpressionValue | null; error: string | null }
  try {
    const program = expressionPrograms.get(formula)
    if (!program.ast) throw new Error(program.error ?? 'Invalid formula')
    if (!layer) throw new Error('The target layer no longer exists.')
    result = { value: validatePropertyExpressionValue(layer, input.path, kind, evaluateTypedExpression(program.ast, { pi: Math.PI, e: Math.E }), 'constant', constraints), error: null }
  } catch (failure) { result = { value: null, error: (failure as Error).message } }
  if (mode === 'live') {
    try {
      const candidate = makeSetPropertyExpressionCmd(expected, input.layerId, input.path, definition, review, true).execute(expected)
      const frame = evaluateSceneFrame(candidate, review.timeMs, review.options), value = frame.overrides.get('layers.' + input.layerId + '.' + input.path)
      result = value === undefined ? { value: null, error: 'No typed preview value.' } : { value, error: null }
    } catch (failure) { result = { value: null, error: (failure as Error).message } }
  }
  const stale = input.getScene() !== expected
  const blocked = !layer ? 'The target layer no longer exists.' : inputExpressionBlock(expected, layer, input.path, !!live, kind, mode)
  const activeGesture = input.isTransactionActive?.() ?? false
  const savedDraft = live && mode === 'live' && formula === live.formula && timelineId === live.timelineId && JSON.stringify(sources) === JSON.stringify(live.sources)
  /** Final synchronous source/gesture check. Failure preserves the local draft. */
  const apply = (action: 'save' | 'convert' | 'remove') => {
    try {
      if (input.isTransactionActive?.()) throw new Error('Finish the active gesture before applying a formula.')
      const command = action === 'remove' ? makeRemovePropertyExpressionCmd(expected, input.layerId, input.path)
        : action === 'convert' ? live ? makeRemovePropertyExpressionCmd(expected, input.layerId, input.path, review) : makeInputExpressionCommand(expected, input.layerId, input.path, null, kind, limits)
        : mode === 'live' ? makeSetPropertyExpressionCmd(expected, input.layerId, input.path, definition, review, true)
        : live ? makeReplaceLiveWithConstantCmd(expected, input.layerId, input.path, formula, kind) : makeInputExpressionCommand(expected, input.layerId, input.path, formula, kind, limits)
      input.dispatch(command); onClose()
    } catch (failure) { setError((failure as Error).message) }
  }
  return <ExpressionDialog title={'Expression · ' + input.label} helpTopic="editor/properties#animation-expressions-and-formulas" onClose={onClose}>
    <label className="my-3 flex items-center justify-between gap-2 text-xs">Evaluation
      <select aria-label="Expression evaluation mode" value={mode} onChange={event => setMode(event.target.value as 'constant' | 'live')} className="rounded border border-gray-600 bg-gray-950 p-1">
        <option value="constant">When applied</option><option value="live" disabled={!liveSupported}>Live on timeline</option>
      </select>
    </label>
    <p className="my-2 text-xs text-gray-400">{mode === 'live' ? 'timeMs / timeSec / timeNormalized use the chosen timeline clock.' : 'Evaluated when applied.'} pi/e available · trig uses radians.</p>
    <p className="mb-2 text-xs text-gray-400">Values use this field's units.{Number.isFinite(constraints.min) ? ` Minimum: ${constraints.min}.` : ''}{Number.isFinite(constraints.max) ? ` Maximum: ${constraints.max}.` : ''}</p>
    {mode === 'live' && <label className="mb-2 flex items-center justify-between text-xs">Timeline
      <select aria-label="Expression timeline" value={timelineId} onChange={event => setTimelineId(event.target.value)} className="rounded border border-gray-600 bg-gray-950 p-1">
        {!timelineId && <option value="">Choose timeline</option>}{expected.timelines.map(timeline => <option key={timeline.id} value={timeline.id}>{timeline.id}</option>)}
      </select>
    </label>}
    <label className="block text-xs">Formula
      <input data-expression-autofocus aria-label={`Formula for ${input.label}`} value={formula} maxLength={4096} onChange={event => { setFormula(event.target.value); setError('') }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!result.error && !blocked && !stale && !activeGesture) apply('save') } }}
        className="my-2 w-full rounded border border-gray-600 bg-gray-950 p-2 font-mono text-sm focus:outline focus:outline-blue-400" />
    </label>
    <output className="block text-sm" aria-live="polite">{result.error ?? `Result: ${typeof result.value === 'object' ? JSON.stringify(result.value) : result.value}`}</output>
    {mode === 'live' && <><p className="mt-1 text-xs text-gray-400">Preview at {review.timeMs} ms · authored value stays as fallback.</p><ExpressionSourcesEditor scene={expected} sources={sources} onChange={setSources} /></>}
    {savedDraft && <button type="button" onClick={() => setBaking(value => !value)} className="mt-3 text-xs underline">{baking ? 'Close bake review' : 'Bake to keyframes…'}</button>}
    {savedDraft && baking && <PropertyExpressionBakePanel input={input} source={expected} onApplied={onClose} />}
    <p className="mt-2 text-xs text-gray-400">Expected: {kind}. Use if(test,a,b), rgb/rgba/color, vec2, concat/str/fixed. Trigonometry uses radians. Formulas have no host code or file access.</p>
    {blocked && <p className="mt-2 text-xs text-amber-300">{blocked}</p>}
    {(stale || error) && <p role="alert" className="mt-2 text-xs text-amber-300">{error || 'Source changed. Review its current value before applying this draft.'}</p>}
    {activeGesture && <p className="mt-2 text-xs text-amber-300">Finish the active gesture first.</p>}
    {stale && <button type="button" onClick={() => { setExpected(input.getScene()); setError('') }} className="mt-2 text-xs underline">Review current source</button>}
    <div className="mt-4 flex flex-wrap justify-end gap-2 text-xs">
      {live && <button type="button" disabled={stale || activeGesture} onClick={() => apply('remove')} className="rounded border border-gray-600 p-2 disabled:opacity-40">Keep authored value</button>}
      {(saved || live) && <button type="button" disabled={stale || activeGesture} onClick={() => apply('convert')} className="rounded border border-gray-600 p-2 disabled:opacity-40">Convert to value</button>}
      <button type="button" onClick={onClose} className="rounded border border-gray-600 p-2">Cancel</button>
      <button type="button" disabled={!!result.error || !!blocked || stale || activeGesture} onClick={() => apply('save')} className="rounded bg-blue-600 p-2 disabled:opacity-40">Apply formula</button>
    </div>
  </ExpressionDialog>
}
