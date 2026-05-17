'use client'
import { useEffect, useRef, useState } from 'react'
import type { Layer, Track, EasingType, AnimatableProperty } from '@/lib/types'
import { ANIMATABLE_PROPERTIES } from '@/lib/types'
import { sampleTrackValueRange, valueToY } from '@/lib/timeline/valueGraph'
import TimelineKeyframe from './TimelineKeyframe'
import TrackValueGraph  from './TrackValueGraph'
import type { DragSnapshot } from './hooks/useKeyframeDrag'

/**
 * AE-style: one section per layer. Renders both the left label column AND the
 * right track area for a single layer, keeping them in lockstep.
 *
 * When `expanded` is false only the layer header row is shown. When expanded
 * we render N property tracks + one inline "Add animation" picker at the end.
 */
interface Props {
  layer: Layer
  tracks: Track[]
  expanded: boolean
  graphMode: boolean
  isPrimary: boolean
  isInSet: boolean
  // viewport / interaction
  trackWidth: number
  msToScreenPx: (ms: number) => number
  visibleStartMs: number
  visibleEndMs: number
  selectedKfIds: Set<string>
  previewMs: Record<string, number>
  // callbacks
  onToggleExpand: () => void
  onSelectLayer:  (shiftHeld: boolean) => void
  onToggleFlag:   (field: 'locked' | 'hidden' | 'solo') => void
  onAddTrack:     (propertyPath: string) => void
  onRemoveTrack:  (trackTarget: string) => void
  onAddKeyframeAtPlayhead: (trackTarget: string) => void
  onDeleteKf:    (trackTarget: string, kfId: string) => void
  onSetEasing:   (trackTarget: string, kfId: string, easing: EasingType) => void
  onSelectKf:    (kfId: string, shiftHeld: boolean) => void
  onBeginKfDrag: (leader: DragSnapshot, isLone: boolean, shiftHeld: boolean) => (e: React.PointerEvent) => void
  /** Right-click on a keyframe → opens context menu in TimelinePanel. */
  onKfContextMenu?: (trackTarget: string, kfId: string, e: React.MouseEvent) => void
  /** Double-click on a keyframe → opens inline value editor. */
  onKfDoubleClick?: (trackTarget: string, kfId: string, e: React.MouseEvent) => void
  /** Right-click on the layer's activity bar → opens layer-bar context menu. */
  onLayerBarContextMenu?: (layerId: string, e: React.MouseEvent) => void
  /** Total duration of the selected timeline, for clamping drag. */
  durationMs: number
  /**
   * Fired when the user finishes dragging the layer activity bar.
   * `kind='move'`      → bar body was dragged (shift both start+end)
   * `kind='trimStart'` → left edge was dragged (change startMs)
   * `kind='trimEnd'`   → right edge was dragged (change endMs)
   */
  onLayerBarCommit?: (
    layerId:     string,
    kind:        'move' | 'trimStart' | 'trimEnd',
    fromStartMs: number,
    fromEndMs:   number | undefined,
    toStartMs:   number,
    toEndMs:     number | undefined,
  ) => void
}

const ROW_HEADER  = 32
const ROW_TRACK   = 28
const ROW_TRACK_G = 72
const ROW_ADD     = 28

