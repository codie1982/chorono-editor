'use client'

/** Shared line-drawing preference control. The owner keeps its browser-local
 * value outside source/history; changing it never commits or restarts a draft.
 * The same control is used before drawing and in the active drawing section. */
export function SplineAutoCloseControl({ checked, onChange }: { checked: boolean; onChange(value: boolean): void }) {
  return <label className="flex min-h-8 items-center gap-2 text-xs"><input aria-label="Spline Auto Close" type="checkbox" checked={checked}
    onChange={event => onChange(event.target.checked)} className="accent-blue-500" />Auto Close</label>
}

/** Active Line tool options, including new layers with no source selection.
 * Kept in the existing edit dock, never in Properties or over the artwork. */
export function SplineLineDrawingControls({ autoClose, onAutoClose }: { autoClose: boolean; onAutoClose(value: boolean): void }) {
  return <section aria-label="Line drawing options" className="space-y-2 border-b border-gray-700 p-3 text-xs text-gray-300">
    <h3 className="font-semibold">Draw Line</h3>
    <SplineAutoCloseControl checked={autoClose} onChange={onAutoClose} />
    <p className="text-gray-400">Click to add points. With Spline Vertices snap, start at an open endpoint in this spline and click another to join. {autoClose ? 'Right-click joins the last point to the first after at least three anchors.' : 'Right-click finishes an open line.'} Enter finishes open; Esc cancels.</p>
  </section>
}
