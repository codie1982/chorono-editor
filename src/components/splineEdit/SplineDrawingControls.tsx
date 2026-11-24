'use client'
import { SplineAutoCloseControl } from './SplineAutoCloseControl'
import type { SplinePrimitiveKind } from '@/lib/types/spline'
import { splineContinuation } from '@/lib/spline'
import type { SplinePathData } from '@/lib/types/spline'
import type { SplineEditController } from './useSplineEditSelection'

/** Explicit append/continue intents; an ordinary Add outside edit creates a
 * separate layer. Continue requires one selected open endpoint. Auto Close is
 * an editor preference independent from the layer's Fill/Stroke and topology. */
export function SplineDrawingControls({ data, controller, autoClose, onAutoClose, onDraw, disabled, drawingLine = false }: {
  drawingLine?: boolean
  data: SplinePathData; controller: SplineEditController; autoClose: boolean; onAutoClose(value: boolean): void
  onDraw(kind: SplinePrimitiveKind, endpointId?: string): void; disabled?: boolean
}) {
  const endpoint = controller.mode === 'point' && controller.ids.length === 1 ? splineContinuation(data, controller.ids[0]) : null
  return <fieldset disabled={disabled} className="space-y-2 border-t border-gray-700 pt-2">
    <legend className="pt-2">Draw geometry</legend>
    <select aria-label="Add spline object" value="" className="w-full rounded border border-gray-600 bg-gray-800 p-1.5" onChange={event => { if (event.target.value) onDraw(event.target.value as SplinePrimitiveKind) }}>
      <option value="">Choose a new object…</option>{(['custom', 'freehand','spiral','line', 'rectangle', 'circle', 'ellipse', 'arc', 'star', 'ngon', 'donut'] as const).map(kind => <option key={kind} value={kind}>{kind==='custom'?'Bézier Pen':kind}</option>)}
    </select>
    <button type="button" disabled={disabled || !endpoint} className="rounded border border-gray-600 px-2 py-1.5 disabled:opacity-40" onClick={() => { if (endpoint) onDraw('line', endpoint.pointId) }}>Continue selected endpoint</button>
    {!drawingLine && <SplineAutoCloseControl checked={autoClose} onChange={onAutoClose} />}
    <p className="text-gray-400">Add Line starts a new Object unless Snap to Vertices acquires an open endpoint in this layer. Auto Close enables return-to-start closure and completion at another spline point. With it off, both keep drawing. Enter/Esc save placed points open; right-click follows Auto Close. Closed source curves are preserved.</p>
  </fieldset>
}
