import type { MotionEditorMode } from './types'

const button = 'min-h-8 rounded border border-slate-600 px-2 text-xs text-slate-100 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-40'
interface Props {
  mode: MotionEditorMode
  onModeChange: (mode: MotionEditorMode) => void
  timelineId?: string
  selectedCount: number
  editable: boolean
  duplicateMs: number
  onDuplicateMs: (value: number) => void
  onDuplicate: () => void
  onDelete: () => void
}

/** Explicit authoring modes keep motion-key picking distinct from object and
 * geometry picking. Every action has a named native button and focus outline;
 * source editing stays disabled when the trajectory capability is read-only. */
export function MotionKeyToolbar(props: Props) {
  const { mode, onModeChange, timelineId, selectedCount, editable } = props
  return <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Motion keys">
    <button type="button" className={`${button} ${mode !== 'off' ? 'bg-sky-800 border-sky-400' : 'bg-slate-900'}`}
      aria-label="Motion Keys" aria-pressed={mode !== 'off'} disabled={!timelineId}
      onClick={() => onModeChange(mode === 'off' ? 'select' : 'off')}>Motion Keys</button>
    {mode !== 'off' && <>
      <span className="text-xs text-slate-300 px-1">{timelineId} · {selectedCount} selected</span>
      {([
        ['select', 'Edit motion keys', 'Edit'], ['add', 'Add position key', 'Add Key'], ['draw', 'Draw motion', 'Draw Motion'],
      ] as const).map(([id, label, text]) => <button key={id} type="button" className={`${button} ${mode === id ? 'bg-sky-800 border-sky-400' : ''}`}
        aria-label={label} aria-pressed={mode === id} disabled={!editable && id !== 'select'} onClick={() => onModeChange(id)}>{text}</button>)}
      {selectedCount > 0 && <>
        <label className="flex items-center gap-1 text-xs text-slate-300">Copy offset ms
          <input aria-label="Duplicate motion keys offset ms" type="number" min="0.001" step="any" value={props.duplicateMs}
            className="w-20 rounded border border-slate-600 bg-slate-950 px-1 py-1 text-white"
            onChange={event => props.onDuplicateMs(Number(event.target.value))} />
        </label>
        <button type="button" className={button} disabled={!editable || !Number.isFinite(props.duplicateMs) || props.duplicateMs <= 0}
          onClick={props.onDuplicate}>Duplicate keys</button>
        <button type="button" className={button} disabled={!editable} onClick={props.onDelete}>Delete keys</button>
      </>}
    </>}
  </div>
}
