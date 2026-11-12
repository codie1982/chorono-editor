import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
import { useEffect, useState } from 'react'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import type { CanvasGuideEditing } from './useCanvasGuideEditing'
import { guidePositionInput } from './guidePositionInput'

/** Exact numeric alternative to ruler/guide dragging. The compact inspector
 * owns only drafts; Apply/Enter commits one source command, Escape closes
 * without writing. All events stay outside layer selection/viewport shortcuts. */
export function GuideInspector({ editing }: { editing: CanvasGuideEditing }) {
  const [axis, setAxis] = useState<'v' | 'h'>('v'), [position, setPosition] = useState('0')
  const [draft, setDraft] = useState(''), selected = editing.selected
  useEffect(() => { setDraft(selected ? String(selected.position) : '') }, [selected?.id, selected?.position])
  const submit = (add: boolean) => {
    try {
      const value = guidePositionInput(add ? position : draft)
      if (add) editing.add(axis, value)
      else if (selected) editing.update(selected, { position: value })
    } catch (error) { editing.reportError(error instanceof Error ? error.message : String(error)) }
  }
  const apply = () => submit(false)
  const field = 'w-full rounded bg-slate-800 border border-slate-600 px-2 py-1 text-xs text-slate-100 focus-visible:outline-cyan-300'
  return <div role="dialog" aria-label="Guide controls" className="absolute top-7 left-7 z-50 w-64 rounded border border-cyan-600/60 bg-slate-950/95 p-3 text-xs text-slate-100 shadow-xl"
    onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onKeyDownCapture={event => {
      if (!event.currentTarget.contains(event.target as Node)) return
      if (event.key === 'Escape') { event.preventDefault(); editing.close() }
    }}>
    <div className="flex items-center justify-between mb-2"><strong>Guides · composition px</strong>
      <DocumentationHelp topic="editor/canvas/snapping#add-and-edit-ruler-guides" compact />
      <button aria-label="Close guide controls" onClick={editing.close} className="px-2 py-1 rounded hover:bg-slate-700">×</button></div>
    {selected ? <>
      <p className="mb-2 text-cyan-200">{selected.axis === 'v' ? 'Vertical · x' : 'Horizontal · y'}{selected.locked ? ' · locked' : ''}</p>
      <label className="block">Position<CalculationNumberInput key={selected.id} aria-label="Guide position" value={draft} disabled={selected.locked}
        className={field} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply() } }} onCalculate={calculated => setDraft(String(calculated))} /></label>
      <div className="flex flex-wrap gap-1 mt-2">
        <button aria-label="Apply guide position" disabled={selected.locked || !draft.trim()} onClick={apply} className="rounded bg-cyan-800 px-2 py-1 disabled:opacity-40">Apply</button>
        <button aria-label={selected.locked ? 'Unlock guide' : 'Lock guide'} onClick={() => editing.update(selected, { locked: !selected.locked })} className="rounded bg-slate-700 px-2 py-1">{selected.locked ? 'Unlock' : 'Lock'}</button>
        <button aria-label={selected.hidden ? 'Show guide' : 'Hide guide'} onClick={() => editing.update(selected, { hidden: !selected.hidden })} className="rounded bg-slate-700 px-2 py-1">{selected.hidden ? 'Show' : 'Hide'}</button>
        <button aria-label="Delete guide" onClick={() => editing.remove(selected)} className="rounded bg-rose-950 px-2 py-1">Delete</button>
      </div>
    </> : <p className="text-slate-400">Click a guide or select one below.</p>}
    <div className="flex gap-2 items-end mt-3 border-t border-slate-700 pt-2">
      <label>Direction<select aria-label="New guide orientation" value={axis} onChange={event => setAxis(event.target.value as 'v' | 'h')} className={field}><option value="v">Vertical</option><option value="h">Horizontal</option></select></label>
      <label className="min-w-0">Position<CalculationNumberInput aria-label="New guide position" value={position} onChange={event => setPosition(event.target.value)} className={field} onCalculate={calculated => setPosition(String(calculated))} /></label>
      <button aria-label="Add guide" disabled={!position.trim()} onClick={() => submit(true)} className="rounded bg-cyan-800 px-2 py-1.5">Add</button>
    </div>
    {editing.guides.length > 0 && <select aria-label="Select guide" value={editing.selectedId ?? ''} className={`${field} mt-2`} onChange={event => editing.select(event.target.value || null)}>
      <option value="">Select a guide…</option>{editing.guides.map(guide => <option key={guide.id} value={guide.id}>{guide.axis === 'v' ? 'X' : 'Y'} {guide.position.toFixed(2)}{guide.locked ? ' · locked' : ''}{guide.hidden ? ' · hidden' : ''}</option>)}
    </select>}
    {editing.error && <p role="alert" className="mt-2 text-amber-200">{editing.error}</p>}
  </div>
}
