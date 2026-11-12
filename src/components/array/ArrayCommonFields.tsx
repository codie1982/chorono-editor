import type { ArraySettings, BaseArraySettings } from '@/lib/array/ArrayTypes'
import type { ArrayAuthoringController } from './useArrayAuthoring'
import { ArrayCheck, ArrayNumber, ArraySection } from './ArrayFields'

/** Explicit space, pivot, source/count and animation policy for the whole forest.
 * Native clone/array capabilities decide support; UI never silently substitutes
 * another mode or treats a physical forest as a procedural repeater. */
export function ArrayCommonFields({ authoring }: { authoring: ArrayAuthoringController }) {
  const { settings, setSettings, pivotMode, setPivotMode } = authoring
  const patch = (value: Partial<BaseArraySettings>) => setSettings({ ...settings, ...value })
  return <ArraySection title="Forest options">
    <label className="mb-2 block text-xs">Mode<select aria-label="Array Mode" value={settings.cloneMode} onChange={event => patch({ cloneMode: event.target.value as 'copy' | 'instance' })}
      className="ml-2 rounded border border-slate-600 bg-slate-950 p-1"><option value="copy">Independent Copy</option><option value="instance">Linked appearance Instance</option></select></label>
    <label className="mb-2 block text-xs">Source policy<select aria-label="Array Source policy" value={settings.sourcePolicy} onChange={event => patch({ sourcePolicy: event.target.value as ArraySettings['sourcePolicy'] })}
      className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-1"><option value="include-source">Include source — count is total occurrences</option><option value="clone-source-too">Clone source too — count is new occurrences</option></select></label>
    <label className="mb-2 block text-xs">Space<select aria-label="Array Space" value={settings.space} onChange={event => patch({ space: event.target.value as ArraySettings['space'] })}
      className="ml-2 rounded border border-slate-600 bg-slate-950 p-1"><option value="world">World</option><option value="parent">Active root's parent</option><option value="local">Active root's local</option></select></label>
    <label className="mb-2 block text-xs">Pivot<select aria-label="Array Pivot" value={pivotMode} onChange={event => setPivotMode(event.target.value as typeof pivotMode)}
      className="ml-2 rounded border border-slate-600 bg-slate-950 p-1"><option value="selectionCenter">Selection center</option><option value="active">Active root pivot</option></select></label>
    {settings.pattern === 'linear' && <label className="mb-2 block text-xs">Transform mode<select aria-label="Array Transform mode" value={settings.transformMode} onChange={event => patch({ transformMode: event.target.value as ArraySettings['transformMode'] })}
      className="ml-2 rounded border border-slate-600 bg-slate-950 p-1"><option value="incremental">Per-copy step</option><option value="total">Total span</option></select></label>}
    <ArrayCheck label="Copy all relevant timeline animations" checked={settings.duplicateAnimation} onChange={duplicateAnimation => patch({ duplicateAnimation })} />
    {settings.duplicateAnimation && <ArrayNumber label="Time offset per occurrence ms" value={settings.timeOffsetMs ?? 0} onChange={timeOffsetMs => patch({ timeOffsetMs })} />}
    <p className="mt-2 text-xs text-slate-400">Each occurrence keeps the selected roots together. Placement uses the frame at tool opening; copied key times are shifted explicitly.</p>
    <label className="mt-2 flex items-center gap-2 text-xs text-slate-500"><input aria-label="Array Repeater" type="checkbox" disabled />Procedural Repeater</label>
    <p className="mt-1 text-xs text-slate-400">This tool creates editable Copy/Instance forests. A multi-root Repeater conversion is not supported here.</p>
  </ArraySection>
}
