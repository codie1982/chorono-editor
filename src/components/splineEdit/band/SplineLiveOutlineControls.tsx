import type { SplineBandController } from './useSplineBand'

/** Source-guide visibility is an editor preference; enable and explicit Bake
 * are separately undoable source commands. Available in every Edit sub-mode. */
export function SplineLiveOutlineControls({ controller: c, disabled }: { controller: SplineBandController; disabled?: boolean }) {
  if (!c.liveRecord) return null
  return <section aria-label="Live Outline controls" className="space-y-2 rounded border border-orange-400/40 p-2">
    <h4 className="font-semibold">Live Outline</h4>
    <label className="flex min-h-8 items-center gap-2"><input type="checkbox" aria-label="Outline enabled" disabled={disabled} checked={c.liveRecord.enabled} onChange={e => c.setEnabled(e.currentTarget.checked)} />Outline enabled</label>
    <label className="flex min-h-8 items-center gap-2"><input type="checkbox" aria-label="Show source line" checked={c.sourceGuideVisible} onChange={e => c.setSourceGuideVisible(e.currentTarget.checked)} />Show source line</label>
    <p className="text-gray-400">Edit the original line; its band follows. The source guide is hidden in exports.</p>
    <button type="button" disabled={disabled} className="min-h-8 rounded border border-gray-600 px-2 py-1 disabled:opacity-40" onClick={c.bake}>Bake Outline / Stroke to Path</button>
    {c.error && <p role="alert" className="text-amber-300">{c.error}</p>}
  </section>
}
