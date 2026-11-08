'use client'
import { useMemo } from 'react'
import type { EasingType, Track } from '@/lib/types'
import { sampleTrackValueRange, valueToY } from '@/lib/timeline/valueGraph'
import type { DragSnapshot } from '../hooks/useKeyframeDrag'
import TimelineKeyframe from '../TimelineKeyframe'
import { KeyGlyphLayer } from './KeyGlyphLayer'

interface Props {
  track: Track; width: number; height: number; graph: boolean; locked: boolean
  msToX: (ms: number) => number; previewMs: Record<string, number>; selected: Set<string>
  onSelect(id: string, shift: boolean): void
  onDelete(target: string, id: string): void
  onEasing(target: string, id: string, easing: EasingType): void
  onBeginDrag(leader: DragSnapshot, lone: boolean, shift: boolean): (event: React.PointerEvent) => void
  onContextMenu?(target: string, id: string, event: React.MouseEvent): void
  onDoubleClick?(target: string, id: string, event: React.MouseEvent): void
}

/** Projects native key controls into the shared bounded glyph view. All edits
 * delegate to the existing timeline command/drag callbacks, including locking,
 * preview times, group membership and pointer capture. Geometry memo survives
 * unrelated playhead updates; no scene/keyframe is mutated or serialized. */
export default function TrackKeyframes(props: Props) {
  const { track, height, graph, previewMs, msToX } = props
  const points = useMemo(() => {
    const range = graph ? sampleTrackValueRange(track) : null
    return track.keyframes.map((key, sourceIndex) => ({ id: key.id, sourceIndex,
      x: msToX(previewMs[key.id] ?? key.timeMs),
      y: range && typeof key.value === 'number' ? valueToY(key.value, range, height) : height / 2 }))
  }, [track, height, graph, previewMs, msToX])
  const pointerDown = (index: number, event: React.PointerEvent) => {
    if (props.locked) { event.preventDefault(); event.stopPropagation(); return }
    const key = track.keyframes[index]
    props.onBeginDrag({ kfId: key.id, trackTarget: track.target, timelineId: '', originalMs: key.timeMs },
      !props.selected.has(key.id) && !event.shiftKey, event.shiftKey)(event)
  }
  return <KeyGlyphLayer points={points} width={props.width} height={height} label={track.target} selected={props.selected}
    onPointerDown={(point, event) => pointerDown(point.sourceIndex, event)}
    onSelect={(point, event) => props.onSelect(point.id, event.shiftKey)}
    onContextMenu={props.onContextMenu ? (point, event) => props.onContextMenu!(track.target, point.id, event) : undefined}
    onDoubleClick={!props.locked && props.onDoubleClick ? (point, event) => props.onDoubleClick!(track.target, point.id, event) : undefined}
    renderKey={(point, glyphAccessibility) => {
      const key = track.keyframes[point.sourceIndex]
      return <TimelineKeyframe kf={key} x={point.x} y={point.y} glyphAccessibility={glyphAccessibility}
        isSelected={props.selected.has(key.id)} isDragging={previewMs[key.id] != null}
        onSelect={shift => props.onSelect(key.id, shift)}
        onDelete={() => { if (!props.locked) props.onDelete(track.target, key.id) }}
        onSetEasing={easing => { if (!props.locked) props.onEasing(track.target, key.id, easing) }}
        onPointerDown={event => pointerDown(point.sourceIndex, event)}
        onContextMenu={props.onContextMenu ? event => props.onContextMenu!(track.target, key.id, event) : undefined}
        onDoubleClick={!props.locked && props.onDoubleClick ? event => props.onDoubleClick!(track.target, key.id, event) : undefined} />
    }} />
}
