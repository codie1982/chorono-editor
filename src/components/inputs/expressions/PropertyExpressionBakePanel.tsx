'use client'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { useState } from 'react'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import type { ChronoScene } from '@/lib/types'
import type { NumericPropertyInput } from './NumericPropertyContext'
import { preparePropertyExpressionBake, type PreparedPropertyExpressionBake } from '@/lib/expression/properties/preparePropertyExpressionBake'
import { makeApplyPropertyExpressionBakeCmd } from '@/lib/editor/inputExpressions/PropertyExpressionBakeCommand'
import type { BakeOptions } from '@/lib/animation/baking/bake'

/** Explicit bounded global-time bake review inside the native formula dialog.
 * All inputs are transient configuration, never inherited source-field scopes.
 * Options invalidate prepared data; stale source/active gestures cannot publish.
 * Cancel/unmount releases the sampled track. Parameters are captured at Preview. */
export function PropertyExpressionBakePanel({ input, source, onApplied }: { input: NumericPropertyInput; source: ChronoScene; onApplied(): void }) {
  const [options, setOptions] = useState<BakeOptions>({ startMs: 0, endMs: source.composition.durationMs, fps: source.composition.frameRate, tolerance: .005 })
  const [prepared, setPrepared] = useState<PreparedPropertyExpressionBake | null>(null), [error, setError] = useState('')
  const stale = input.getScene() !== source
  const kind = source.layers.find(layer => layer.id === input.layerId)?.propertyExpressions?.fields[input.path]?.resultType
  const discrete = kind === 'boolean' || kind === 'string'
  const preview = () => {
    setPrepared(null)
    try {
      if (stale || input.isTransactionActive?.()) throw new Error('Source changed or a gesture is active. Review the current source first.')
      setPrepared(preparePropertyExpressionBake(source, input.layerId, input.path, options, input.frame?.paramValues)); setError('')
    } catch (failure) { setError((failure as Error).message) }
  }
  const apply = () => {
    try {
      if (!prepared || stale || input.isTransactionActive?.()) throw new Error('Preview the current expression before applying the bake.')
      input.dispatch(makeApplyPropertyExpressionBakeCmd(prepared)); onApplied()
    } catch (failure) { setError((failure as Error).message) }
  }
  return <fieldset className="mt-3 rounded border border-gray-600 p-2 text-xs">
    <legend>Bake saved expression <DocumentationHelp topic="editor/timeline/controllers#bake-a-live-expression-to-keyframes" compact /></legend>
    <p className="mb-2 text-gray-400">Captures current parameters into {discrete ? 'hold' : 'linear'} keys on a new composition-time timeline. Replaces this live driver; other channels and authored fallback stay.</p>
    <p className="mb-2 text-gray-400">Outside the sampled range, the first/last baked value holds. The live driver is removed globally.</p>
    <div className="grid grid-cols-2 gap-2">
      {([['startMs', 'Start · project ms'], ['endMs', 'End · project ms'], ['fps', 'Samples / second'], ['tolerance', 'Tolerance · fraction of span']] as const).map(([key, label]) => <label key={key}>{label}
        <CalculationNumberInput aria-label={label} step="any" disabled={discrete && key === 'tolerance'} value={Number.isNaN(options[key]) ? '' : options[key]} onChange={event => { setOptions(value => ({ ...value, [key]: event.target.value.trim() ? Number(event.target.value) : NaN })); setPrepared(null); setError('') }} className="mt-1 w-full rounded border border-gray-600 bg-gray-950 p-1 disabled:opacity-40" onCalculate={calculated => { setOptions(value => ({ ...value, [key]: String(calculated).trim() ? calculated : NaN })); setPrepared(null); setError('') }} />
      </label>)}
    </div>
    <p className="my-1 text-gray-400">{discrete ? 'Hold keys preserve sampled changes; error is a 0/1 mismatch.' : kind === 'color' ? 'Tolerance is a fraction of each sampled channel span. Error uses the largest RGBA channel difference (0–255).' : kind === 'vec2' ? 'Tolerance is a fraction of each sampled channel span. Error uses the largest X/Y difference in layer-local px.' : 'Error uses the target field’s source units.'}</p>
    {prepared && <div role="status" className="my-2 text-gray-300">{prepared.report.sampleCount} samples → {prepared.report.keyCount} keys. Maximum sample / midpoint error: {prepared.report.maxSampleError.toPrecision(3)} / {prepared.report.maxMidpointError.toPrecision(3)}.<p>Between-sample accuracy depends on FPS; these probes do not prove continuous equality. Captured parameters: {prepared.parameterValues.size}.</p></div>}
    {(error || stale) && <p role="alert" className="my-2 text-amber-300">{error || 'Source changed. Review and preview again.'}</p>}
    <div className="mt-2 flex justify-end gap-2"><button type="button" disabled={stale} onClick={preview} className="rounded bg-blue-700 p-2 disabled:opacity-40">Preview bake</button>
      <button type="button" disabled={!prepared || stale} onClick={apply} className="rounded bg-amber-700 p-2 disabled:opacity-40">Apply bake</button></div>
  </fieldset>
}
