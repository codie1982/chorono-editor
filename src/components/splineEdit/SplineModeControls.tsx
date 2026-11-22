'use client'
import type { SplineEditController } from './useSplineEditSelection'
import { SPLINE_EDIT_MODES } from './buildSplineEditModeMenu'

/** Shared Point/Edge/Object toggles. Clicking the pressed mode exits to layer
 * tools; another mode switches the existing edit session without touching source
 * or history. Pressed state, mode name and exit hint do not rely on color alone. */
export function SplineModeControls({ controller, disabled = false }: { controller: SplineEditController; disabled?: boolean }) {
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span role="status" aria-live="polite" className={controller.active ? 'font-semibold text-orange-200' : 'text-gray-400'}>
        {controller.active ? `Editing · ${SPLINE_EDIT_MODES.find(item => item.mode === controller.mode)?.label}` : 'Layer mode'}
      </span>
      {controller.active && <button type="button" onClick={controller.exit} className="rounded border border-orange-400/50 px-2 py-1 text-xs text-orange-200 focus-visible:outline focus-visible:outline-orange-300">Done</button>}
    </div>
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Spline selection mode">
    {SPLINE_EDIT_MODES.map(({ mode, label }, index) => <button key={mode} type="button" disabled={disabled}
      aria-label={`Spline ${mode} mode`} aria-keyshortcuts={String(index + 1)} aria-pressed={controller.active && controller.mode === mode}
      className={`min-h-9 rounded border px-2 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 disabled:opacity-50 ${controller.active && controller.mode === mode ? 'border-orange-400 bg-orange-500/20 text-orange-100' : 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
      onClick={() => controller.active && controller.mode === mode ? controller.exit() : controller.enter(mode)}>{label} <kbd className="ml-1 text-xs opacity-60">{index + 1}</kbd></button>)}
    </div>
    {controller.active && <p className="text-gray-400">Click the active mode again or Done to return to layer tools.</p>}
  </div>
}
