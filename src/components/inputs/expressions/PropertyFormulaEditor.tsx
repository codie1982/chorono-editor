'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NumericPropertyInput } from './NumericPropertyContext'
import { inspectNumericFormula, numericInputExpression, type NumericConstraints } from '@/lib/editor/inputExpressions/NumericInputExpression'
import { makeNumericExpressionCommand, numericExpressionBlock, numericExpressionConstraints } from '@/lib/editor/inputExpressions/NumericExpressionCommand'
import { makeRemovePropertyExpressionCmd, makeReplaceLiveWithConstantCmd, makeSetPropertyExpressionCmd } from '@/lib/editor/inputExpressions/PropertyExpressionCommand'
import { readPropertyPath } from '@/lib/scene/properties/readPropertyPath'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import { ExpressionSourcesEditor } from './ExpressionSourcesEditor'
import { PropertyExpressionBakePanel } from './PropertyExpressionBakePanel'

/** Source-bound scalar draft editor sharing numeric and boolean modal behavior. Apply/Convert alone commit;
 * preview uses the production driver graph with a captured explicit playhead.
 * Stale source retains text but requires review; target replacement unmounts the
 * draft. Native modal owns focus and restores it without committing blur text. */
export function PropertyFormulaEditor({ input, limits, initialFormula, kind = 'number', onClose }: { kind?: 'number' | 'boolean'; initialFormula?: string; input: NumericPropertyInput; limits: NumericConstraints; onClose(): void }) {
  const initial = useRef(input.getScene()), [expected, setExpected] = useState(initial.current)
  const layer = expected.layers.find(item => item.id === input.layerId)
  const saved = layer && numericInputExpression(layer, input.path), live = layer?.propertyExpressions?.fields[input.path]
  const [mode, setMode] = useState<'constant' | 'live'>(live || kind === 'boolean' ? 'live' : 'constant')
  const [formula, setFormula] = useState(initialFormula ?? live?.formula ?? saved?.formula ?? String((layer && readPropertyPath(layer, input.path)) ?? (kind === 'boolean' ? false : 0)))
  const [timelineId, setTimelineId] = useState(live?.timelineId ?? input.timelineId ?? expected.timelines[0]?.id ?? '')
  const [sources, setSources] = useState(live?.sources ?? {})
  const [baking, setBaking] = useState(false)
  const reviewClock = useRef({ timeMs: input.timeMs, externalTime: input.externalTime })
  const [error, setError] = useState(''), dialog = useRef<HTMLDialogElement>(null), heading = useId()
  let constraints = limits
  try { if (layer && kind === 'number') { const rule = numericExpressionConstraints(layer, input.path); constraints = { min: Math.max(rule.min ?? -Infinity, limits.min ?? -Infinity), max: Math.min(rule.max ?? Infinity, limits.max ?? Infinity) } } } catch { /* Capability reason is shown below. */ }
  const review = { timeMs: reviewClock.current.timeMs, options: { externalTime: reviewClock.current.externalTime, paramValues: input.frame?.paramValues } }
  const definition = { resultType: kind, formula, timelineId, sources,
    ...(Number.isFinite(constraints.min) ? { min: constraints.min } : {}), ...(Number.isFinite(constraints.max) ? { max: constraints.max } : {}),
    ...(live?.timeOffsetMs === undefined ? {} : { timeOffsetMs: live.timeOffsetMs }) }
  let result: { value: number | boolean | null; error: string | null } = inspectNumericFormula(formula, constraints)
  if (mode === 'live') {
    try {
      const candidate = makeSetPropertyExpressionCmd(expected, input.layerId, input.path, definition, review, true).execute(expected)
      const frame = evaluateSceneFrame(candidate, review.timeMs, review.options), value = frame.overrides.get('layers.' + input.layerId + '.' + input.path)
      result = typeof value === 'number' || typeof value === 'boolean' ? { value, error: null } : { value: null, error: 'No scalar preview value.' }
    } catch (failure) { result = { value: null, error: (failure as Error).message } }
  }
  const stale = input.getScene() !== expected
  const blocked = !layer ? 'The target layer no longer exists.' : numericExpressionBlock(expected, layer, input.path, !!live, kind)
  const activeGesture = input.isTransactionActive?.() ?? false
  const savedDraft = live && mode === 'live' && formula === live.formula && timelineId === live.timelineId && JSON.stringify(sources) === JSON.stringify(live.sources)
  useEffect(() => {
    const previous = document.activeElement, element = dialog.current!
    element.showModal()
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  /** Final synchronous source/gesture check. Failure preserves the local draft. */
  const apply = (action: 'save' | 'convert' | 'remove') => {
    try {
      if (input.isTransactionActive?.()) throw new Error('Finish the active gesture before applying a formula.')
      const command = action === 'remove' ? makeRemovePropertyExpressionCmd(expected, input.layerId, input.path)
        : action === 'convert' ? live ? makeRemovePropertyExpressionCmd(expected, input.layerId, input.path, review) : makeNumericExpressionCommand(expected, input.layerId, input.path, null, limits)
        : mode === 'live' ? makeSetPropertyExpressionCmd(expected, input.layerId, input.path, definition, review, true)
        : live ? makeReplaceLiveWithConstantCmd(expected, input.layerId, input.path, formula) : makeNumericExpressionCommand(expected, input.layerId, input.path, formula, limits)
      input.dispatch(command); onClose()
    } catch (failure) { setError((failure as Error).message) }
  }
  return createPortal(<dialog ref={dialog} aria-labelledby={heading} className="max-h-[90vh] w-[min(520px,90vw)] overflow-auto rounded-lg border border-gray-600 bg-gray-900 p-4 text-gray-100 shadow-2xl backdrop:bg-black/50"
    onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => event.stopPropagation()}>
    <h2 id={heading} className="text-sm font-semibold">Expression · {input.label}</h2>
    <label className="my-3 flex items-center justify-between gap-2 text-xs">Evaluation
      <select aria-label="Expression evaluation mode" value={mode} onChange={event => setMode(event.target.value as 'constant' | 'live')} className="rounded border border-gray-600 bg-gray-950 p-1">
        {kind === 'number' && <option value="constant">When applied</option>}<option value="live">Live on timeline</option>
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
      <input autoFocus aria-label={`Formula for ${input.label}`} value={formula} maxLength={4096} onChange={event => { setFormula(event.target.value); setError('') }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!result.error && !blocked && !stale && !activeGesture) apply('save') } }}
        className="my-2 w-full rounded border border-gray-600 bg-gray-950 p-2 font-mono text-sm focus:outline focus:outline-blue-400" />
    </label>
    <output className="block text-sm" aria-live="polite">{result.error ?? `Result: ${result.value}`}</output>
    {mode === 'live' && <><p className="mt-1 text-xs text-gray-400">Preview at {review.timeMs} ms · authored value stays as fallback.</p><ExpressionSourcesEditor scene={expected} sources={sources} onChange={setSources} /></>}
    {savedDraft && kind === 'number' && <button type="button" onClick={() => setBaking(value => !value)} className="mt-3 text-xs underline">{baking ? 'Close bake review' : 'Bake to keyframes…'}</button>}
    {savedDraft && kind === 'number' && baking && <PropertyExpressionBakePanel input={input} source={expected} onApplied={onClose} />}
    {kind === 'boolean' && <p className="mt-2 text-xs text-gray-400">Returns true/false. Use comparisons, &amp;&amp;, ||, ! and if(test, a, b). Convert captures this frame; numeric bake is unavailable for boolean output.</p>}
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
  </dialog>, document.body)
}
