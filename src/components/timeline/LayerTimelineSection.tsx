'use client'
import { handleLayerTreeKey } from '@/components/layerHierarchy/LayerTreeKeyboard'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Layer, Track, EasingType, AnimatableProperty, ParameterWire } from '@/lib/types'
import { ANIMATABLE_PROPERTIES, isPropertyAnimatableOn } from '@/lib/types'
import { findWireForProperty } from '@/lib/wiring/helpers'
import TrackKeyframes from './glyphs/TrackKeyframes'
import TrackValueGraph  from './TrackValueGraph'
import AudioWaveform    from './AudioWaveform'
import AudioClipTimeline, { type AudioTimelineContext } from '@/components/audio/AudioClipTimeline'
import AudioClipControls from '@/components/audio/AudioClipControls'
import { makePatchAudioClipCmd } from '@/lib/editor/commands-audio'
import { audioGainAtPlayhead, audioGainKeyCommand } from '@/components/audio/audioGainKeyCommand'
import { activateAudioClipSelection } from '@/components/audio/audioClipSelection'
import type { DragSnapshot } from './hooks/useKeyframeDrag'
import { RowLayout } from '@/lib/editor/virtualization/RowLayout'
import { WindowedRows, type VirtualRowAttributes } from '@/components/virtualization/WindowedRows'
import { useRowWindow } from '@/components/virtualization/useRowWindow'
import { TIMELINE_HEADER as ROW_HEADER, TIMELINE_ADD as ROW_ADD, headerHeight, trackHeight } from './layout/timelineRows'

/**
 * AE-style: one section per layer. Renders both the left label column AND the
 * right track area for a single layer, keeping them in lockstep.
 *
 * When `expanded` is false only the layer header row is shown. When expanded
 * we render N property tracks + one inline "Add animation" picker at the end.
 */
interface Props {
  layer: Layer
  tracks: readonly Track[]
  attributes?: VirtualRowAttributes
  scrollRef?: React.RefObject<HTMLElement>
  expanded: boolean
  depth?: number
  hasChildren?: boolean
  childrenExpanded?: boolean
  contextOnly?: boolean
  propertiesAvailable?: boolean
  onToggleChildren?: () => void
  onNavigate?: (direction: 'up' | 'down' | 'parent' | 'child') => void
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
  /** Right-click on the empty part of a property track row → "Add Keyframe Here" etc. */
  onTrackAreaContextMenu?: (trackTarget: string, timeMs: number, e: React.MouseEvent) => void
  /** Double-click on the empty part of a property track row → add keyframe at click. */
  onTrackAreaDoubleClick?: (trackTarget: string, timeMs: number) => void
  /** Right-click on the property name in the track header → "Out of Range ▸ ..." menu (BL-45). */
  onTrackHeaderContextMenu?: (trackTarget: string, e: React.MouseEvent) => void
  /** BL-05 — Scene parameter wires (for the 🔗 indicator on wired tracks). */
  parameterWires?: ParameterWire[]
  /** BL-05 — Click 🔗 on a track header → open WireParameterModal for that wire. */
  onEditWire?: (wire: ParameterWire) => void
  /** Convert a client X position to ms for the events above. */
  clientXToMs?: (clientX: number) => number
  /** Total duration of the selected timeline, for clamping drag. */
  durationMs: number
  /** Playhead time — used to detect whether a track has a key at the playhead
   *  (so the per-track button toggles between add `+` and remove `−`). */
  currentTimeMs: number
  /** Composition frame rate — sets the "key at playhead" match tolerance. */
  frameRate: number
  /** Width (px) of the left label column — resizable from the panel divider. */
  labelColWidth: number
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
  /** Index among pinned layers (0,1,2…). Undefined or -1 → not pinned.
   *  Used to set sticky `top` offset so multiple pins stack. */
  pinIndex?: number
  /** Resolved asset URL for audio layers — when present the activity bar
   *  renders the audio waveform overlay (BL-37). */
  audioUrl?: string
  audioContext?: AudioTimelineContext
  pinTop?: number
}

