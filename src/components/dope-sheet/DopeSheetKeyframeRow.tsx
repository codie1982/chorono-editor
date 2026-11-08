'use client'
import { useMemo } from 'react'
import type { DopeSheetRow } from './types'
import { DOPE_SHEET_ROW_HEIGHT } from './types'
import { groupDopeSheetKeys } from '@/lib/dope-sheet/rows'
import type { VirtualRowAttributes } from '@/components/virtualization/WindowedRows'
import { KeyGlyphLayer } from '@/components/timeline/glyphs'
import { MAX_KEY_DOM_GLYPHS } from '@/lib/timeline/glyphs/KeyGlyphLayout'

interface Props {
  row: DopeSheetRow
  attributes?: VirtualRowAttributes
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
  const keys = useMemo(() => Array.from(new Map(row.tracks.flatMap(track => track.keyframes.map(key => [key.id, key] as const))).values())
    .sort((a, b) => (previewMs[a.id] ?? a.timeMs) - (previewMs[b.id] ?? b.timeMs)), [row.tracks, previewMs])
  const timeOf = (key: { id: string; timeMs: number }) => previewMs[key.id] ?? key.timeMs
  const groups = useMemo(() => groupDopeSheetKeys(row, previewMs), [row, previewMs])
  const points = useMemo(() => groups.map((group, sourceIndex) => ({ id: group.ids[0], members: group.ids, sourceIndex,
    x: (group.timeMs - props.visibleStartMs) * pixelsPerMs, y: DOPE_SHEET_ROW_HEIGHT / 2 })), [groups, props.visibleStartMs, pixelsPerMs])
  const width = Math.max(0, (props.visibleEndMs - props.visibleStartMs) * pixelsPerMs)
  const continuous = keys.length > MAX_KEY_DOM_GLYPHS && keys.length > 1
    ? { left: Math.max(props.visibleStartMs, timeOf(keys[0])) * pixelsPerMs,
      right: Math.min(props.visibleEndMs, timeOf(keys[keys.length - 1])) * pixelsPerMs } : null

  return <div {...props.attributes} className={`dope-keyframe-row ${row.node.type !== 'property' ? 'summary-row' : ''}`}
    style={{ height: DOPE_SHEET_ROW_HEIGHT, backgroundSize: `${props.gridStepMs * pixelsPerMs}px 100%` }}
    onPointerDown={props.onEmptyPointerDown}>
    {row.node.type === 'property' && continuous && continuous.right > continuous.left && <div className="keyframe-segment"
      style={{ left: continuous.left, width: continuous.right - continuous.left }} />}
    {row.node.type === 'property' && !continuous && keys.slice(0, -1).map((key, i) => {
      if (timeOf(keys[i + 1]) < props.visibleStartMs || timeOf(key) > props.visibleEndMs) return null
      const left = timeOf(key) * pixelsPerMs
      const right = timeOf(keys[i + 1]) * pixelsPerMs
      return <div key={`span:${key.id}`} className="keyframe-segment" style={{ left, width: right - left }} />
    })}
    <div className="dope-current-time" style={{ left: props.currentTimeMs * pixelsPerMs }} />
    {props.snapTarget != null && <div className="dope-snap-target" style={{ left: props.snapTarget * pixelsPerMs }} />}
    <KeyGlyphLayer points={points} width={width} height={DOPE_SHEET_ROW_HEIGHT} left={props.visibleStartMs * pixelsPerMs}
      label={row.node.name} selected={props.selectedKfIds} radius={5}
      palette={DOPE_PALETTE}
      onPointerDown={(point, event) => props.onKeyPointerDown(event, groups[point.sourceIndex].ids)}
      onSelect={(point, event) => props.onKeySelect(groups[point.sourceIndex].ids, event.shiftKey, event.ctrlKey || event.metaKey)}
      renderKey={(point, accessibility) => {
      const group = groups[point.sourceIndex]
      const allSelected = group.ids.every(id => props.selectedKfIds.has(id))
      const someSelected = group.ids.some(id => props.selectedKfIds.has(id))
      const count = group.ids.length > 1 ? `${group.ids.length} keyframes` : 'keyframe'
      return <button type="button" key={group.ids[0]} data-key-id={group.ids[0]} data-key-ids={group.ids.join(' ')}
        data-glyph-control="" aria-describedby={accessibility.descriptionId}
        className={`keyframe-symbol ${allSelected ? 'selected' : someSelected ? 'partially-selected' : ''}`}
        style={{ left: point.x }}
        aria-label={`${row.node.name} ${count} at ${Math.round(group.timeMs)} milliseconds${accessibility.ordinal ? ` · ${accessibility.ordinal}` : ''}`}
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
    }} />
  </div>
}

const DOPE_PALETTE = ['fill-slate-300 stroke-slate-300', 'fill-blue-300 stroke-blue-300', 'fill-blue-400 stroke-blue-400'] as const
