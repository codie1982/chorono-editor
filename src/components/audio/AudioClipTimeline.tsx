'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChronoScene, Layer, TimelineSettings, Track, EasingType } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { DragSnapshot } from '@/components/timeline/hooks/useKeyframeDrag'
import { dbToGain, resolveAudioClipWindow } from '@/lib/audio/audioClip'
import { gainEnvelopeY } from './gainEnvelopeY'
import { evaluateTrack } from '@/lib/evaluator'
import { audioGainKeyCommand } from './audioGainKeyCommand'
import AudioWaveform from '@/components/timeline/AudioWaveform'
import TimelineKeyframe from '@/components/timeline/TimelineKeyframe'
import { KeyGlyphLayer } from '@/components/timeline/glyphs'
import { audioGestureEdge, createAudioClipGesture, type AudioClipGestureKind } from './audioClipGesture'
import { activateAudioClipSelection } from './audioClipSelection'

export interface AudioTimelineContext {
  scene: ChronoScene; editor: EditorStateReturn; settings: TimelineSettings; timelineId?: string; isPlaying: boolean;
  clearKeySelection?: () => void;
}
interface Props {
  layer: Layer; context: AudioTimelineContext; audioUrl?: string; durationMs: number; visibleStartMs: number; visibleEndMs: number;
  msToScreenPx: (ms: number) => number; onSelect: (shiftHeld: boolean) => void; tracks: readonly Track[];
  selectedKfIds: Set<string>; previewMs: Record<string, number>;
  onSelectKf: (id: string, shift: boolean) => void;
  onBeginKfDrag: (leader: DragSnapshot, isLone: boolean, shift: boolean) => (event: React.PointerEvent) => void;
  onDeleteKf: (target: string, id: string) => void;
  onSetEasing: (target: string, id: string, easing: EasingType) => void;
  onKfContextMenu?: (target: string, id: string, event: React.MouseEvent) => void;
  onKfDoubleClick?: (target: string, id: string, event: React.MouseEvent) => void;
}
const HEIGHT = 56
export { gainEnvelopeY } from './gainEnvelopeY'