export default function LayerTimelineSection({
  layer, tracks, expanded, graphMode, isPrimary, isInSet,
  trackWidth, msToScreenPx, visibleStartMs, visibleEndMs,
  selectedKfIds, previewMs,
  onToggleExpand, onSelectLayer, onToggleFlag,
  onAddTrack, onRemoveTrack, onAddKeyframeAtPlayhead,
  onDeleteKf, onSetEasing, onSelectKf, onBeginKfDrag,
  onKfContextMenu, onKfDoubleClick, onLayerBarContextMenu,
  onTrackAreaContextMenu, onTrackAreaDoubleClick, onTrackHeaderContextMenu, clientXToMs,
  durationMs, currentTimeMs, frameRate, labelColWidth, onLayerBarCommit, pinIndex, audioUrl,
  parameterWires, onEditWire,
  audioContext, pinTop, attributes, scrollRef, depth = 0, hasChildren = false, childrenExpanded = true,
  contextOnly = false, propertiesAvailable = true, onToggleChildren, onNavigate,
}: Props) {

  // A track "has a key at the playhead" when one sits within half a frame of
  // the current time — drives the per-track +/− toggle.
  const keyMatchEps = Math.max(1, 1000 / (frameRate * 2))

  const isPinned = pinIndex != null && pinIndex >= 0

  const rowH = trackHeight(graphMode)
  const trackRowsRef = useRef<HTMLDivElement>(null)
  const fallbackScrollRef = useRef<HTMLDivElement>(null)
  const trackLayout = useMemo(() => RowLayout.fixed(expanded ? tracks.length : 0, rowH), [expanded, tracks.length, rowH])
  const trackKeys = useMemo(() => tracks.map(track => track.target), [tracks])
  const trackWindow = useRowWindow(trackLayout, trackKeys, scrollRef ?? fallbackScrollRef, trackRowsRef)
  const trackIndices = scrollRef ? trackWindow.indices : tracks.map((_, i) => i)
  const audioTimelineId = layer.audio?.timelineId ?? audioContext?.timelineId
  const audioTracks = audioContext?.scene.timelines.find(timeline => timeline.id === audioTimelineId)?.tracks
    .filter(track => track.target.startsWith(`layers.${layer.id}.`)) ?? tracks

  // Properties already animated on this layer (so we don't offer them twice)
  const animatedPaths = new Set(
    tracks.map((t) => t.target.replace(`layers.${layer.id}.`, '')),
  )
  const availableProps = ANIMATABLE_PROPERTIES.filter((p) => {
    if (animatedPaths.has(p.path)) return false
    return isPropertyAnimatableOn(p, layer.type)
  })

  return (
    <div {...attributes} data-layer-depth={depth} data-context-only={contextOnly || undefined} className={`${isInSet && !isPrimary ? 'bg-blue-950/30' : ''}`}>
      {/* ── Layer header row (label + activity bar) ───────────────────────── */}
      <div
        className={`flex items-stretch border-b border-gray-800
          ${isPrimary ? 'bg-blue-950/40' : ''} ${layer.hidden ? 'opacity-60' : ''}
          ${isPinned ? 'bg-gray-900 shadow-md shadow-black/40' : ''}`}
        style={{
          height: headerHeight(layer),
          ...(isPinned ? {
            position: 'sticky',
            top: pinTop ?? pinIndex! * ROW_HEADER,
            zIndex: 5,
          } : null),
        }}
      >
        {/* Left: label */}
        <div
          className="shrink-0 flex flex-col justify-center gap-1 px-2 border-r border-gray-700 cursor-pointer relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 focus-visible:outline-offset-[-2px]"
          style={{ width: labelColWidth, paddingLeft: 8 + Math.min(depth, 16) * 12 }}
          role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren ? childrenExpanded : undefined}
          aria-selected={isPrimary || isInSet} tabIndex={0}
          onKeyDown={event => handleLayerTreeKey(event, { hasChildren, expanded: childrenExpanded,
            onSelect: onSelectLayer, onToggle: onToggleChildren, onNavigate })}
          onClick={(e) => layer.type === 'audio'
            ? activateAudioClipSelection('header', e.shiftKey || e.metaKey || e.ctrlKey, onSelectLayer, audioContext?.clearKeySelection)
            : onSelectLayer(e.shiftKey || e.metaKey || e.ctrlKey)}
          onDoubleClick={(e) => {
            // Double-click the layer header → toggle Solo (isolate in canvas).
            // Avoids racing the chevron / flag buttons which stop propagation.
            const tgt = e.target as HTMLElement
            if (tgt.closest('button')) return
            e.stopPropagation()
            onToggleFlag('solo')
          }}
          onContextMenu={!contextOnly && onLayerBarContextMenu ? event => onLayerBarContextMenu(layer.id, event) : undefined}
          title="Click: select · Double-click: solo (isolate) · Right-click: layer actions"
        >
          <div className="flex items-center gap-1.5 w-full min-w-0">
          {/* Color label stripe — left edge of the row */}
          {layer.colorLabel && (
            <div
              className="absolute left-0 top-0 bottom-0 w-1 pointer-events-none"
              style={{ backgroundColor: layer.colorLabel }}
            />
          )}
          {hasChildren ? <button title={childrenExpanded ? 'Collapse child layers' : 'Expand child layers'}
            aria-label={`${childrenExpanded ? 'Collapse' : 'Expand'} child layers of ${layer.name}`} aria-expanded={childrenExpanded}
            className="w-4 shrink-0 text-xs text-gray-400 hover:text-gray-200 focus-visible:outline focus-visible:outline-blue-400"
            onClick={event => { event.stopPropagation(); onToggleChildren?.() }}>{childrenExpanded ? '▾' : '▸'}</button> : <span className="w-4 shrink-0" aria-hidden="true" />}
          <button
            disabled={!propertiesAvailable} aria-label={`${expanded ? 'Collapse' : 'Expand'} properties of ${layer.name}`}
            title={expanded ? 'Collapse properties' : 'Expand properties'} aria-expanded={expanded}
            onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
            className="w-4 text-xs text-gray-500 hover:text-gray-300"
          >{expanded ? '▾' : '▸'}</button>
          <span className="w-4 text-xs text-center">{LAYER_ICON[layer.shape ?? layer.type] ?? '□'}</span>
          <span className="flex-1 truncate text-xs text-gray-200">
            {layer.pinned && <span className="text-blue-400 mr-1" title="Pinned">📌</span>}
            {layer.solo && !layer.pinned && <span className="text-amber-400 mr-1" title="Solo">★</span>}
            {layer.name}
          </span>
          <span className="text-[9px] font-mono text-gray-500">{tracks.length}</span>
          <LayerFlag active={!layer.hidden} on="●" off="○" onClick={(e) => { e.stopPropagation(); onToggleFlag('hidden') }} />
          <LayerFlag active={!!layer.locked} on="🔒" off="🔓" onClick={(e) => { e.stopPropagation(); onToggleFlag('locked') }} />
          <LayerFlag active={!!layer.solo} on="S" off="s" highlight={layer.solo ? 'text-amber-400 font-bold' : ''}
            onClick={(e) => { e.stopPropagation(); onToggleFlag('solo') }} />
          </div>
          {layer.type === 'audio' && audioContext && !contextOnly && <AudioClipControls layer={layer}
            onPatch={patch => audioContext.editor.dispatchCommand(makePatchAudioClipCmd(layer.id, patch, { timelineId: audioContext.timelineId }))}
            gain={audioGainAtPlayhead(layer, audioTracks, currentTimeMs)}
            onGainCommit={gain => audioContext.editor.dispatchCommand(audioTimelineId
              && audioTracks.some(track => track.target === `layers.${layer.id}.audio.volume` && track.keyframes.length)
              ? audioGainKeyCommand(layer, audioTimelineId, currentTimeMs, gain)
              : makePatchAudioClipCmd(layer.id, { volume: gain }, { timelineId: audioTimelineId }))}
            onSolo={() => onToggleFlag('solo')} />}
        </div>

        {/* Right: layer activity bar (draggable) */}
        <div
          className="flex-1 relative"
          onContextMenu={!contextOnly && onLayerBarContextMenu ? (e) => onLayerBarContextMenu(layer.id, e) : undefined}
        >
          {contextOnly ? <span className="px-2 text-[10px] text-gray-500">Hierarchy context · outside this timeline</span> : layer.type === 'audio' && audioContext ? <AudioClipTimeline layer={layer} context={audioContext}
            audioUrl={audioUrl} durationMs={durationMs} visibleStartMs={visibleStartMs} visibleEndMs={visibleEndMs}
            msToScreenPx={msToScreenPx} onSelect={onSelectLayer} tracks={audioTracks}
            selectedKfIds={selectedKfIds} previewMs={previewMs} onSelectKf={onSelectKf}
            onBeginKfDrag={onBeginKfDrag} onDeleteKf={onDeleteKf} onSetEasing={onSetEasing}
            onKfDoubleClick={onKfDoubleClick} onKfContextMenu={onKfContextMenu}
          /> : <DraggableLayerBar
            layer={layer}
            msToScreenPx={msToScreenPx}
            visibleStartMs={visibleStartMs}
            visibleEndMs={visibleEndMs}
            trackWidth={trackWidth}
            durationMs={durationMs}
            audioUrl={audioUrl}
            onCommit={(kind, fromStart, fromEnd, toStart, toEnd) =>
              onLayerBarCommit?.(layer.id, kind, fromStart, fromEnd, toStart, toEnd)
            }
          />}
        </div>
      </div>

      {/* ── Property track rows (expanded only) ───────────────────────────── */}
      {expanded && <div ref={trackRowsRef}><WindowedRows layout={trackLayout} indices={trackIndices}
        rowKey={index => trackKeys[index]} renderRow={(index, trackAttributes) => {
        const track = tracks[index]
        const propPath = track.target.replace(`layers.${layer.id}.`, '')
        // BL-05: any enabled wire driving this property? Drives 🔗 indicator.
        const wireOnProp = findWireForProperty(parameterWires, layer.id, propPath)
        return (
          <div {...trackAttributes} className="flex items-stretch border-b border-gray-800/60"
            style={{ height: rowH }}>
            <div
              className="shrink-0 flex items-center gap-1 pl-8 pr-2 border-r border-gray-700 group"
              style={{ width: labelColWidth }}
              onContextMenu={onTrackHeaderContextMenu ? (e) => {
                // Buttons (+, ⊗) have their own actions — let them handle the click
                const tgt = e.target as HTMLElement
                if (tgt.closest('button')) return
                e.preventDefault()
                e.stopPropagation()
                onTrackHeaderContextMenu(track.target, e)
              } : undefined}
            >
              {track.controller && track.controller.type !== 'keyframe' ? (
                <span
                  className="w-4 h-4 flex items-center justify-center shrink-0 rounded-sm
                             text-fuchsia-300 bg-fuchsia-900/40 border border-fuchsia-700/50
                             text-[10px] leading-none font-bold"
                  title={`Procedural: ${track.controller.type} (keyframes ignored)`}
                >ƒ</span>
              ) : (
                (() => {
                  const keyHere = track.keyframes.find(
                    (k) => Math.abs(k.timeMs - currentTimeMs) <= keyMatchEps)
                  return keyHere ? (
                    <button
                      onClick={() => onDeleteKf(track.target, keyHere.id)}
                      className="w-4 h-4 flex items-center justify-center shrink-0 rounded-sm
                                 text-red-400 hover:text-red-200 hover:bg-red-600/30
                                 border border-transparent hover:border-red-700/40 transition-colors
                                 text-[12px] leading-none font-bold"
                      title="Remove keyframe at playhead (−)"
                    >−</button>
                  ) : (
                    <button
                      onClick={() => onAddKeyframeAtPlayhead(track.target)}
                      className="w-4 h-4 flex items-center justify-center shrink-0 rounded-sm
                                 text-yellow-400 hover:text-yellow-200 hover:bg-yellow-600/30
                                 border border-transparent hover:border-yellow-700/40 transition-colors
                                 text-[12px] leading-none font-bold"
                      title="Add keyframe at playhead (◆)"
                    >+</button>
                  )
                })()
              )}
              <span className="flex-1 truncate text-[10px] font-mono text-gray-400 cursor-pointer hover:text-gray-200"
                    title={`${track.target}${track.outOfRange ? `  ·  OOR: ${track.outOfRange.before ?? 'constant'} ◀ ▶ ${track.outOfRange.after ?? 'constant'}` : ''}`}
                    onClick={() => onAddKeyframeAtPlayhead(track.target)}>
                {propPath}
                {track.outOfRange && (track.outOfRange.before !== 'constant' || track.outOfRange.after !== 'constant') && (
                  <span className="ml-1 text-purple-400" title="Out-of-Range behavior set">●</span>
                )}
                {/* BL-46 — modifier-count badge (track-scope). Hidden when 0. */}
                {track.modifiers && track.modifiers.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center px-1 rounded
                                   text-[8px] leading-none text-blue-200 bg-blue-900/60
                                   border border-blue-700/50"
                        title={`${track.modifiers.length} curve modifier(s) on this track`}>
                    ƒ{track.modifiers.length}
                  </span>
                )}
              </span>
              {/* BL-05: 🔗 wire indicator (sky-tinted when wired, click opens editor) */}
              {wireOnProp && onEditWire && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEditWire(wireOnProp) }}
                  title="Wired — click to edit"
                  className="text-[10px] leading-none w-3.5 h-3.5 flex items-center justify-center rounded text-sky-300 bg-sky-900/50 hover:bg-sky-800/70"
                >🔗</button>
              )}
              <button
                onClick={() => onRemoveTrack(track.target)}
                className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-500 hover:text-red-400"
                title="Remove this animation"
              >⊗</button>
            </div>

            <div
              className="flex-1 relative bg-gray-900/40 overflow-hidden"
              onContextMenu={onTrackAreaContextMenu && clientXToMs ? (e) => {
                // Skip if right-clicked on a keyframe — TimelineKeyframe handles its own ctx
                const tgt = e.target as HTMLElement
                if (tgt.closest('[data-kf-id]')) return
                e.preventDefault()
                onTrackAreaContextMenu(track.target, clientXToMs(e.clientX), e)
              } : undefined}
              onDoubleClick={onTrackAreaDoubleClick && clientXToMs ? (e) => {
                const tgt = e.target as HTMLElement
                if (tgt.closest('[data-kf-id]')) return
                onTrackAreaDoubleClick(track.target, clientXToMs(e.clientX))
              } : undefined}
            >
              <TrackValueGraph
                track={track} heightPx={rowH} trackWidthPx={trackWidth}
                visibleStartMs={visibleStartMs} visibleEndMs={visibleEndMs}
                msToScreenPx={msToScreenPx} emphasized={graphMode}
              />
              <TrackKeyframes track={track} width={trackWidth} height={rowH} graph={graphMode} locked={!!layer.locked}
                msToX={msToScreenPx} previewMs={previewMs} selected={selectedKfIds} onSelect={onSelectKf}
                onDelete={onDeleteKf} onEasing={onSetEasing} onBeginDrag={onBeginKfDrag}
                onContextMenu={onKfContextMenu} onDoubleClick={onKfDoubleClick} />
            </div>
          </div>
        )
      }} /></div>}

      {/* ── Inline "Add animation" picker (always at the bottom) ─────────── */}
      {expanded && (
        <div className="flex items-stretch border-b border-gray-800"
          style={{ height: ROW_ADD }}>
          <div className="shrink-0 flex items-center gap-1 pl-8 pr-2 border-r border-gray-700" style={{ width: labelColWidth }}>
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
  layer, msToScreenPx, visibleStartMs, visibleEndMs, trackWidth, durationMs, audioUrl, onCommit,
}: {
  layer:          Layer
  msToScreenPx:   (ms: number) => number
  visibleStartMs: number
  visibleEndMs:   number
  trackWidth:     number
  durationMs:     number
  audioUrl?:      string
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

  // Layer colour label (BL-38). Falls back to the default Tailwind blue-500
  // so legacy layers without a label keep the previous visual.
  const barColor = layer.colorLabel ?? '#3B82F6'

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
                   cursor-ew-resize flex items-center justify-center"
        style={{ width: HANDLE_W, backgroundColor: barColor, opacity: 0.85 }}
        onPointerDown={(e) => beginDrag(e, 'trimStart')}
        title="Drag to trim start"
      >
        <div className="w-0.5 h-3 bg-white/40 rounded-full" />
      </div>

      {/* Body — move (grab to shift both start + end) */}
      <div
        className="absolute top-0 bottom-0 rounded-sm border cursor-grab active:cursor-grabbing overflow-hidden"
        style={{
          left: HANDLE_W, right: HANDLE_W,
          backgroundColor: barColor,
          borderColor: barColor,
          opacity: preview ? 0.55 : 0.45,
        }}
        onPointerDown={(e) => beginDrag(e, 'move')}
        title={`${layer.name}: ${Math.round(dispStartMs)}–${Math.round(dispEndMs)} ms`}
      >
        {/* Audio waveform overlay (BL-37) — drawn inside the bar for audio layers */}
        {audioUrl && (
          <AudioWaveform url={audioUrl} color="#ffffff" />
        )}
        {preview && (
          <span className="absolute inset-0 flex items-center justify-center
                           text-[9px] font-mono text-white/90 pointer-events-none truncate px-1">
            {Math.round(dispStartMs)}–{Math.round(dispEndMs)}
          </span>
        )}
      </div>

      {/* Right trim handle */}
      <div
        className="absolute right-0 top-0 bottom-0 z-10 rounded-r-sm
                   cursor-ew-resize flex items-center justify-center"
        style={{ width: HANDLE_W, backgroundColor: barColor, opacity: 0.85 }}
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
