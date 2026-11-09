export interface ViewportStatusBarProps {
  selectedName?: string
  count: number
  toolMode?: string
  pivotMode: 'selectionCenter' | 'active'
  onPivotModeChange: (mode: 'selectionCenter' | 'active') => void
  mode: 'editing' | 'playback' | 'preview'
}

/** Normal-flow viewport footer for selection information and shared pivot
 * policy. Mount as a sibling of the interactive viewport, outside its zoomed
 * artboard wrapper. Its reserved 32 CSS-pixel height remains the same with no
 * selection and during playback/preview, so selection cannot move the scene.
 *
 * This stateless UI borrows names/counts only; changing the pivot delegates to
 * the owning viewport and never mutates scene/history. Pointer and keyboard
 * events stay in this control group while native select keyboard defaults are
 * preserved. Rapid selection changes are not announced as a live region.
 */
export function ViewportStatusBar({ selectedName, count, toolMode, pivotMode,
  onPivotModeChange, mode }: ViewportStatusBarProps) {
  const editing = mode === 'editing'
  const summary = count > 1 ? `${count} selected` : count === 1 ? selectedName || '1 selected' : 'Select an object'
  return <footer role="group" aria-label="Viewport status" aria-live="off" data-testid="canvas-selection-summary"
    className="flex h-8 min-h-8 shrink-0 items-center gap-3 border-t border-slate-700 bg-slate-900 px-3 text-[11px] text-slate-300"
    onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {editing ? <>
      <span className="min-w-0 truncate text-blue-100" title={summary}>{summary}</span>
      <span className="shrink-0 capitalize text-slate-400">{(toolMode ?? 'select').replace(/-/g, ' ')}</span>
      {count > 1 && <label className="ml-auto flex shrink-0 items-center gap-2">Pivot
        <select aria-label="Selection pivot" value={pivotMode}
          onChange={event => onPivotModeChange(event.target.value as 'selectionCenter' | 'active')}
          className="rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300">
          <option value="selectionCenter">Selection center</option>
          <option value="active">Active object</option>
        </select>
      </label>}
    </> : <span>{mode === 'playback' ? 'Playing' : 'Preview'}</span>}
  </footer>
}
