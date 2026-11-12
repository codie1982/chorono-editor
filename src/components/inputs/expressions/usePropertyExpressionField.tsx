'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { useNumericPropertyInput } from './NumericPropertyContext'
import { CalculationButton } from './CalculationButton'
import { PropertyFormulaEditor } from './PropertyFormulaEditor'
import { inputExpression, sameInputExpressionValue } from '@/lib/editor/inputExpressions/InputExpression'
import type { ExpressionValue, ExpressionValueType } from '@/lib/core/expression/ExpressionValue'
import { propertyExpressionConstraints } from '@/lib/expression/properties/PropertyExpressionCapability'

/** Shared typed control affordance; literal pickers keep their native behavior.
 * Saved formulas lock literal writes until explicit Convert; human source values
 * still win over stale recipes. One inspector frame is borrowed, never polled.
 * Selection changes close a draft instead of retargeting it. */
export function usePropertyExpressionField(kind: ExpressionValueType, authored: unknown, path?: string, label?: string, calculation?: { onResult(value: ExpressionValue): void; options?: readonly string[]; disabled?: boolean; onOpen?(): void }): {
  identity: string; value: unknown; readOnly: boolean; button: ReactNode; diagnostics: ReactNode
} {
  const input = useNumericPropertyInput(path, label), layer = input?.layer
  const saved = input && layer ? inputExpression(layer, input.path) : undefined
  const live = input && layer?.propertyExpressions?.fields[input.path]
  const key = input ? JSON.stringify([input.layerId, input.path, kind]) : ''
  const target = input ? 'layers.' + input.layerId + '.' + input.path : ''
  const frame = live && input?.frame?.overrides.get(target)
  const error = live && (input?.frame?.expressionErrors?.get(target) ?? input?.frame?.expressionErrors?.get('scene'))
  let supported = false
  try { if (input && layer) { propertyExpressionConstraints(layer, input.path, kind, 'constant'); supported = true } } catch { /* Literal-only owner keeps its existing control. */ }
  const [editing, setEditing] = useState<string | null>(null)
  useEffect(() => { setEditing(null) }, [key])
  const button = input && (supported || saved || live) ? <>
    <button type="button" aria-label={'Edit expression for ' + input.label} title={live ? 'Live formula: ' + live.formula : saved ? 'Saved formula: ' + saved.formula : 'Edit a ' + kind + ' formula'}
      onMouseDown={event => event.preventDefault()} onClick={event => { event.preventDefault(); event.stopPropagation(); calculation?.onOpen?.(); setEditing(key) }}
      className={'h-7 w-8 shrink-0 rounded border border-gray-600 text-xs focus-visible:outline focus-visible:outline-blue-400 ' + (saved || live ? 'bg-violet-900/50 text-violet-200' : 'text-gray-300 hover:bg-gray-700')}>fx</button>
    {editing === key && <PropertyFormulaEditor key={key} input={input} kind={kind} limits={{}} onClose={() => setEditing(null)} />}
  </> : !input && calculation ? <CalculationButton label={label ?? path ?? 'value'} value={authored} kind={kind} {...calculation} /> : null
  return { identity: key || label || path || kind, value: live && frame !== undefined ? frame : authored, readOnly: !!saved || !!live, button,
    diagnostics: <>{error && <p role="alert" className="mt-1 text-xs text-amber-300">{error}</p>}
      {saved && !live && !sameInputExpressionValue(authored, saved.value, saved.resultType ?? 'number') && <p className="mt-1 text-xs text-amber-300">Source changed; formula was not reapplied.</p>}</> }
}