export default function AudioClipTimeline(props: Props) {
  const { layer, context } = props
  const { editor } = context
  const cancelRef = useRef<(() => void) | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const asset = context.scene.assets.find(asset => asset.id === layer.audio?.assetId)
  const range = resolveAudioClipWindow(layer, asset?.durationMs, props.durationMs)
  const pixelsPerMs = Math.max(0.00001, (props.msToScreenPx(1000) - props.msToScreenPx(0)) / 1000)
  const visibleStart = Math.max(range.startMs, props.visibleStartMs)
  const visibleEnd = Math.min(range.endMs, props.visibleEndMs)
  const visibleWidth = Math.max(0, (visibleEnd - visibleStart) * pixelsPerMs)
  const volumeTrack = props.tracks.find(track => track.target === `layers.${layer.id}.audio.volume`)
  const glyphPoints = useMemo(() => (volumeTrack?.keyframes ?? []).flatMap((key, sourceIndex) => {
    const time = props.previewMs[key.id] ?? key.timeMs
    return time < visibleStart || time > visibleEnd || typeof key.value !== 'number' ? []
      : [{ id: key.id, sourceIndex, x: (time - visibleStart) * pixelsPerMs, y: gainEnvelopeY(key.value) }]
  }), [volumeTrack, props.previewMs, visibleStart, visibleEnd, pixelsPerMs])
  const gainAt = (ms: number) => {
    const value = volumeTrack ? evaluateTrack(volumeTrack, ms) : layer.audio?.volume ?? 1
    return typeof value === 'number' ? value : layer.audio?.volume ?? 1
  }
  useEffect(() => () => cancelRef.current?.(), [layer.id, context.timelineId])
  useEffect(() => { if (context.isPlaying) cancelRef.current?.() }, [context.isPlaying])

  const begin = (event: React.PointerEvent<HTMLElement>, kind: AudioClipGestureKind) => {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.focus({ preventScroll: true })
    activateAudioClipSelection('clip', event.shiftKey, props.onSelect, context.clearKeySelection)
    if (layer.locked || context.isPlaying) return
    cancelRef.current?.()
    setError(null)
    const session = createAudioClipGesture({ scene: editor.getScene(), layerId: layer.id, kind,
      timelineId: layer.audio?.timelineId ?? context.timelineId, startX: event.clientX, pixelsPerMs,
      durationMs: props.durationMs, settings: context.settings, frameRate: context.scene.composition.frameRate,
      onBegin: editor.beginTransaction, onPreview: editor.previewTransaction,
      onCommit: editor.commitTransaction, onCancel: editor.cancelTransaction,
    })
    if (!session) return
    setDragging(true)
    const id = event.pointerId
    const target = event.currentTarget
    try { target.setPointerCapture(id) } catch { /* optional in embedded browser */ }
    const clear = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      try { target.releasePointerCapture(id) } catch { /* released */ }
      session.cancel(); cancelRef.current = null; setDragging(false)
    }
    const failed = (err: unknown) => { setError(err instanceof Error ? err.message : String(err)); clear() }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      try { session.move(e.clientX, e.ctrlKey || e.metaKey) } catch (err) { failed(err) }
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      try { session.finish(e.clientX, e.ctrlKey || e.metaKey); clear() } catch (err) { failed(err) }
    }
    const cancel = (e: PointerEvent) => { if (e.pointerId === id) clear() }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); clear() }
    }
    cancelRef.current = clear
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
  }

  if (!(visibleWidth > 0)) return null
  const gainPath: string[] = []
  for (let x = 0; x <= visibleWidth; x += 4) gainPath.push(`${x === 0 ? 'M' : 'L'}${x},${gainEnvelopeY(gainAt(visibleStart + x / pixelsPerMs))}`)
  const leftEdgeVisible = range.startMs >= props.visibleStartMs
  const rightEdgeVisible = range.endMs <= props.visibleEndMs
  const handle = (kind: AudioClipGestureKind, label: string, timeMs: number, top = 0) => {
    if (timeMs < visibleStart || timeMs > visibleEnd) return null
    return <button key={kind} type="button" aria-label={`${label} ${layer.name}`} disabled={layer.locked || context.isPlaying}
      onPointerDown={event => begin(event, kind)}
      className="absolute z-20 w-3 h-4 rounded-sm border border-amber-200/60 bg-amber-500/70 cursor-ew-resize disabled:opacity-30"
      style={{ left: Math.max(0, Math.min(visibleWidth - 12, (timeMs - visibleStart) * pixelsPerMs - 6)), top }}
      title={`${label}: ${Math.round(timeMs)}ms`}>◇</button>
  }
  return <div className="absolute inset-0 overflow-hidden" data-audio-clip={layer.id}>
    <div role="group" tabIndex={0} aria-label={`Audio clip ${layer.name}`}
      className={`absolute top-1 bottom-1 rounded border overflow-hidden ${dragging ? 'border-blue-200' : 'border-cyan-700'}`}
      style={{ left: props.msToScreenPx(visibleStart), width: visibleWidth, background: layer.audio?.muted ? '#25303a' : '#123647' }}
      onPointerDown={event => begin(event, 'move')}
      onDoubleClick={event => {
        if (layer.locked || context.isPlaying || !context.timelineId || (event.target as HTMLElement).closest('button')) return
        const rect = event.currentTarget.getBoundingClientRect()
        const timeMs = Math.max(range.startMs, Math.min(range.endMs, visibleStart + (event.clientX - rect.left) / pixelsPerMs))
        const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top - 4) / (rect.height - 8)))
        editor.dispatchCommand(audioGainKeyCommand(layer, context.timelineId, timeMs, dbToGain(12 - ratio * 72)))
      }} title="Drag to move · Double-click to add a gain keyframe">
      {props.audioUrl ? <AudioWaveform url={props.audioUrl} color={layer.audio?.muted ? '#71818b' : '#80d8ef'}
        sourceOffsetMs={range.sourceOffsetMs} clipStartMs={range.startMs} clipDurationMs={range.durationMs}
        visibleStartMs={visibleStart} pixelsPerMs={pixelsPerMs} loop={!!layer.audio?.loop} />
        : <span className="text-[10px] text-gray-500">Audio source unavailable</span>}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${visibleWidth} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={gainPath.join(' ')} stroke="#facc15" strokeWidth="1.5" fill="none" />
        {range.fadeInMs > 0 && <path d={`M0,${HEIGHT} L${Math.max(0, (range.fadeStartMs + range.fadeInMs - visibleStart) * pixelsPerMs)},0 L0,0 Z`} fill="#fbbf2425" />}
        {range.fadeOutMs > 0 && <path d={`M${Math.max(0, (range.fadeEndMs - range.fadeOutMs - visibleStart) * pixelsPerMs)},0 L${visibleWidth},${HEIGHT} L${visibleWidth},0 Z`} fill="#fbbf2425" />}
      </svg>
      {volumeTrack && <KeyGlyphLayer points={glyphPoints} width={visibleWidth} height={HEIGHT} label={`${layer.name} gain`}
        selected={props.selectedKfIds}
        onPointerDown={(point, event) => {
          if (layer.locked) { event.preventDefault(); event.stopPropagation(); return }
          const key = volumeTrack.keyframes[point.sourceIndex]
          activateAudioClipSelection('gainKey', event.shiftKey, props.onSelect, context.clearKeySelection)
          props.onBeginKfDrag({ kfId: key.id, trackTarget: volumeTrack.target, timelineId: context.timelineId ?? '', originalMs: key.timeMs },
            !props.selectedKfIds.has(key.id) && !event.shiftKey, event.shiftKey)(event)
        }}
        onSelect={(point, event) => {
          activateAudioClipSelection('gainKey', event.shiftKey, props.onSelect, context.clearKeySelection)
          props.onSelectKf(point.id, event.shiftKey)
        }}
        onContextMenu={props.onKfContextMenu ? (point, event) => props.onKfContextMenu!(volumeTrack.target, point.id, event) : undefined}
        onDoubleClick={!layer.locked && props.onKfDoubleClick ? (point, event) => props.onKfDoubleClick!(volumeTrack.target, point.id, event) : undefined}
        renderKey={(point, glyphAccessibility) => {
        const key = volumeTrack.keyframes[point.sourceIndex]
        return <TimelineKeyframe kf={key} x={point.x} y={point.y} glyphAccessibility={glyphAccessibility}
          isSelected={props.selectedKfIds.has(key.id)} isDragging={props.previewMs[key.id] != null}
          onSelect={shift => {
            activateAudioClipSelection('gainKey', shift, props.onSelect, context.clearKeySelection)
            props.onSelectKf(key.id, shift)
          }} onDelete={() => { if (!layer.locked) props.onDeleteKf(volumeTrack.target, key.id) }}
          onSetEasing={easing => { if (!layer.locked) props.onSetEasing(volumeTrack.target, key.id, easing) }}
          onContextMenu={props.onKfContextMenu ? event => props.onKfContextMenu!(volumeTrack.target, key.id, event) : undefined}
          onDoubleClick={!layer.locked && props.onKfDoubleClick ? event => props.onKfDoubleClick!(volumeTrack.target, key.id, event) : undefined}
          onPointerDown={event => {
            if (layer.locked) { event.preventDefault(); event.stopPropagation(); return }
            activateAudioClipSelection('gainKey', event.shiftKey, props.onSelect, context.clearKeySelection)
            props.onBeginKfDrag({ kfId: key.id, trackTarget: volumeTrack.target, timelineId: context.timelineId ?? '', originalMs: key.timeMs },
              !props.selectedKfIds.has(key.id) && !event.shiftKey, event.shiftKey)(event)
          }} />
      }} />}
      {handle('fadeIn', 'Fade in', audioGestureEdge(range, 'fadeIn'), 0)}
      {handle('fadeOut', 'Fade out', audioGestureEdge(range, 'fadeOut'), HEIGHT - 16)}
      {leftEdgeVisible && <button type="button" aria-label={`Trim start ${layer.name}`} disabled={layer.locked || context.isPlaying}
        className="absolute left-0 top-4 bottom-0 z-10 w-1.5 bg-cyan-300/50 cursor-ew-resize"
        onPointerDown={event => begin(event, 'trimStart')} />}
      {rightEdgeVisible && <button type="button" aria-label={`Trim end ${layer.name}`} disabled={layer.locked || context.isPlaying}
        className="absolute right-0 top-4 bottom-0 z-10 w-1.5 bg-cyan-300/50 cursor-ew-resize"
        onPointerDown={event => begin(event, 'trimEnd')} />}
    </div>
    {error && <span role="alert" className="absolute bottom-0 left-2 text-[10px] text-red-300">{error}</span>}
  </div>
}
