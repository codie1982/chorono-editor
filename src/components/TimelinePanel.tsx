'use client'
import { useCallback, useMemo, useState } from 'react'
import type {
  ChronoScene, Layer, Timeline, Keyframe, EasingType, TimelineSettings,
} from '@/lib/types'
import { evaluateTrack } from '@/lib/evaluator'
import { newTimeline, nextKfId } from '@/lib/defaults'
import {
  makeAddKfCmd, makeDeleteKfCmd, makeUpdateEasingCmd, makeBulkMoveKfCmd,
  makeKeyframeLayerSnapshotCmd,
} from '@/lib/editor/commands-keyframe'
import {
  makeAddTimelineCmd, makeDeleteTimelineCmd,
} from '@/lib/editor/commands-timeline'
import { updateKfTimeMs } from '@/lib/timeline/keyframeOps'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { useTimelineViewport }     from './timeline/hooks/useTimelineViewport'
import { useKeyframeDrag, type DragSnapshot } from './timeline/hooks/useKeyframeDrag'
import TimelineRuler           from './timeline/TimelineRuler'
import TimelineToolbar         from './timeline/TimelineToolbar'
import LayerTimelineSection    from './timeline/LayerTimelineSection'

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
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TimelinePanel({
  scene, editor, settings, onSettingsChange,
  selectedLayerId, selectedLayerIds, selectedTimelineId, selectedKfIds,
  currentTimeMs, isPlaying, playbackSpeed,
  onTimeChange, onPlayToggle, onSelectTimeline, onSelectKeyframes, onSelectLayer,
  onToggleLayerFlag, onPlaybackSpeedChange,
}: Props) {
  const { dispatchCommand, beginTransaction, previewTransaction, commitTransaction, cancelTransaction } = editor

  const timeline = scene.timelines.find((t) => t.id === selectedTimelineId) ?? null
  const duration = timeline?.durationMs ?? scene.composition.durationMs

  // ── Viewport (panel height managed by parent dock splitter) ─────────────
  const vp = useTimelineViewport(duration)

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
    <div className="flex flex-col h-full bg-gray-900 relative overflow-hidden">
      <TimelineToolbar
        timelines={scene.timelines}
        selectedTimelineId={selectedTimelineId}
        selectedTimeline={timeline}
        currentTimeMs={currentTimeMs}
        duration={duration}
        isPlaying={isPlaying}
        zoomFactor={vp.zoomFactor}
        playbackSpeed={playbackSpeed}
        graphEditorMode={settings.showGraphEditor}
        hasSelectedLayer={selectedLayerIds.size > 0 || selectedLayerId != null}
        onPlayToggle={onPlayToggle}
        onSelectTimeline={onSelectTimeline}
        onAddTimeline={addTimeline}
        onDeleteTimeline={deleteTimeline}
        onZoomChange={vp.setZoomFactor}
        onFit={() => { vp.setZoomFactor(1); vp.setScrollLeftPx(0) }}
        onTimelineFieldChange={updateTlField}
        onPlaybackSpeedChange={onPlaybackSpeedChange}
        onToggleGraphEditor={() => onSettingsChange({ ...settings, showGraphEditor: !settings.showGraphEditor })}
        onKeyframeProperties={keyframeSelectedLayers}
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
        </div>
      </div>

      {/* ── Layer sections (scrollable vertically) ───────────────────────── */}
      <div
        className="flex-1 overflow-y-auto relative"
        onClick={(e) => { if (e.target === e.currentTarget) onSelectKeyframes(new Set()) }}
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
            graphMode={settings.showGraphEditor}
            isPrimary={selectedLayerId === layer.id}
            isInSet={selectedLayerIds.has(layer.id)}
            trackWidth={vp.trackWidth}
            msToScreenPx={vp.msToScreenPx}
            visibleStartMs={vp.visibleStartMs}
            visibleEndMs={vp.visibleEndMs}
            selectedKfIds={selectedKfIds}
            previewMs={drag.previewMs}
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
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
