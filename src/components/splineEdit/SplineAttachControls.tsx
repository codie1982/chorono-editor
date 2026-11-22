'use client'
import type { SplineAddOperation, SplineEditController } from './useSplineEditSelection'
import type { BooleanOperationActions } from '../booleanPreview/useBooleanOperationActions'

/** Existing-layer pick mode and shared Boolean actions. Owns no geometry or
 * history: all surfaces reuse the guarded Attach/Boolean native commands. */
export function SplineAttachControls({ controller, disabled, onBegin, booleanActions }: {
  controller: SplineEditController; disabled?: boolean; onBegin?(): void; booleanActions: BooleanOperationActions
}) {
  const recipe = booleanActions.owner?.booleanOperation
  const operation = recipe?.operation ?? controller.attachOperation
  return <section aria-label="Add to this Spline" className="space-y-2 rounded border border-gray-700 p-2">
    <div className="flex items-center justify-between gap-2">
      <h4 className="font-medium">Add Spline</h4>
      <button type="button" aria-label="Add existing splines" aria-pressed={controller.attaching}
        title="Pick existing spline objects to attach"
        disabled={disabled} onClick={() => { if (!controller.attaching) onBegin?.(); controller.setAttaching(!controller.attaching) }}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border focus-visible:outline focus-visible:outline-orange-300 disabled:opacity-40 ${controller.attaching ? 'border-orange-400 bg-orange-950 text-orange-200' : 'border-gray-600 hover:bg-gray-800'}`}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v12M2 8h12" /></svg>
      </button>
    </div>
    <label className="block space-y-1">Operation
      <select aria-label="Spline add operation" disabled={disabled} value={operation}
        className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 focus-visible:outline focus-visible:outline-orange-300"
        onChange={event => {
          const value = event.target.value as SplineAddOperation
          if (recipe && value !== 'attach') booleanActions.setOperation(value)
          controller.setAttachOperation(value)
        }}>
        <option value="union">Union · combine areas</option><option value="subtract">Subtract · remove area</option>
        <option value="intersect">Intersect · shared area</option><option value="xor">Exclude · XOR</option>
        <option value="attach" disabled={!!recipe}>Attach · keep contours</option>
      </select>
    </label>
    <p aria-live="polite" className="text-gray-400">{controller.attaching
      ? 'Pick existing splines in the viewport or Scene Explorer. Esc, right-click in the viewport or + finishes.'
      : 'Press +, then pick spline objects in the viewport or Scene Explorer.'}</p>
    <p className="text-gray-400">{operation === 'attach' ? 'Keeps open/closed contours; added objects use this spline’s appearance and leave their original layer.'
      : 'Closed areas only. Original inputs stay editable; the result uses A’s appearance. Subtract removes added areas from A.'}</p>
    {recipe && <>
      <p className="text-gray-400">A: {booleanActions.primaryName} · {recipe.inputs.length} inputs. Changing Operation recalculates all inputs.{recipe.reverse && ' Subtraction order: B − A.'}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled || !booleanActions.canFinish} className="rounded border border-orange-400/60 px-2 py-1.5 text-orange-200 disabled:opacity-40" onClick={booleanActions.merge}>Merge Paths</button>
        <button type="button" disabled={disabled || !booleanActions.canFinish} className="rounded border border-gray-600 px-2 py-1.5 disabled:opacity-40" onClick={booleanActions.separate}>Separate Inputs</button>
      </div>
      <p className="text-gray-400">Merge creates editable contours at the saved curve tolerance. Undo restores the original operation and inputs.</p>
    </>}
  </section>
}
