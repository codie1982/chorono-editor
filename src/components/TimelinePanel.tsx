'use client'
import { useCallback, useMemo, useRef, useState } from 'react'
import type {
  ChronoScene, Layer, Timeline, Keyframe, EasingType, TimelineSettings,
  TimelineSegment,
} from '@/lib/types'
import { evaluateTrack } from '@/lib/evaluator'
import { newTimeline, nextKfId, newTimelineSegment } from '@/lib/defaults'
import {
  makeAddKfCmd, makeDeleteKfCmd, makeUpdateEasingCmd, makeBulkMoveKfCmd,
  makeKeyframeLayerSnapshotCmd, makeUpdateKfValueCmd,
  makeMirrorTimingCmd, makeAlignToFrameCmd, makeBulkDeleteKfCmd,
  type KfDeletion,
} from '@/lib/editor/commands-keyframe'
import {
  makeAddTimelineCmd, makeDeleteTimelineCmd,
} from '@/lib/editor/commands-timeline'
import {
  makeAddSegmentCmd, makeDeleteSegmentCmd, makeUpdateSegmentCmd,
} from '@/lib/editor/commands-interactive'
import { makeSplitLayerCmd, makeTrimLayerCmd, makeShiftLayerCmd } from '@/lib/editor/commands-layer'
import { cloneLayerForDuplicate } from '@/lib/defaults'
import { updateKfTimeMs, updateKfEasing } from '@/lib/timeline/keyframeOps'
import type { EasingDefinition } from '@/lib/types'
import ContextMenu, { useContextMenu } from '@/components/ui/ContextMenu'
import { buildKeyframeMenu } from './timeline/keyframeMenuItems'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { useTimelineViewport }     from './timeline/hooks/useTimelineViewport'
import { useKeyframeDrag, type DragSnapshot } from './timeline/hooks/useKeyframeDrag'
import TimelineRuler           from './timeline/TimelineRuler'
import TimelineToolbar         from './timeline/TimelineToolbar'
import TrackToolBar            from './timeline/TrackToolBar'
import TimelineStatusBar       from './timeline/TimelineStatusBar'
import LayerTimelineSection    from './timeline/LayerTimelineSection'
import SegmentStrip            from './timeline/SegmentStrip'
import SegmentModal            from './modals/SegmentModal'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
  settings: TimelineSettings
  onSettingsChange: (next: TimelineSettings) => void
  selectedLayerId:   string | null
  selectedLayerIds:  Set<string>
  selectedTimelineId: string | null
  selectedKfIds: Set<string>
  currentTimeMs: number
  isPlaying: boolean
  playbackSpeed: number
  onTimeChange: (ms: number) => void
  onPlayToggle: () => void
  onSelectTimeline: (id: string) => void
  onSelectKeyframes: (next: Set<string>) => void
  onSelectLayer: (id: string | null, shiftHeld?: boolean) => void
  onToggleLayerFlag: (id: string, field: 'locked' | 'hidden' | 'solo') => void
  onPlaybackSpeedChange: (s: number) => void
  /** Optional: clicking a segment band requests preview playback. */
  onPlaySegment?: (timelineId: string, segmentId: string, loop?: boolean) => void
  /** Optional: currently active runtime-preview segment, highlighted in strip. */
  activeSegmentId?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TimelinePanel({
  scene, editor, settings, onSettingsChange,
  selectedLayerId, selectedLayerIds, selectedTimelineId, selectedKfIds,
  currentTimeMs, isPlaying, playbackSpeed,
  onTimeChange, onPlayToggle, onSelectTimeline, onSelectKeyframes, onSelectLayer,
  onToggleLayerFlag, onPlaybackSpeedChange, onPlaySegment, activeSegmentId,
}: Props) {
  const { dispatchCommand, beginTransaction, previewTransaction, commitTransaction, cancelTransaction } = editor

  const timeline = scene.timelines.find((t) => t.id === selectedTimelineId) ?? null
  const duration = timeline?.durationMs ?? scene.composition.durationMs

  // ── Viewport (panel height managed by parent dock splitter) ─────────────
  const vp = useTimelineViewport(duration)

  // ── Segment modal state (create / edit) ──────────────────────────────────
  const [segmentModal, setSegmentModal] = useState<{
    mode:    'create' | 'edit'
    segment: TimelineSegment
  } | null>(null)

  // ── Per-layer expand state (default: all layers expanded) ────────────────
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const toggleLayerExpand = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // ── Keyframe drag (multi-select bulk move) ───────────────────────────────
  const drag = useKeyframeDrag({
    timeline, frameRate: scene.composition.frameRate, settings,
    clientXToMs: vp.clientXToMs, durationMs: duration,
    onBegin: beginTransaction,
    onPreview: (moves) => {
      let nextScene = scene
      for (const [kfId, newMs] of Object.entries(moves)) {
        for (const tl of nextScene.timelines) {
          const track = tl.tracks.find((t) => t.keyframes.some((k) => k.id === kfId))
          if (!track) continue
          nextScene = updateKfTimeMs(nextScene, tl.id, track.target, kfId, newMs)
          break
        }
      }
      previewTransaction(nextScene)
    },
    onCommit: (moves) => commitTransaction(makeBulkMoveKfCmd(
      moves.map((m) => ({
        kfId: m.kfId, target: m.trackTarget, timelineId: m.timelineId,
        fromMs: m.fromMs, toMs: m.toMs,
      })),
    )),
    onCancel: cancelTransaction,
  })

  // ── Timeline CRUD ────────────────────────────────────────────────────────
  const addTimeline = () => {
    const tl = newTimeline()
    dispatchCommand(makeAddTimelineCmd(tl))
    onSelectTimeline(tl.id)
  }

  const deleteTimeline = (id: string) => {
    const tl = scene.timelines.find((t) => t.id === id)
    if (!tl) return
    dispatchCommand(makeDeleteTimelineCmd(tl))
    if (selectedTimelineId === id) {
      const remaining = scene.timelines.filter((t) => t.id !== id)
      onSelectTimeline(remaining[0]?.id ?? '')
    }
  }

  // ── Track / keyframe ops ─────────────────────────────────────────────────
  const addTrack = useCallback((layerId: string, propPath: string) => {
    if (!selectedTimelineId) return
    const target = `layers.${layerId}.${propPath}`
    const prev = scene
    dispatchCommand({
      label: 'Add Animation',
      execute: (s) => ({
        ...s,
        timelines: s.timelines.map((tl) => tl.id !== selectedTimelineId ? tl :
          tl.tracks.some((t) => t.target === target) ? tl
            : { ...tl, tracks: [...tl.tracks, { target, keyframes: [] }] }
        ),
      }),
      undo: () => prev,
    })
  }, [scene, selectedTimelineId, dispatchCommand])

  const removeTrack = useCallback((trackTarget: string) => {
    if (!selectedTimelineId || !timeline) return
    const trackSnapshot = timeline.tracks.find((t) => t.target === trackTarget)
    if (!trackSnapshot) return
    dispatchCommand({
      label: 'Remove Animation',
      execute: (s) => ({
        ...s,
        timelines: s.timelines.map((tl) => tl.id !== selectedTimelineId ? tl :
          { ...tl, tracks: tl.tracks.filter((t) => t.target !== trackTarget) }),
      }),
      undo: (s) => ({
        ...s,
        timelines: s.timelines.map((tl) => tl.id !== selectedTimelineId ? tl :
          { ...tl, tracks: [...tl.tracks, trackSnapshot] }),
      }),
    })
  }, [scene, selectedTimelineId, timeline, dispatchCommand])

  const addKeyframeAtPlayhead = useCallback((trackTarget: string) => {
    if (!selectedTimelineId || !timeline) return
    const track = timeline.tracks.find((t) => t.target === trackTarget)
    if (!track) return
    // Use the property path to find the originating layer
    const m = trackTarget.match(/^layers\.([^.]+)\.(.+)$/)
    if (!m) return
    const [, layerId, propPath] = m
    const layer = scene.layers.find((l) => l.id === layerId)
    if (!layer) return
    const defaultVal = readLayerPropAsNumber(layer, propPath)
    const existingVal = evaluateTrack(track, currentTimeMs) ?? defaultVal ?? 0

    const kf: Keyframe = {
      id: nextKfId(), timeMs: currentTimeMs, value: existingVal,
      easing: { type: 'easeOut' },
    }
    dispatchCommand(makeAddKfCmd(selectedTimelineId, trackTarget, kf))
  }, [scene.layers, timeline, selectedTimelineId, currentTimeMs, dispatchCommand])

  const deleteKf = useCallback((trackTarget: string, kfId: string) => {
    if (!selectedTimelineId || !timeline) return
    const track = timeline.tracks.find((t) => t.target === trackTarget)
    const kf = track?.keyframes.find((k) => k.id === kfId)
    if (!kf) return
    dispatchCommand(makeDeleteKfCmd(selectedTimelineId, trackTarget, kf))
  }, [timeline, selectedTimelineId, dispatchCommand])

  const setEasing = useCallback((trackTarget: string, kfId: string, easingType: EasingType) => {
    if (!selectedTimelineId || !timeline) return
    const track = timeline.tracks.find((t) => t.target === trackTarget)
    const kf = track?.keyframes.find((k) => k.id === kfId)
    if (!kf) return
    dispatchCommand(makeUpdateEasingCmd(selectedTimelineId, trackTarget, kfId, kf.easing, { ...kf.easing, type: easingType }))
  }, [timeline, selectedTimelineId, dispatchCommand])

  const selectKf = useCallback((kfId: string, shiftHeld: boolean) => {
    const next = new Set(shiftHeld ? selectedKfIds : [])
    if (shiftHeld && selectedKfIds.has(kfId)) next.delete(kfId)
    else                                       next.add(kfId)
    onSelectKeyframes(next)
  }, [selectedKfIds, onSelectKeyframes])

  /**
   * Curried drag-begin: given a leader snapshot + selection-mode flags, return
   * a pointer-down handler that beginDrag's the whole selected group together.
   */
  const beginKfDrag = useCallback((leader: DragSnapshot, isLone: boolean, shiftHeld: boolean) =>
    (e: React.PointerEvent) => {
      if (!selectedTimelineId) return
      // Drag must always know which timeline its leader lives in
      const fixedLeader: DragSnapshot = { ...leader, timelineId: selectedTimelineId }
      if (isLone) onSelectKeyframes(new Set([leader.kfId]))

      const group: DragSnapshot[] = isLone
        ? [fixedLeader]
        : collectGroupSnapshots(scene, selectedTimelineId, selectedKfIds, fixedLeader)
      drag.beginDrag(e as React.PointerEvent<HTMLElement>, fixedLeader, group)
    }, [selectedTimelineId, selectedKfIds, scene, onSelectKeyframes, drag])

  // ── Keyframe a chosen subset of properties on the selected layer(s) ──────
  const keyframeSelectedLayers = useCallback((properties: string[]) => {
    if (!selectedTimelineId || properties.length === 0) return
    const ids = selectedLayerIds.size > 0
      ? Array.from(selectedLayerIds)
      : (selectedLayerId ? [selectedLayerId] : [])
    for (const id of ids) {
      const layer = scene.layers.find((l) => l.id === id)
      if (!layer) continue
      dispatchCommand(makeKeyframeLayerSnapshotCmd(selectedTimelineId, layer, currentTimeMs, properties))
    }
  }, [scene.layers, selectedLayerId, selectedLayerIds, selectedTimelineId, currentTimeMs, dispatchCommand])

  // ── TrackToolBar handlers ────────────────────────────────────────────────
  const selectAllKfs = useCallback(() => {
    if (!timeline) return
    const all = new Set<string>()
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) all.add(kf.id)
    }
    onSelectKeyframes(all)
  }, [timeline, onSelectKeyframes])

  const deleteSelectedKfs = useCallback(() => {
    if (!selectedTimelineId || !timeline || selectedKfIds.size === 0) return
    const items: KfDeletion[] = []
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        if (selectedKfIds.has(kf.id)) items.push({ timelineId: selectedTimelineId, target: track.target, kf })
      }
    }
    if (items.length === 0) return
    dispatchCommand(makeBulkDeleteKfCmd(items))
    onSelectKeyframes(new Set())
  }, [timeline, selectedTimelineId, selectedKfIds, dispatchCommand, onSelectKeyframes])

  const easeSelectedKfs = useCallback((easingType: EasingType) => {
    if (!selectedTimelineId || !timeline || selectedKfIds.size === 0) return
    type KfRef = { target: string; kfId: string; fromEasing: EasingDefinition }
    const updates: KfRef[] = []
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        if (selectedKfIds.has(kf.id)) updates.push({ target: track.target, kfId: kf.id, fromEasing: kf.easing })
      }
    }
    if (updates.length === 0) return
    const toEasing: EasingDefinition = { type: easingType }
    const tlId = selectedTimelineId
    dispatchCommand({
      label: `Set Easing: ${easingType} (${updates.length})`,
      execute: (s) => updates.reduce((sc, u) => updateKfEasing(sc, tlId, u.target, u.kfId, toEasing), s),
      undo:    (s) => updates.reduce((sc, u) => updateKfEasing(sc, tlId, u.target, u.kfId, u.fromEasing), s),
    })
  }, [timeline, selectedTimelineId, selectedKfIds, dispatchCommand])

  // ── Right-click context menu + inline kf value editor ───────────────────
  // Single shared menu for keyframe right-clicks (we can extend to property
  // and layer rows later). Inline-edit input renders absolutely-positioned
  // over the timeline body using the keyframe's px coordinates.
  const ctxMenu = useContextMenu()
  const [ctxKf, setCtxKf] = useState<{ trackTarget: string; kfId: string } | null>(null)
  const [ctxLayerBar, setCtxLayerBar] = useState<{ layerId: string } | null>(null)
  const [editingKf, setEditingKf] = useState<{
    trackTarget: string; kfId: string; leftPx: number; topPx: number; draft: string
  } | null>(null)

  const openLayerBarMenu = useCallback((layerId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxKf(null)
    setCtxLayerBar({ layerId })
    ctxMenu.open(e)
  }, [ctxMenu])

  const openKfMenu = useCallback((trackTarget: string, kfId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selectedKfIds.has(kfId)) onSelectKeyframes(new Set([kfId]))
    setCtxKf({ trackTarget, kfId })
    ctxMenu.open(e)
  }, [selectedKfIds, onSelectKeyframes, ctxMenu])

  // ── Lasso selection ──────────────────────────────────────────────────────
  // Alt+drag in the layer-sections container draws a rectangle; pointerup
  // collects every `[data-kf-id]` element whose bbox intersects and adds
  // them to the selection (Shift+Alt+drag adds to existing selection).
  const lassoContainerRef = useRef<HTMLDivElement | null>(null)
  const lassoStartRef = useRef<{ x: number; y: number; addToExisting: boolean } | null>(null)
  const [lassoRect, setLassoRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const onLassoPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.altKey) return
    // Only start lasso if the pointer landed on the container itself
    // or on a non-interactive child (not a kf, not a button).
    const t = e.target as HTMLElement
    if (t.closest('[data-kf-id]') || t.closest('button')) return
    const el = lassoContainerRef.current
    if (!el) return
    e.preventDefault()
    el.setPointerCapture(e.pointerId)
    const rect = el.getBoundingClientRect()
    lassoStartRef.current = {
      x: e.clientX - rect.left + el.scrollLeft,
      y: e.clientY - rect.top  + el.scrollTop,
      addToExisting: e.shiftKey,
    }
    setLassoRect({ x: lassoStartRef.current.x, y: lassoStartRef.current.y, w: 0, h: 0 })
  }

  const onLassoPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = lassoStartRef.current
    const el = lassoContainerRef.current
    if (!s || !el) return
    const rect = el.getBoundingClientRect()
    const cx = e.clientX - rect.left + el.scrollLeft
    const cy = e.clientY - rect.top  + el.scrollTop
    setLassoRect({
      x: Math.min(s.x, cx), y: Math.min(s.y, cy),
      w: Math.abs(cx - s.x), h: Math.abs(cy - s.y),
    })
  }

  const onLassoPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = lassoStartRef.current
    const el = lassoContainerRef.current
    if (!s || !el || !lassoRect) { lassoStartRef.current = null; setLassoRect(null); return }
    // Convert lasso (container-local) rect to viewport coords for hit-test.
    const c = el.getBoundingClientRect()
    const vx1 = c.left + lassoRect.x - el.scrollLeft
    const vy1 = c.top  + lassoRect.y - el.scrollTop
    const vx2 = vx1 + lassoRect.w
    const vy2 = vy1 + lassoRect.h
    const next = new Set<string>(s.addToExisting ? selectedKfIds : [])
    el.querySelectorAll<HTMLElement>('[data-kf-id]').forEach((node) => {
      const r = node.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top  + r.height / 2
      if (cx >= vx1 && cx <= vx2 && cy >= vy1 && cy <= vy2) {
        const id = node.dataset.kfId
        if (id) next.add(id)
      }
    })
    onSelectKeyframes(next)
    lassoStartRef.current = null
    setLassoRect(null)
    try { el.releasePointerCapture(e.pointerId) } catch { /* */ }
  }

  const openKfInlineEdit = useCallback((trackTarget: string, kfId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const tl = scene.timelines.find((t) => t.id === selectedTimelineId)
    const tr = tl?.tracks.find((t) => t.target === trackTarget)
    const kf = tr?.keyframes.find((k) => k.id === kfId)
    if (!kf || typeof kf.value !== 'number') return
    // The keyframe DOM node is the event target; lock the editor near it.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setEditingKf({
      trackTarget, kfId,
      leftPx: rect.left, topPx: rect.top - 26,
      draft: String(kf.value),
    })
  }, [scene.timelines, selectedTimelineId])

  // ── Timeline-level field changes (duration / loop / etc.) ────────────────
  const updateTlField = useCallback(<K extends keyof Timeline>(key: K, val: Timeline[K]) => {
    if (!selectedTimelineId || !timeline) return
    const prevTl = timeline
    const nextTl = { ...prevTl, [key]: val }
    dispatchCommand({
      label: `Edit Timeline ${String(key)}`,
      execute: (s) => ({ ...s, timelines: s.timelines.map((tl) => tl.id === selectedTimelineId ? nextTl : tl) }),
      undo:    (s) => ({ ...s, timelines: s.timelines.map((tl) => tl.id === selectedTimelineId ? prevTl : tl) }),
    })
  }, [timeline, selectedTimelineId, dispatchCommand])

  // ── Snap indicator screen X ──────────────────────────────────────────────
  const snapIndicatorX = useMemo(
    () => drag.snapIndicatorMs == null ? null : vp.msToScreenPx(drag.snapIndicatorMs),
    [drag.snapIndicatorMs, vp],
  )

  // Helper: tracks belonging to a layer
  const tracksFor = (layerId: string) =>
    timeline?.tracks.filter((t) => t.target.startsWith(`layers.${layerId}.`)) ?? []

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full bg-gray-900 relative overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      <TimelineToolbar
        timelines={scene.timelines}
        selectedTimelineId={selectedTimelineId}
        selectedTimeline={timeline}
        currentTimeMs={currentTimeMs}
        duration={duration}
        isPlaying={isPlaying}
        zoomFactor={vp.zoomFactor}
        playbackSpeed={playbackSpeed}
        timelineMode={settings.timelineMode}
        hasSelectedLayer={selectedLayerIds.size > 0 || selectedLayerId != null}
        onPlayToggle={onPlayToggle}
        onSelectTimeline={onSelectTimeline}
        onAddTimeline={addTimeline}
        onDeleteTimeline={deleteTimeline}
        onZoomChange={vp.setZoomFactor}
        onFit={() => { vp.setZoomFactor(1); vp.setScrollLeftPx(0) }}
        onTimelineFieldChange={updateTlField}
        onPlaybackSpeedChange={onPlaybackSpeedChange}
        onModeChange={(mode) => onSettingsChange({ ...settings, timelineMode: mode })}
        onKeyframeProperties={keyframeSelectedLayers}
      />

      <TrackToolBar
        hasKeyframes={!!(timeline && timeline.tracks.some((t) => t.keyframes.length > 0))}
        selectedCount={selectedKfIds.size}
        onSelectAll={selectAllKfs}
        onDeleteSelected={deleteSelectedKfs}
        onEaseSelected={easeSelectedKfs}
      />

      {/* ── Ruler row (above the layer sections, share scroll horizontally) ── */}
      <div className="flex border-b border-gray-700 shrink-0">
        <div className="w-60 shrink-0 border-r border-gray-700 bg-gray-900 flex items-center px-3">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Layers</span>
          <span className="ml-auto text-[10px] font-mono text-gray-500">{scene.layers.length}</span>
        </div>
        <div
          ref={vp.trackAreaRef}
          className="flex-1 relative overflow-hidden"
          onWheel={vp.onWheel}
        >
          <TimelineRuler
            durationMs={duration}
            currentTimeMs={currentTimeMs}
            totalContentPx={vp.totalContentPx}
            scrollLeftPx={vp.scrollLeftPx}
            msToScreenPx={vp.msToScreenPx}
            clientXToMs={vp.clientXToMs}
            onSeek={onTimeChange}
          />
          {timeline && (
            <SegmentStrip
              segments={timeline.segments ?? []}
              durationMs={duration}
              totalContentPx={vp.totalContentPx}
              msToScreenPx={vp.msToScreenPx}
              clientXToMs={vp.clientXToMs}
              activeSegmentId={activeSegmentId ?? null}
              onCreateAt={(ms) => {
                // Default a fresh segment to 400ms wide starting at the click point.
                const startMs = Math.max(0, Math.min(duration - 100, Math.round(ms)))
                const endMs   = Math.min(duration, startMs + Math.min(400, duration - startMs))
                setSegmentModal({
                  mode: 'create',
                  segment: newTimelineSegment(startMs, endMs),
                })
              }}
              onEdit={(seg) => setSegmentModal({ mode: 'edit', segment: seg })}
              onPlay={(segId) => onPlaySegment?.(timeline.id, segId)}
            />
          )}
        </div>
      </div>

      {/* ── Layer sections (scrollable vertically) ───────────────────────── */}
      <div
        ref={lassoContainerRef}
        className="flex-1 overflow-y-auto relative"
        onClick={(e) => { if (e.target === e.currentTarget) onSelectKeyframes(new Set()) }}
        onPointerDown={onLassoPointerDown}
        onPointerMove={onLassoPointerMove}
        onPointerUp={onLassoPointerUp}
        onPointerCancel={onLassoPointerUp}
      >
        {scene.layers.length === 0 && (
          <div className="p-6 text-center text-xs text-gray-600">
            No layers yet. Add one from the left panel.
          </div>
        )}

        {scene.layers.map((layer) => (
          <LayerTimelineSection
            key={layer.id}
            layer={layer}
            tracks={tracksFor(layer.id)}
            expanded={!collapsedIds.has(layer.id)}
            graphMode={settings.timelineMode === 'curve'}
            isPrimary={selectedLayerId === layer.id}
            isInSet={selectedLayerIds.has(layer.id)}
            trackWidth={vp.trackWidth}
            msToScreenPx={vp.msToScreenPx}
            visibleStartMs={vp.visibleStartMs}
            visibleEndMs={vp.visibleEndMs}
            selectedKfIds={selectedKfIds}
            previewMs={drag.previewMs}
            durationMs={duration}
            onToggleExpand={() => toggleLayerExpand(layer.id)}
            onSelectLayer={(shift) => onSelectLayer(layer.id, shift)}
            onToggleFlag={(field) => onToggleLayerFlag(layer.id, field)}
            onAddTrack={(prop) => addTrack(layer.id, prop)}
            onRemoveTrack={removeTrack}
            onAddKeyframeAtPlayhead={addKeyframeAtPlayhead}
            onDeleteKf={deleteKf}
            onSetEasing={setEasing}
            onSelectKf={selectKf}
            onBeginKfDrag={beginKfDrag}
            onKfContextMenu={openKfMenu}
            onKfDoubleClick={openKfInlineEdit}
            onLayerBarContextMenu={openLayerBarMenu}
            onLayerBarCommit={(layerId, _kind, fromStart, fromEnd, toStart, toEnd) => {
              // Single command handles move + trim — linearly remaps every
              // keyframe on this layer so the inner animation scales/shifts
              // along with the bar.
              dispatchCommand(makeShiftLayerCmd(
                layerId, fromStart, fromEnd, toStart, toEnd, duration,
              ))
            }}
          />
        ))}

        {/* Snap indicator (single global) */}
        {snapIndicatorX != null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-yellow-400 pointer-events-none z-30"
            style={{ left: `${240 + snapIndicatorX}px` }}
          />
        )}

        {/* Playhead across all layer rows */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500/40 pointer-events-none z-20"
          style={{ left: `${240 + vp.msToScreenPx(currentTimeMs)}px` }}
        />

        {/* Lasso rectangle (visible while Alt+drag is active) */}
        {lassoRect && (
          <div
            className="absolute pointer-events-none z-30 border border-blue-400"
            style={{
              left: lassoRect.x, top: lassoRect.y,
              width: lassoRect.w, height: lassoRect.h,
              background: 'rgba(59, 130, 246, 0.12)',
              borderStyle: 'dashed',
            }}
          />
        )}
      </div>

      {/* ── Segment create / edit modal ──────────────────────────────────── */}
      {segmentModal && timeline && (
        <SegmentModal
          initial={segmentModal.segment}
          durationMs={duration}
          isCreating={segmentModal.mode === 'create'}
          onClose={() => setSegmentModal(null)}
          onSave={(next) => {
            if (segmentModal.mode === 'create') {
              dispatchCommand(makeAddSegmentCmd(timeline.id, next))
            } else {
              dispatchCommand(makeUpdateSegmentCmd(timeline.id, segmentModal.segment, next))
            }
          }}
          onDelete={segmentModal.mode === 'edit'
            ? () => dispatchCommand(makeDeleteSegmentCmd(timeline.id, segmentModal.segment))
            : undefined}
        />
      )}

      {/* ── Inline value editor (kf double-click) ─────────────────────── */}
      {editingKf && (() => {
        const tl = scene.timelines.find((t) => t.id === selectedTimelineId)
        const tr = tl?.tracks.find((t) => t.target === editingKf.trackTarget)
        const kf = tr?.keyframes.find((k) => k.id === editingKf.kfId)
        if (!kf || typeof kf.value !== 'number') { setEditingKf(null); return null }
        const commit = () => {
          const v = Number(editingKf.draft)
          if (Number.isFinite(v) && v !== kf.value && selectedTimelineId) {
            dispatchCommand(makeUpdateKfValueCmd(
              selectedTimelineId, editingKf.trackTarget, kf.id, kf.value, v,
            ))
          }
          setEditingKf(null)
        }
        return (
          <input
            autoFocus type="number" value={editingKf.draft}
            onChange={(e) => setEditingKf({ ...editingKf, draft: e.target.value })}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  { e.preventDefault(); commit() }
              if (e.key === 'Escape') { e.preventDefault(); setEditingKf(null) }
              e.stopPropagation()
            }}
            onFocus={(e) => e.currentTarget.select()}
            className="fixed z-50 w-20 px-1 py-0.5 text-[11px] font-mono
                       bg-gray-950 text-white border border-blue-500 rounded
                       focus:outline-none"
            style={{ left: editingKf.leftPx, top: editingKf.topPx }}
          />
        )
      })()}

      {/* ── Keyframe right-click menu ─────────────────────────────────── */}
      {ctxMenu.isOpen && ctxKf && (() => {
        const tl = scene.timelines.find((t) => t.id === selectedTimelineId)
        const tr = tl?.tracks.find((t) => t.target === ctxKf.trackTarget)
        const kf = tr?.keyframes.find((k) => k.id === ctxKf.kfId)
        if (!kf || !selectedTimelineId) { ctxMenu.close(); return null }
        const frameMs = scene.composition.frameRate > 0 ? 1000 / scene.composition.frameRate : 0
        // Collect the items the menu actions should operate on. If the user
        // right-clicked a kf that's part of a multi-selection, operate on the
        // whole selection; otherwise just the clicked kf.
        const operatingIds = selectedKfIds.has(kf.id) && selectedKfIds.size > 1
          ? Array.from(selectedKfIds)
          : [kf.id]
        const operatingItems = collectKfRefs(scene, selectedTimelineId, operatingIds)

        const items = buildKeyframeMenu(kf, {
          editValue: () => openKfInlineEdit(ctxKf.trackTarget, ctxKf.kfId, fakeEventFor(ctxMenu.state!)),
          setEasing: (k, type) => {
            const next = type === 'customBezier'
              ? { type, bezier: k.easing?.bezier ?? { cx1: 0.42, cy1: 0, cx2: 0.58, cy2: 1 } }
              : { type }
            dispatchCommand(makeUpdateEasingCmd(selectedTimelineId, ctxKf.trackTarget, k.id, k.easing, next))
          },
          deleteKf: () => dispatchCommand(makeDeleteKfCmd(selectedTimelineId, ctxKf.trackTarget, kf)),
          duplicateKf: (k) => {
            const clone = { ...k, id: nextKfId(), timeMs: k.timeMs + Math.max(100, frameMs) }
            dispatchCommand(makeAddKfCmd(selectedTimelineId, ctxKf.trackTarget, clone))
            onSelectKeyframes(new Set([clone.id]))
          },
          alignToFrame: frameMs > 0 ? () => {
            const cmd = makeAlignToFrameCmd(scene, operatingItems, scene.composition.frameRate)
            if (cmd) dispatchCommand(cmd)
          } : undefined,
          mirrorTiming: operatingItems.length > 1 ? () => {
            const cmd = makeMirrorTimingCmd(scene, operatingItems)
            if (cmd) dispatchCommand(cmd)
          } : undefined,
          setTangentMode: (k, mode) => {
            const prevKf = k
            dispatchCommand({
              label: `Set Tangent: ${mode}`,
              execute: (s) => mapKfInScene(s, selectedTimelineId, ctxKf.trackTarget, k.id,
                (kk) => ({ ...kk, tangentMode: mode })),
              undo:    (s) => mapKfInScene(s, selectedTimelineId, ctxKf.trackTarget, k.id,
                (kk) => ({ ...kk, tangentMode: prevKf.tangentMode })),
            })
          },
          convertToHold: (k) => dispatchCommand(
            makeUpdateEasingCmd(selectedTimelineId, ctxKf.trackTarget, k.id, k.easing, { type: 'hold' }),
          ),
        }, selectedKfIds.size)
        return (
          <ContextMenu
            x={ctxMenu.state!.x} y={ctxMenu.state!.y}
            items={items}
            onClose={() => { ctxMenu.close(); setCtxKf(null) }}
          />
        )
      })()}

      {/* ── Layer-bar right-click menu ────────────────────────────────── */}
      {ctxMenu.isOpen && ctxLayerBar && (() => {
        const layer = scene.layers.find((l) => l.id === ctxLayerBar.layerId)
        if (!layer) { ctxMenu.close(); return null }
        const splitMs = currentTimeMs
        const items = [
          {
            kind: 'action' as const, label: 'Split Layer at Playhead',
            shortcut: undefined, disabled: false,
            onSelect: () => {
              const cmd = makeSplitLayerCmd(
                layer.id,
                splitMs,
                scene.composition.durationMs,
                (orig) => cloneLayerForDuplicate(orig),
              )
              if (cmd) dispatchCommand(cmd)
            },
          },
          { kind: 'separator' as const },
          {
            kind: 'action' as const, label: 'Trim Start to Playhead',
            shortcut: undefined,
            disabled: splitMs <= (layer.startMs ?? 0),
            onSelect: () => dispatchCommand(
              makeTrimLayerCmd(layer.id, 'start', layer.startMs ?? 0, splitMs)
            ),
          },
          {
            kind: 'action' as const, label: 'Trim End to Playhead',
            shortcut: undefined,
            disabled: splitMs >= (layer.endMs ?? scene.composition.durationMs),
            onSelect: () => dispatchCommand(
              makeTrimLayerCmd(layer.id, 'end', layer.endMs ?? scene.composition.durationMs, splitMs)
            ),
          },
        ]
        return (
          <ContextMenu
            x={ctxMenu.state!.x} y={ctxMenu.state!.y}
            items={items}
            onClose={() => { ctxMenu.close(); setCtxLayerBar(null) }}
          />
        )
      })()}

      {/* ── KeySelection floating toolbar (2+ keys selected) ─────────────── */}
      {selectedKfIds.size >= 2 && (
        <div className="flex items-center gap-2 px-3 py-1 border-t border-yellow-700/40
                        bg-yellow-950/30 text-[10px] shrink-0">
          <span className="text-yellow-600 font-mono">{selectedKfIds.size} keys</span>
          <div className="w-px h-3 bg-yellow-800/50" />
          {(['easeIn', 'easeOut', 'easeInOut', 'linear'] as EasingType[]).map((et) => (
            <button
              key={et}
              onClick={() => easeSelectedKfs(et)}
              className="px-2 py-0.5 rounded bg-yellow-900/40 hover:bg-yellow-800/60
                         text-yellow-400 hover:text-yellow-200 border border-yellow-800/40
                         transition-colors"
            >{et}</button>
          ))}
          <div className="w-px h-3 bg-yellow-800/50" />
          <button
            onClick={() => {
              if (!selectedTimelineId || !timeline) return
              const operatingItems = Array.from(selectedKfIds).flatMap((kfId) => {
                const track = timeline.tracks.find((t) => t.keyframes.some((k) => k.id === kfId))
                return track ? [{ kfId, target: track.target, timelineId: selectedTimelineId }] : []
              })
              const cmd = makeAlignToFrameCmd(scene, operatingItems, scene.composition.frameRate)
              if (cmd) dispatchCommand(cmd)
            }}
            className="px-2 py-0.5 rounded bg-yellow-900/40 hover:bg-yellow-800/60
                       text-yellow-400 hover:text-yellow-200 border border-yellow-800/40
                       transition-colors"
          >Align ⌦</button>
          <button
            onClick={deleteSelectedKfs}
            className="ml-auto px-2 py-0.5 rounded bg-red-950/40 hover:bg-red-900/60
                       text-red-400 hover:text-red-200 border border-red-800/40 transition-colors"
          >Delete</button>
        </div>
      )}

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <TimelineStatusBar
        currentTimeMs={currentTimeMs}
        frameRate={scene.composition.frameRate}
        selectedKfCount={selectedKfIds.size}
        zoomFactor={vp.zoomFactor}
        snapEnabled={settings.snapEnabled}
        snapLabel={drag.snapIndicatorMs != null
          ? `${Math.round(drag.snapIndicatorMs)}ms`
          : null}
      />
    </div>
  )
}

