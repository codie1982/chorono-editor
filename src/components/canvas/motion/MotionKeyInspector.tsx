import { useEffect, useState, type FormEvent } from 'react'
import type { TrajectoryNode } from '@/lib/timeline/trajectory'
import type { MotionPointDraft } from './types'

interface Props { node: TrajectoryNode; durationMs: number; disabled: boolean; onApply: (draft: MotionPointDraft) => void }

/** Numeric single-pointer/keyboard alternative to dragging one native position
 * node. Values are the world-space anchor point and explicit timeline-local ms;
 * drafts do not mutate source until Apply. Native bounds complement domain
 * validation; source/undo changes refresh all three displayed draft fields. */
export function MotionKeyInspector({ node, durationMs, disabled, onApply }: Props) {
  const [draft, setDraft] = useState({ x: String(node.world.x), y: String(node.world.y), timeMs: String(node.timeMs) })
  useEffect(() => { setDraft({ x: String(node.world.x), y: String(node.world.y), timeMs: String(node.timeMs) }) },
  [node.id, node.world.x, node.world.y, node.timeMs])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const values = { x: Number(draft.x), y: Number(draft.y), timeMs: Number(draft.timeMs) }
    if (Object.values(values).every(Number.isFinite)) onApply(values)
  }
  return <form onSubmit={submit} className="flex flex-wrap items-end gap-2 pt-2" aria-label="Selected motion key">
    {([['x', 'World X'], ['y', 'World Y'], ['timeMs', 'Time (ms)']] as const).map(([field, label]) => <label key={field}
      className="flex flex-col gap-0.5 text-xs text-slate-300">{label}
      <input aria-label={`Motion key ${label}`} type="number" step="any" required disabled={disabled}
        min={field === 'timeMs' ? 0 : undefined} max={field === 'timeMs' ? durationMs : undefined}
        value={draft[field]} onChange={event => setDraft(previous => ({ ...previous, [field]: event.target.value }))}
        className="w-24 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-white" />
    </label>)}
    <button type="submit" disabled={disabled} className="min-h-8 rounded bg-sky-700 px-3 text-xs text-white disabled:opacity-40">Apply key values</button>
  </form>
}
