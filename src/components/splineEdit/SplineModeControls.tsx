'use client'
import type { SplineEditController } from './useSplineEditSelection'
import { SPLINE_EDIT_MODES } from './buildSplineEditModeMenu'

/** Small, named toggle group. Native buttons expose pressed state and visible
 * keyboard focus; selecting a mode enters editing, Done restores layer tools. */
export function SplineModeControls({ controller, disabled = false }: { controller: SplineEditController; disabled?: boolean }) {
  return <div className="flex items-center gap-1" role="group" aria-label="Spline selection mode">
    {SPLINE_EDIT_MODES.map(({ mode, label }) => <button key={mode} type="button" disabled={disabled}
      aria-label={`Spline ${mode} mode`} aria-pressed={controller.active && controller.mode === mode}
      className={`rounded px-2 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300 disabled:opacity-50 ${controller.active && controller.mode === mode ? 'bg-blue-600 text-white' : 'border border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
      onClick={() => controller.enter(mode)}>{label}</button>)}
    {controller.active && <button type="button" onClick={controller.exit} className="ml-auto rounded border border-gray-600 px-2 py-1.5 text-xs text-gray-200 focus-visible:outline focus-visible:outline-blue-300">Done</button>}
  </div>
}