// Synthetic event shape used to fire openKfInlineEdit from the menu —
// the input only reads clientX/Y, so this minimal shape is enough.
function fakeEventFor(p: { x: number; y: number }): React.MouseEvent {
  return {
    preventDefault: () => {},
    stopPropagation: () => {},
    clientX: p.x, clientY: p.y,
    currentTarget: { getBoundingClientRect: () => ({ left: p.x, top: p.y, right: p.x, bottom: p.y, width: 0, height: 0, x: p.x, y: p.y, toJSON: () => '' }) } as unknown as Element,
  } as unknown as React.MouseEvent
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Collect (kfId, target, timelineId) refs for a set of kfIds — used by the
 *  multi-kf commands (mirror, align-to-frame). */
function collectKfRefs(
  scene: ChronoScene,
  timelineId: string,
  kfIds: string[],
): { kfId: string; target: string; timelineId: string }[] {
  const set = new Set(kfIds)
  const out: { kfId: string; target: string; timelineId: string }[] = []
  const tl = scene.timelines.find((t) => t.id === timelineId)
  if (!tl) return out
  for (const track of tl.tracks) {
    for (const kf of track.keyframes) {
      if (set.has(kf.id)) out.push({ kfId: kf.id, target: track.target, timelineId })
    }
  }
  return out
}

/** Immutable map over a single keyframe by id — used by tangent-mode command. */
function mapKfInScene(
  scene: ChronoScene,
  timelineId: string,
  trackTarget: string,
  kfId: string,
  fn: (kf: Keyframe) => Keyframe,
): ChronoScene {
  return {
    ...scene,
    timelines: scene.timelines.map((tl) => tl.id !== timelineId ? tl :
      { ...tl, tracks: tl.tracks.map((t) => t.target !== trackTarget ? t :
        { ...t, keyframes: t.keyframes.map((k) => k.id !== kfId ? k : fn(k)) }) }),
  }
}

function collectGroupSnapshots(
  scene: ChronoScene,
  timelineId: string,
  selectedKfIds: Set<string>,
  leader: DragSnapshot,
): DragSnapshot[] {
  const out: DragSnapshot[] = [leader]
  const tl = scene.timelines.find((t) => t.id === timelineId)
  if (!tl) return out
  for (const track of tl.tracks) {
    for (const kf of track.keyframes) {
      if (kf.id === leader.kfId || !selectedKfIds.has(kf.id)) continue
      out.push({ kfId: kf.id, trackTarget: track.target, timelineId, originalMs: kf.timeMs })
    }
  }
  return out
}

function readLayerPropAsNumber(layer: Layer, prop: string): number | undefined {
  const parts = prop.split('.')
  let cur: unknown = layer
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p]
    } else { return undefined }
  }
  return typeof cur === 'number' ? cur : undefined
}
