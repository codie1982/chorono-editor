'use client'
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

        {/* Right: layer activity bar */}
        <div className="flex-1 relative">
          <LayerActivityBar layer={layer} msToScreenPx={msToScreenPx} />
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

// ── Layer activity bar (right side of header row) ────────────────────────────

function LayerActivityBar({ layer, msToScreenPx }: {
  layer: Layer
  msToScreenPx: (ms: number) => number
}) {
  // Without an explicit start/end we assume the layer is active for the whole timeline.
  const startMs = layer.startMs ?? 0
  const endMs   = layer.endMs   ?? msToScreenPxInverse(msToScreenPx)
  const x0 = msToScreenPx(startMs)
  const x1 = msToScreenPx(endMs)
  const w  = Math.max(2, x1 - x0)
  return (
    <div
      className="absolute top-1 bottom-1 rounded-sm bg-blue-500/30 border border-blue-500/50"
      style={{ left: `${x0}px`, width: `${w}px` }}
      title={`${layer.name}: ${Math.round(startMs)}–${Math.round(endMs)} ms`}
    />
  )
}

// Tiny helper: we don't know the duration here, so fall back to whatever
// msToScreenPx(0) inverts to. In practice the parent will always pass real
// startMs/endMs once we wire layer-time-range editing.
function msToScreenPxInverse(_msToScreenPx: (ms: number) => number): number {
  return 1000000  // arbitrary large — clipped by overflow-hidden on parent
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