export default function LayerTimelineSection({
  layer, tracks, expanded, graphMode, isPrimary, isInSet,
  trackWidth, msToScreenPx, visibleStartMs, visibleEndMs,
  selectedKfIds, previewMs,
  onToggleExpand, onSelectLayer, onToggleFlag,
  onAddTrack, onRemoveTrack, onAddKeyframeAtPlayhead,
  onDeleteKf, onSetEasing, onSelectKf, onBeginKfDrag,
  onKfContextMenu, onKfDoubleClick, onLayerBarContextMenu,
  durationMs, onLayerBarCommit,
}: Props) {

  const rowH = graphMode ? ROW_TRACK_G : ROW_TRACK

  // Properties already animated on this layer (so we don't offer them twice)
  const animatedPaths = new Set(
    tracks.map((t) => t.target.replace(`layers.${layer.id}.`, '')),
  )
  const availableProps = ANIMATABLE_PROPERTIES.filter((p) => {
    if (animatedPaths.has(p.path)) return false
    return !p.layerTypes || p.layerTypes.includes(layer.type)
  })

  return (
    <div className={`${isInSet && !isPrimary ? 'bg-blue-950/30' : ''}`}>
      {/* ── Layer header row (label + activity bar) ───────────────────────── */}
      <div
        className={`flex items-stretch border-b border-gray-800
          ${isPrimary ? 'bg-blue-950/40' : ''} ${layer.hidden ? 'opacity-60' : ''}`}
        style={{ height: ROW_HEADER }}
      >
        {/* Left: label */}
        <div
          className="w-60 shrink-0 flex items-center gap-1.5 px-2 border-r border-gray-700 cursor-pointer"
          onClick={(e) => onSelectLayer(e.shiftKey)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
            className="w-4 text-xs text-gray-500 hover:text-gray-300"
          >{expanded ? '▾' : '▸'}</button>
          <span className="w-4 text-xs text-center">{LAYER_ICON[layer.shape ?? layer.type] ?? '□'}</span>
          <span className="flex-1 truncate text-xs text-gray-200">{layer.name}</span>
          <span className="text-[9px] font-mono text-gray-500">{tracks.length}</span>
          <LayerFlag active={!layer.hidden} on="●" off="○" onClick={(e) => { e.stopPropagation(); onToggleFlag('hidden') }} />
          <LayerFlag active={!!layer.locked} on="🔒" off="🔓" onClick={(e) => { e.stopPropagation(); onToggleFlag('locked') }} />
          <LayerFlag active={!!layer.solo} on="S" off="s" highlight={layer.solo ? 'text-amber-400 font-bold' : ''}
            onClick={(e) => { e.stopPropagation(); onToggleFlag('solo') }} />
        </div>

        {/* Right: layer activity bar (draggable) */}
        <div
          className="flex-1 relative"
          onContextMenu={onLayerBarContextMenu && ((e) => onLayerBarContextMenu(layer.id, e))}
        >
          <DraggableLayerBar
            layer={layer}
            msToScreenPx={msToScreenPx}
            visibleStartMs={visibleStartMs}
            visibleEndMs={visibleEndMs}
            trackWidth={trackWidth}
            durationMs={durationMs}
            onCommit={(kind, fromStart, fromEnd, toStart, toEnd) =>
              onLayerBarCommit?.(layer.id, kind, fromStart, fromEnd, toStart, toEnd)
            }
          />
        </div>
      </div>

      {/* ── Property track rows (expanded only) ───────────────────────────── */}
      {expanded && tracks.map((track) => {
        const propPath = track.target.replace(`layers.${layer.id}.`, '')
        const range = sampleTrackValueRange(track)
        return (
          <div key={track.target} className="flex items-stretch border-b border-gray-800/60"
            style={{ height: rowH }}>
            <div className="w-60 shrink-0 flex items-center gap-1.5 pl-8 pr-2 border-r border-gray-700 group">
              <button
                onClick={() => onAddKeyframeAtPlayhead(track.target)}
                className="text-[10px] text-yellow-400 hover:text-yellow-300 shrink-0"
                title="Add keyframe at playhead for this property"
              >◆</button>
              <span className="flex-1 truncate text-[10px] font-mono text-gray-400" title={track.target}>
                {propPath}
              </span>
              <button
                onClick={() => onRemoveTrack(track.target)}
                className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-red-400"
                title="Remove this animation"
              >⊗</button>
            </div>

            <div className="flex-1 relative bg-gray-900/40 overflow-hidden">
              <TrackValueGraph
                track={track} heightPx={rowH} trackWidthPx={trackWidth}
                visibleStartMs={visibleStartMs} visibleEndMs={visibleEndMs}
                msToScreenPx={msToScreenPx} emphasized={graphMode}
              />
              {track.keyframes.map((kf) => {
                const effectiveMs = previewMs[kf.id] ?? kf.timeMs
                const x = msToScreenPx(effectiveMs)
                if (x < -10 || x > trackWidth + 10) return null
                const y = graphMode && range && typeof kf.value === 'number'
                  ? valueToY(kf.value, range, rowH)
                  : rowH / 2
                return (
                  <TimelineKeyframe
                    key={kf.id}
                    kf={kf}
                    x={x} y={y}
                    isSelected={selectedKfIds.has(kf.id)}
                    isDragging={previewMs[kf.id] != null}
                    onSelect={(shiftHeld) => onSelectKf(kf.id, shiftHeld)}
                    onDelete={() => onDeleteKf(track.target, kf.id)}
                    onSetEasing={(et) => onSetEasing(track.target, kf.id, et)}
                    onPointerDown={(e) => {
                      const isLone = !selectedKfIds.has(kf.id) && !e.shiftKey
                      const handler = onBeginKfDrag(
                        { kfId: kf.id, trackTarget: track.target, timelineId: '', originalMs: kf.timeMs },
                        isLone, e.shiftKey,
                      )
                      handler(e)
                    }}
                    onContextMenu={onKfContextMenu && ((e) => onKfContextMenu(track.target, kf.id, e))}
                    onDoubleClick={onKfDoubleClick && ((e) => onKfDoubleClick(track.target, kf.id, e))}
                  />
                )
              })}
            </div>
          </div>
        )
      })}

      {/* ── Inline "Add animation" picker (always at the bottom) ─────────── */}
      {expanded && (
        <div className="flex items-stretch border-b border-gray-800"
          style={{ height: ROW_ADD }}>
          <div className="w-60 shrink-0 flex items-center gap-1 pl-8 pr-2 border-r border-gray-700">
            <span className="text-[10px] text-gray-500 shrink-0">+</span>
            <select
              defaultValue=""
              onChange={(e) => { if (e.target.value) { onAddTrack(e.target.value); e.target.value = '' } }}
              disabled={availableProps.length === 0}
              className="flex-1 bg-transparent border-0 text-[10px] text-purple-300 font-mono
                         focus:outline-none disabled:text-gray-600 cursor-pointer truncate"
            >
              <option value="" disabled>
                {availableProps.length === 0 ? '(all properties animated)' : 'Add animation…'}
              </option>
              {groupByCategory(availableProps).map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex-1 bg-gray-900/20" />
        </div>
      )}
    </div>
  )
}

// ── Draggable layer activity bar ─────────────────────────────────────────────
//
// Three interaction zones:
//   left  HANDLE_W px → trimStart (resize left edge, changes startMs)
//   body  (middle)   → move (shift both startMs + endMs, preserves duration)
//   right HANDLE_W px → trimEnd   (resize right edge, changes endMs)
//
// Local `preview` state gives instant visual feedback while dragging.
// The `onCommit` callback fires on pointerup so the parent can dispatch
// the appropriate undo-able command.

const HANDLE_W    = 6     // px width of each trim handle
const MIN_DUR_MS  = 10    // minimum bar duration in ms

type BarDragKind = 'move' | 'trimStart' | 'trimEnd'

function DraggableLayerBar({
  layer, msToScreenPx, visibleStartMs, visibleEndMs, trackWidth, durationMs, onCommit,
}: {
  layer:          Layer
  msToScreenPx:   (ms: number) => number
  visibleStartMs: number
  visibleEndMs:   number
  trackWidth:     number
  durationMs:     number
  onCommit: (
    kind:        BarDragKind,
    fromStartMs: number,
    fromEndMs:   number | undefined,
    toStartMs:   number,
    toEndMs:     number | undefined,
  ) => void
}) {
  // drag state must live in React state so changing it triggers the useEffect
  // below to (un)register global pointer listeners. previewRef mirrors preview
  // state so the pointerup handler always sees the freshest value.
  const [drag, setDrag] = useState<{
    kind:        BarDragKind
    startX:      number
    origStartMs: number
    origEndMs:   number | undefined
  } | null>(null)
  const previewRef = useRef<{ startMs: number; endMs: number } | null>(null)
  const [preview, setPreviewState] = useState<{ startMs: number; endMs: number } | null>(null)
  const setPreview = (v: typeof preview) => { previewRef.current = v; setPreviewState(v) }

  const origStart = layer.startMs ?? 0
  const origEnd   = layer.endMs   // undefined → whole timeline

  const dispStartMs = preview?.startMs ?? origStart
  const dispEndMs   = preview?.endMs   ?? origEnd ?? durationMs

  const x0 = msToScreenPx(dispStartMs)
  const x1 = msToScreenPx(dispEndMs)
  const w  = Math.max(HANDLE_W * 2 + 2, x1 - x0)

  const msPerPx = trackWidth > 0
    ? (visibleEndMs - visibleStartMs) / trackWidth
    : 1

  const beginDrag = (e: React.PointerEvent, kind: BarDragKind) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setDrag({ kind, startX: e.clientX, origStartMs: origStart, origEndMs: origEnd })
  }

  useEffect(() => {
    if (!drag) return

    const onMove = (e: PointerEvent) => {
      const dMs = (e.clientX - drag.startX) * msPerPx
      const oS  = drag.origStartMs
      const oE  = drag.origEndMs ?? durationMs
      const dur = oE - oS
      if (drag.kind === 'move') {
        const newS = Math.max(0, Math.min(durationMs - dur, oS + dMs))
        setPreview({ startMs: newS, endMs: newS + dur })
      } else if (drag.kind === 'trimStart') {
        const newS = Math.max(0, Math.min(oE - MIN_DUR_MS, oS + dMs))
        setPreview({ startMs: newS, endMs: oE })
      } else {
        const newE = Math.max(oS + MIN_DUR_MS, Math.min(durationMs, oE + dMs))
        setPreview({ startMs: oS, endMs: newE })
      }
    }

    const onUp = () => {
      const p = previewRef.current
      setDrag(null)
      setPreview(null)
      if (!p) return
      onCommit(drag.kind, drag.origStartMs, drag.origEndMs, p.startMs, p.endMs)
    }

    const onCancel = () => { setDrag(null); setPreview(null) }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [drag, msPerPx, durationMs, onCommit])

  return (
    <div
      className="absolute top-1 bottom-1 select-none"
      style={{ left: `${x0}px`, width: `${w}px` }}
    >
      {/* Left trim handle */}
      <div
        className="absolute left-0 top-0 bottom-0 z-10 rounded-l-sm
                   bg-blue-400/70 hover:bg-blue-300 cursor-ew-resize
                   flex items-center justify-center"
        style={{ width: HANDLE_W }}
        onPointerDown={(e) => beginDrag(e, 'trimStart')}
        title="Drag to trim start"
      >
        <div className="w-0.5 h-3 bg-white/40 rounded-full" />
      </div>

      {/* Body — move (grab to shift both start + end) */}
      <div
        className={`absolute top-0 bottom-0 rounded-sm border
          ${preview
            ? 'bg-blue-400/40 border-blue-300/70'
            : 'bg-blue-500/30 border-blue-500/50 hover:bg-blue-500/40'}
          cursor-grab active:cursor-grabbing`}
        style={{ left: HANDLE_W, right: HANDLE_W }}
        onPointerDown={(e) => beginDrag(e, 'move')}
        title={`${layer.name}: ${Math.round(dispStartMs)}–${Math.round(dispEndMs)} ms`}
      >
        {preview && (
          <span className="absolute inset-0 flex items-center justify-center
                           text-[9px] font-mono text-blue-200 pointer-events-none truncate px-1">
            {Math.round(dispStartMs)}–{Math.round(dispEndMs)}
          </span>
        )}
      </div>

      {/* Right trim handle */}
      <div
        className="absolute right-0 top-0 bottom-0 z-10 rounded-r-sm
                   bg-blue-400/70 hover:bg-blue-300 cursor-ew-resize
                   flex items-center justify-center"
        style={{ width: HANDLE_W }}
        onPointerDown={(e) => beginDrag(e, 'trimEnd')}
        title="Drag to trim end"
      >
        <div className="w-0.5 h-3 bg-white/40 rounded-full" />
      </div>
    </div>
  )
}

// ── Small flag toggle (eye / lock / solo) ────────────────────────────────────

function LayerFlag({ active, on, off, highlight, onClick }: {
  active: boolean
  on: string
  off: string
  highlight?: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-3.5 h-3.5 text-[10px] leading-none flex items-center justify-center shrink-0
        ${active ? 'opacity-90' : 'opacity-40 hover:opacity-70'} ${highlight ?? ''}`}
    >
      {active ? on : off}
    </button>
  )
}

// ── Category grouping for the property picker ────────────────────────────────

function groupByCategory(props: AnimatableProperty[]) {
  const groups = new Map<string, AnimatableProperty[]>()
  for (const p of props) {
    const arr = groups.get(p.group) ?? []
    arr.push(p)
    groups.set(p.group, arr)
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

const LAYER_ICON: Record<string, string> = {
  rect: '⬛', circle: '⭕', text: '𝙏', image: '🖼', video: '▶', audio: '♪',
}
