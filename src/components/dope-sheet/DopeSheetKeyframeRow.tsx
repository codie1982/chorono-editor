'use client'
import type { DopeSheetRow } from './types'
import { DOPE_SHEET_ROW_HEIGHT } from './types'
import { groupDopeSheetKeys } from '@/lib/dope-sheet/rows'

interface Props {
  row: DopeSheetRow
  selectedKfIds: Set<string>
  previewMs: Record<string, number>
  pixelsPerMs: number
  visibleStartMs: number
  visibleEndMs: number
  currentTimeMs: number
  snapTarget: number | null
  gridStepMs: number
  onKeyPointerDown: (event: React.PointerEvent<HTMLElement>, ids: string[]) => void
  onKeySelect: (ids: string[], shift: boolean, toggle: boolean) => void
  onEmptyPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}

export default function DopeSheetKeyframeRow(props: Props) {
  const { row, previewMs, pixelsPerMs } = props
  const keys = Array.from(new Map(row.tracks.flatMap(track => track.keyframes.map(key => [key.id, key] as const))).values())
    .sort((a, b) => (previewMs[a.id] ?? a.timeMs) - (previewMs[b.id] ?? b.timeMs))
  const timeOf = (key: { id: string; timeMs: number }) => previewMs[key.id] ?? key.timeMs
  const visible = groupDopeSheetKeys(row, previewMs).filter(group => group.timeMs >= props.visibleStartMs - 10 / pixelsPerMs
    && group.timeMs <= props.visibleEndMs + 10 / pixelsPerMs)

  return <div className={`dope-keyframe-row ${row.node.type !== 'property' ? 'summary-row' : ''}`}
    style={{ height: DOPE_SHEET_ROW_HEIGHT, backgroundSize: `${props.gridStepMs * pixelsPerMs}px 100%` }}
    onPointerDown={props.onEmptyPointerDown}>
    {row.node.type === 'property' && keys.slice(0, -1).map((key, i) => {
      const left = timeOf(key) * pixelsPerMs
      const right = timeOf(keys[i + 1]) * pixelsPerMs
      return <div key={`span:${key.id}`} className="keyframe-segment" style={{ left, width: right - left }} />
    })}
    <div className="dope-current-time" style={{ left: props.currentTimeMs * pixelsPerMs }} />
    {props.snapTarget != null && <div className="dope-snap-target" style={{ left: props.snapTarget * pixelsPerMs }} />}
    {visible.map(group => {
      const allSelected = group.ids.every(id => props.selectedKfIds.has(id))
      const someSelected = group.ids.some(id => props.selectedKfIds.has(id))
      const count = group.ids.length > 1 ? `${group.ids.length} keyframes` : 'keyframe'
      return <button type="button" key={group.ids[0]} data-key-id={group.ids[0]} data-key-ids={group.ids.join(' ')}
        className={`keyframe-symbol ${allSelected ? 'selected' : someSelected ? 'partially-selected' : ''}`}
        style={{ left: group.timeMs * pixelsPerMs }}
        aria-label={`${row.node.name} ${count} at ${Math.round(group.timeMs)} milliseconds`}
        aria-pressed={allSelected ? true : someSelected ? 'mixed' : false}
        onPointerDown={event => props.onKeyPointerDown(event, group.ids)}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault(); event.stopPropagation()
          props.onKeySelect(group.ids, event.shiftKey, event.ctrlKey || event.metaKey)
        }}
        title={`${row.node.name}: ${Math.round(group.timeMs)}ms · ${count}`}>
        ◆
      </button>
    })}
  </div>
}
