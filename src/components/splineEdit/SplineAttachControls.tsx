'use client'
import type { SplineEditController } from './useSplineEditSelection'

/** Explicit existing-layer pick toggle. It owns no source geometry or history;
 * the viewport routes each pick through the guarded native Attach command. */
export function SplineAttachControls({ controller, disabled, onBegin }: { controller: SplineEditController; disabled?: boolean; onBegin?(): void }) {
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
    <p aria-live="polite" className="text-gray-400">{controller.attaching
      ? 'Click existing splines in the viewport to add them. Esc, right-click or + finishes.'
      : 'Press +, then pick existing spline objects in the viewport.'}</p>
    {controller.attaching && <p className="text-gray-400">Added objects use this spline’s appearance and leave their original layer.</p>}
  </section>
}
