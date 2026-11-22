'use client'
import { useState } from 'react'
import type { Layer } from '@/lib/types'
import { modifierOutputReadOnly } from '@/lib/modifiers'
import { makeBakeModifierStackCmd } from '@/lib/editor/modifiers/commands'
import ModifierStackPanel from './ModifierStackPanel'
import type { GeometryEditPanelProps } from './GeometryEditPanel'

/** Compatibility drawer, never a new spline-tool stack. Existing source,
 * conversion and legacy modifier records keep their evaluator and editing UI.
 * Baking is explicit, atomic and undoable; after adoption the same layer enters
 * Object Edit. Loading/opening this drawer never changes the source/history. */
export function SplineSourceHistory(props: GeometryEditPanelProps & { layer: Layer }) {
  const { layer } = props, generated = modifierOutputReadOnly(layer)
  const [error, setError] = useState('')
  const bake = () => {
    try {
      if (props.conversionDisabled || props.isTransactionActive() || props.getDocumentSignal().aborted) throw new Error('Finish the current gesture or preview before applying the source.')
      props.dispatchCommand(makeBakeModifierStackCmd(props.getScene(), layer.id))
      props.onClearPoint(); props.onSplineSourceBaked?.(layer.id); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  return <section aria-label="Spline source and history" className="space-y-2">
    {generated && <div className="space-y-2 rounded border border-amber-600/50 p-2">
      <p>This spline comes from an earlier stack. Apply its result to edit the geometry directly. Undo restores the complete stack.</p>
      <button type="button" disabled={props.conversionDisabled || layer.locked || layer.hidden || layer.frozen || !!layer.instanceOf}
        className="min-h-9 rounded border border-orange-400/60 px-3 py-1.5 text-orange-100 disabled:opacity-40" onClick={bake}>Apply to editable spline</button>
    </div>}
    {error && <p role="alert" className="text-amber-200">{error}</p>}
    <details className="rounded border border-gray-700 p-2" aria-label="Source / History">
      <summary className="cursor-pointer font-semibold">Source / History</summary>
      <div className="pt-3">{layer.modifierStack || layer.geometryConversion ? <ModifierStackPanel {...props} />
        : <p className="text-gray-400">Editable spline source · {Object.keys(layer.spline?.points ?? {}).length} points. Geometry tools apply directly; Undo keeps each edit.</p>}</div>
    </details>
  </section>
}
