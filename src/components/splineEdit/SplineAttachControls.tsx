'use client'
import type { SplineEditController } from './useSplineEditSelection'
import type { BooleanOperationActions } from '../booleanPreview/useBooleanOperationActions'

const operations = [
  ['union', 'Union', 'Combine selected closed areas; keep only the outer boundary and real holes.'],
  ['subtract', 'Subtract', 'Subtract the remaining selected areas from the first selected Object (A − B).'],
  ['intersect', 'Intersect', 'Keep only the area shared by the selected Objects.'],
  ['xor', 'XOR', 'Exclude overlapping areas.'],
  ['attach', 'Attach', 'Keep independent contours without solving areas; + picks an existing spline.'],
] as const

/** Existing-layer pick mode and shared Boolean actions. Owns no geometry or
 * history: all surfaces reuse the guarded Attach/Boolean native commands. */
export function SplineAttachControls({ controller, disabled, onBegin, booleanActions, onStructure }: {
  controller: SplineEditController; disabled?: boolean; onBegin?(): void; booleanActions: BooleanOperationActions; onStructure?(kind: 'compound' | 'separate'): void
}) {
  const recipe = booleanActions.owner?.booleanOperation
  const operation = recipe?.operation ?? controller.attachOperation
  return <section aria-label="Add to this Spline" className="space-y-2 rounded border border-gray-700 p-2">
    <div className="flex items-center justify-between gap-2">
      <h4 className="font-medium">Spline Boolean &amp; Paths</h4>
      <button type="button" aria-label="Add existing splines" aria-pressed={controller.attaching}
        title="Pick existing spline objects to attach"
        disabled={disabled} onClick={() => { if (!controller.attaching) onBegin?.(); controller.setAttaching(!controller.attaching) }}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border focus-visible:outline focus-visible:outline-orange-300 disabled:opacity-40 ${controller.attaching ? 'border-orange-400 bg-orange-950 text-orange-200' : 'border-gray-600 hover:bg-gray-800'}`}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v12M2 8h12" /></svg>
      </button>
    </div>
    <label className="flex items-center gap-2 text-gray-300">
      <input type="checkbox" aria-label="Non-destructive spline Boolean" checked={!!recipe || controller.nonDestructive}
        disabled={disabled || !!recipe} onChange={event => controller.setNonDestructive(event.target.checked)} />
      Non-Destructive · keep sources
    </label>
    <div role="group" aria-label="Spline area operation" className="flex flex-wrap gap-1.5">
      {operations.map(([value, label, hint]) => <button key={value} type="button" aria-label={`Spline operation ${label}`}
        aria-pressed={operation === value} title={hint} disabled={disabled || value === 'attach' && !!recipe}
        className={`min-h-8 rounded border px-2 py-1.5 focus-visible:outline focus-visible:outline-orange-300 disabled:opacity-40 ${operation === value ? 'border-orange-400 bg-orange-950 text-orange-200' : 'border-gray-600 text-gray-200 hover:bg-gray-800'}`}
        onClick={() => {
          if (value !== 'attach' && !booleanActions.applyObjects(value)) return
          controller.setAttachOperation(value)
          if (controller.mode !== 'object') controller.enter('object')
        }}>{label}</button>)}
    </div>
    <div role="group" aria-label="Spline path structure" className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled || !!recipe} className="min-h-8 rounded border border-gray-600 px-2 py-1.5 disabled:opacity-40" onClick={() => onStructure?.('compound')}>Compound Path</button>
      <button type="button" disabled={disabled || !!recipe} className="min-h-8 rounded border border-gray-600 px-2 py-1.5 disabled:opacity-40" onClick={() => onStructure?.('separate')}>Separate Paths</button>
    </div>
    <p aria-live="polite" className="text-gray-400">{controller.attaching
      ? 'Pick another Object in this spline, or a spline / shape in the viewport or Scene Explorer. Esc, right-click or + finishes.'
      : 'Select Objects, then click an operation to create an editable spline. Use + to pick more inputs with the active operation.'}</p>
    <p className="text-gray-400">{recipe || controller.nonDestructive ? 'Sources stay editable. Merge Paths commits an editable spline; Separate Inputs restores the originals.' : operation === 'attach' ? 'Keeps open/closed contours; added objects use this spline’s appearance and leave their original layer.'
      : 'Closed areas only. Applies immediately to an editable spline with A’s appearance. Undo restores the original inputs. Subtract removes B from A.'}</p>
    {recipe && <>
      <p className="text-gray-400">A: {booleanActions.primaryName} · {recipe.inputs.length} inputs. Operation buttons recalculate all inputs.{recipe.reverse && ' Subtraction order: B − A.'}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled || !booleanActions.canFinish} className="rounded border border-orange-400/60 px-2 py-1.5 text-orange-200 disabled:opacity-40" onClick={booleanActions.merge}>Merge Paths</button>
        <button type="button" disabled={disabled || !booleanActions.canFinish} className="rounded border border-gray-600 px-2 py-1.5 disabled:opacity-40" onClick={booleanActions.separate}>Separate Inputs</button>
      </div>
      <p className="text-gray-400">Merge creates editable contours at the saved curve tolerance. Undo restores the original operation and inputs.</p>
    </>}
  </section>
}
