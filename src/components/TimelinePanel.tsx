'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChronoScene, Layer, Timeline, Keyframe, EasingType, TimelineSettings,
  TimelineSegment, TimelineMarker,
} from '@/lib/types'
import { evaluateTrack } from '@/lib/evaluator'
import { newTimeline, nextKfId, newTimelineSegment, newMarker } from '@/lib/defaults'
import {
  makeAddKfCmd, makeDeleteKfCmd, makeUpdateEasingCmd, makeBulkMoveKfCmd,
  makeKeyframeLayerSnapshotCmd, makeUpdateKfValueCmd, makeMoveKfCmd,
  makeMirrorTimingCmd, makeAlignToFrameCmd, makeBulkDeleteKfCmd,
  makeStaggerKeysCmd, makeScaleKeysCmd,
  type KfDeletion, type KfMove, type StaggerKfItem, type ScaleKfItem,
} from '@/lib/editor/commands-keyframe'
import {
  makeAddTimelineCmd, makeDeleteTimelineCmd,
  makeAddEventCmd, makeDeleteEventCmd, makeUpdateEventCmd,
  makeAddMarkerCmd, makeDeleteMarkerCmd, makeUpdateMarkerCmd, makeMoveMarkerCmd,
  makeSetWorkAreaCmd,
} from '@/lib/editor/commands-timeline'
import {
  makeAddSegmentCmd, makeDeleteSegmentCmd, makeUpdateSegmentCmd,
} from '@/lib/editor/commands-interactive'
import {
  makeSplitLayerCmd, makeTrimLayerCmd, makeShiftLayerCmd, makeUpdateLayerCmd,
} from '@/lib/editor/commands-layer'
import {
  makeSetOutOfRangeCmd, makeAddCurveModifierCmd, nextModifierId,
  makeSetTrackControllerCmd, makeBakeTrackToKeyframesCmd,
} from '@/lib/editor/commands-track'
import { defaultParametersFor } from '@/lib/types'
import type { CurveModifier, CurveModifierType, TrackController } from '@/lib/types'
import { DEFAULT_WAVEFORM_PARAMS, DEFAULT_NOISE_PARAMS } from '@/lib/types'
import { cloneLayerForDuplicate } from '@/lib/defaults'
import { updateKfTimeMs, updateKfEasing } from '@/lib/timeline/keyframeOps'
import type { EasingDefinition } from '@/lib/types'
import ContextMenu, { useContextMenu } from '@/components/ui/ContextMenu'
import { buildKeyframeMenu, buildOutOfRangeSubmenu } from './timeline/keyframeMenuItems'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { useTimelineViewport }     from './timeline/hooks/useTimelineViewport'
import type { TimelineGhostSettings } from '@/lib/types/editor'
import { useKeyframeDrag, type DragSnapshot } from './timeline/hooks/useKeyframeDrag'
import TimelineRuler           from './timeline/TimelineRuler'
import TimelineToolbar         from './timeline/TimelineToolbar'
import TrackToolBar            from './timeline/TrackToolBar'
import TimelineStatusBar       from './timeline/TimelineStatusBar'
import TimelineMinimap         from './timeline/TimelineMinimap'
import LayerTimelineSection    from './timeline/LayerTimelineSection'
import SegmentStrip            from './timeline/SegmentStrip'
import EventStrip              from './timeline/EventStrip'
import SegmentModal            from './modals/SegmentModal'
import StaggerKeysModal, { type StaggerPreviewItem } from './modals/StaggerKeysModal'
import ScaleHandlesOverlay     from './timeline/ScaleHandlesOverlay'
import KeyframeSpreadsheet, { type KeyframeSheetRow } from './timeline/KeyframeSpreadsheet'
import MarkerOverlay              from './timeline/MarkerOverlay'
import WorkAreaOverlay            from './timeline/WorkAreaOverlay'
import type { TimelineEvent } from '@/lib/types'
import { ANIMATABLE_PROPERTIES } from '@/lib/types'
import { nextEventId } from '@/lib/defaults'

// Preset palette for the layer "Color Label" submenu. `hex: null` clears
// the label. Same set is used by the LayerPanel-side picker so a layer
// dragged across panels keeps a consistent colour identity.
// Modifier types with shipped evaluators. Used by the track-header
// context menu's "+ Add Modifier ▸" submenu. BL-50 procedural controllers
// add no new types — this set is complete for BL-46..BL-49.
const BL46_MODIFIER_TYPES: CurveModifierType[] = [
  // Foundation (BL-46)
  'sine', 'pulse', 'quantize', 'offset', 'scale', 'clamp',
  // Noise pack (BL-47)
  'noise', 'fractalNoise', 'jitter', 'wave',
  // Physics pack (BL-49)
  'overshoot', 'elastic', 'bounce', 'decay', 'spring',
]
const BL46_MODIFIER_LABEL: Partial<Record<CurveModifierType, string>> = {
  sine:         '∿ Sine',
  pulse:        '⎍ Pulse',
  quantize:     '▥ Quantize',
  offset:       '+ Offset',
  scale:        '× Scale',
  clamp:        '⊂⊃ Clamp',
  noise:        '⌇ Noise',
  fractalNoise: '≋ Fractal Noise',
  jitter:       '⊕ Jitter',
  wave:         '∼ Wave (square/tri/saw)',
  overshoot:    '↟ Overshoot',
  elastic:      '╳ Elastic',
  bounce:       '⚬ Bounce',
  decay:        '⏷ Decay',
  spring:       '⌇ Spring (stateful)',
}

const LAYER_COLOR_LABELS: { label: string; hex: string | null }[] = [
  { label: 'None',    hex: null      },
  { label: 'Blue',    hex: '#3B82F6' },
  { label: 'Cyan',    hex: '#06B6D4' },
  { label: 'Green',   hex: '#22C55E' },
  { label: 'Yellow',  hex: '#EAB308' },
  { label: 'Orange',  hex: '#F97316' },
  { label: 'Red',     hex: '#EF4444' },
  { label: 'Purple',  hex: '#A855F7' },
  { label: 'Pink',    hex: '#EC4899' },
]

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
  /** BL-56 — Ghost / Onion-Skin (owned by page.tsx for cross-panel sync). */
  ghostSettings: TimelineGhostSettings
  onGhostUpdate: (patch: Partial<TimelineGhostSettings>) => void
  onGhostToggle: () => void
  onGhostPreset: (preset: 'off' | 'light' | 'medium' | 'heavy') => void
  /** BL-05 — Click 🔗 on a wired track row → open WireParameterModal. */
  onEditWire?: (wire: import('@/lib/types').ParameterWire) => void
  /** BL-05 — "Wire This Parameter…" right-click menu → open modal in new mode. */
  onWireRequest?: (target: import('@/lib/types').ParameterRef) => void
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TimelinePanel({
  scene, editor, settings, onSettingsChange,
  selectedLayerId, selectedLayerIds, selectedTimelineId, selectedKfIds,
  currentTimeMs, isPlaying, playbackSpeed,
  onTimeChange, onPlayToggle, onSelectTimeline, onSelectKeyframes, onSelectLayer,
  onToggleLayerFlag, onPlaybackSpeedChange, onPlaySegment, activeSegmentId,
  ghostSettings, onGhostUpdate, onGhostToggle, onGhostPreset,
  onEditWire, onWireRequest,
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
  // ── Layer filter (BL-38) — substring match on layer name + tracked properties
  const [layerFilter, setLayerFilter] = useState('')

  // ── Bookmarks (BL-43) — up to 9 saved playhead positions. Cmd+B saves to
  //    the lowest empty slot (cycling if full); Cmd+1..9 jumps. Persisted
  //    in localStorage so they survive reloads of the same project.
  const [bookmarks, setBookmarks] = useState<(number | null)[]>(() => {
    if (typeof window === 'undefined') return Array(9).fill(null)
    try {
      const raw = localStorage.getItem('chorono.timeline.bookmarks')
      if (!raw) return Array(9).fill(null)
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length === 9) return parsed
    } catch { /* fall through */ }
    return Array(9).fill(null)
  })
  useEffect(() => {
    try { localStorage.setItem('chorono.timeline.bookmarks', JSON.stringify(bookmarks)) }
    catch { /* localStorage full or disabled — silent skip */ }
  }, [bookmarks])
  const saveBookmark = useCallback(() => {
    setBookmarks((prev) => {
      const next = [...prev]
      const empty = next.findIndex((v) => v == null)
      if (empty >= 0) next[empty] = currentTimeMs
      else { next.shift(); next.push(currentTimeMs) }       // cycle if full
      return next
    })
  }, [currentTimeMs])
  const jumpToBookmark = useCallback((slot: number) => {
    const t = bookmarks[slot]
    if (t == null) return
    onTimeChange(Math.max(0, Math.min(duration, t)))
  }, [bookmarks, duration, onTimeChange])

  // Keyboard: Cmd/Ctrl+B = save bookmark · Cmd/Ctrl+1..9 = jump to slot.
  // BL-11: [ / ] = jump to previous / next marker (no modifier — quick nav).
  // Scoped to when the timeline panel itself is hovered so it doesn't fight
  // with other panels' shortcuts. Skips when typing in inputs.
  const [timelineHovered, setTimelineHovered] = useState(false)

  // BL-11: jump to nearest marker in a direction. Uses currentTimeMs as anchor;
  // no markers → no-op. Wrap-around could be added later if requested.
  const jumpToAdjacentMarker = useCallback((direction: 'prev' | 'next') => {
    const markers = timeline?.markers
    if (!markers || markers.length === 0) return
    const sorted = [...markers].sort((a, b) => a.timeMs - b.timeMs)
    const target = direction === 'prev'
      ? [...sorted].reverse().find((m) => m.timeMs < currentTimeMs - 0.5)
      : sorted.find((m) => m.timeMs > currentTimeMs + 0.5)
    if (target) onTimeChange(Math.max(0, Math.min(duration, target.timeMs)))
  }, [timeline, currentTimeMs, duration, onTimeChange])

  useEffect(() => {
    if (!timelineHovered) return
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
      const meta = e.metaKey || e.ctrlKey
      if (meta && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault(); saveBookmark(); return
      }
      if (meta && /^[1-9]$/.test(e.key)) {
        e.preventDefault(); jumpToBookmark(parseInt(e.key, 10) - 1); return
      }
      // BL-11: marker navigation — plain [ / ] (no modifier).
      if (!meta && !e.altKey && !e.shiftKey) {
        if (e.key === '[') { e.preventDefault(); jumpToAdjacentMarker('prev'); return }
        if (e.key === ']') { e.preventDefault(); jumpToAdjacentMarker('next'); return }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [timelineHovered, saveBookmark, jumpToBookmark, jumpToAdjacentMarker])
  const visibleLayers = useMemo(() => {
    const q = layerFilter.trim().toLowerCase()
    // Step 1: solo mode — if any layer is solo'd, hide everything else.
    const anySolo = scene.layers.some((l) => l.solo)
    let next = anySolo ? scene.layers.filter((l) => l.solo) : scene.layers
    // Step 2: text filter
    if (q) {
      next = next.filter((l) => {
        if (l.name.toLowerCase().includes(q)) return true
        if (l.type.toLowerCase().includes(q)) return true
        const tracks = timeline?.tracks.filter((t) => t.target.startsWith(`layers.${l.id}.`)) ?? []
        return tracks.some((t) => t.target.toLowerCase().includes(q))
      })
    }
    // Step 3: pinned to the top, preserve original order within each group.
    const pinned   = next.filter((l) =>  l.pinned)
    const unpinned = next.filter((l) => !l.pinned)
    return [...pinned, ...unpinned]
  }, [scene.layers, layerFilter, timeline])

  // Map: layerId → pin index (0,1,2…) — only set for pinned layers.
  const pinIndexFor = useMemo(() => {
    const m = new Map<string, number>()
    let i = 0
    for (const l of visibleLayers) { if (l.pinned) { m.set(l.id, i); i++ } }
    return m
  }, [visibleLayers])
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

  const addKeyframeAtTime = useCallback((trackTarget: string, ms: number) => {
    if (!selectedTimelineId || !timeline) return
    const track = timeline.tracks.find((t) => t.target === trackTarget)
    if (!track) return
    const m = trackTarget.match(/^layers\.([^.]+)\.(.+)$/)
    if (!m) return
    const [, layerId, propPath] = m
    const layer = scene.layers.find((l) => l.id === layerId)
    if (!layer) return
    const defaultVal = readLayerPropAsNumber(layer, propPath)
    const existingVal = evaluateTrack(track, ms) ?? defaultVal ?? 0

    const kf: Keyframe = {
      id: nextKfId(), timeMs: Math.max(0, Math.min(duration, ms)), value: existingVal,
      easing: { type: 'easeOut' },
    }
    dispatchCommand(makeAddKfCmd(selectedTimelineId, trackTarget, kf))
  }, [scene.layers, timeline, selectedTimelineId, duration, dispatchCommand])

  const addKeyframeAtPlayhead = useCallback((trackTarget: string) => {
    addKeyframeAtTime(trackTarget, currentTimeMs)
  }, [addKeyframeAtTime, currentTimeMs])

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
    // Lone-click (no shift) → seek the playhead to this keyframe's time so
    // the canvas + inspector show the exact value that was authored here.
    // Multi-select drags don't seek (would be jumpy).
    if (!shiftHeld && timeline) {
      for (const tr of timeline.tracks) {
        const kf = tr.keyframes.find((k) => k.id === kfId)
        if (kf) { onTimeChange(Math.max(0, Math.min(duration, kf.timeMs))); break }
      }
    }
  }, [selectedKfIds, onSelectKeyframes, timeline, duration, onTimeChange])

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

  // BL-07: Spreadsheet rows derived from the current selection. Cheap derivation
  // — recomputed only when the selection or timeline changes.
  const spreadsheetRows = useMemo<KeyframeSheetRow[]>(() => {
    if (!timeline || selectedKfIds.size === 0) return []
    const out: KeyframeSheetRow[] = []
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        if (!selectedKfIds.has(kf.id)) continue
        const layerSeg = track.target.split('.').slice(1, 2)[0] ?? 'layer'
        const propSeg  = track.target.replace(/^layers\.[^.]+\./, '')
        out.push({
          kfId:        kf.id,
          trackTarget: track.target,
          label:       `${layerSeg} / ${propSeg}`,
          timeMs:      kf.timeMs,
          value:       typeof kf.value === 'number' ? kf.value : null,
          easingType:  kf.easing?.type ?? 'linear',
        })
      }
    }
    return out.sort((a, b) => a.timeMs - b.timeMs)
  }, [timeline, selectedKfIds])

  // BL-07: Selection time bounds — feeds the Scale Handles overlay. null if
  // fewer than 2 kfs selected or they all share the same time.
  const selectionTimeBounds = useMemo(() => {
    if (!timeline || selectedKfIds.size < 2) return null
    let lo = Infinity, hi = -Infinity, count = 0
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        if (!selectedKfIds.has(kf.id)) continue
        if (kf.timeMs < lo) lo = kf.timeMs
        if (kf.timeMs > hi) hi = kf.timeMs
        count++
      }
    }
    return count >= 2 && hi > lo ? { minMs: lo, maxMs: hi } : null
  }, [timeline, selectedKfIds])

  // BL-07: Apply Scale Keys command from on-canvas drag handles. Pivot is the
  // anchored end (opposite the dragged handle); scaleFactor is new/old span.
  const applyScale = useCallback((pivotMs: number, scaleFactor: number) => {
    if (!selectedTimelineId || !timeline || selectedKfIds.size < 2) return
    const items: ScaleKfItem[] = []
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        if (!selectedKfIds.has(kf.id)) continue
        items.push({
          timelineId: selectedTimelineId,
          target:     track.target,
          kfId:       kf.id,
          fromMs:     kf.timeMs,
        })
      }
    }
    if (items.length >= 2) {
      dispatchCommand(makeScaleKeysCmd(items, pivotMs, scaleFactor))
    }
  }, [timeline, selectedTimelineId, selectedKfIds, dispatchCommand])

  // BL-07: Build the StaggerKeysModal's preview list from the current selection.
  // Items are passed in selection-order; the modal sorts by time for indexing.
  const staggerSelectionItems = useMemo<StaggerPreviewItem[]>(() => {
    if (!timeline || selectedKfIds.size === 0) return []
    const out: StaggerPreviewItem[] = []
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        if (!selectedKfIds.has(kf.id)) continue
        const layerSeg = track.target.split('.').slice(1, 2)[0] ?? 'layer'
        const propSeg  = track.target.replace(/^layers\.[^.]+\./, '')
        out.push({
          kfId: kf.id,
          trackTarget: track.target,
          label: `${layerSeg} / ${propSeg}`,
          fromMs: kf.timeMs,
        })
      }
    }
    return out
  }, [timeline, selectedKfIds])

  // BL-07: Apply Stagger Keys command from the modal.
  const applyStagger = useCallback((offsetMs: number, direction: 'forward' | 'backward') => {
    if (!selectedTimelineId || staggerSelectionItems.length < 2) return
    // Sort by time, then assign index so the earliest kf is index 0 (anchor).
    const sorted = [...staggerSelectionItems].sort((a, b) => a.fromMs - b.fromMs)
    const items: StaggerKfItem[] = sorted.map((it, idx) => ({
      timelineId: selectedTimelineId,
      target:     it.trackTarget,
      kfId:       it.kfId,
      fromMs:     it.fromMs,
      index:      idx,
    }))
    dispatchCommand(makeStaggerKeysCmd(items, offsetMs, direction))
  }, [staggerSelectionItems, selectedTimelineId, dispatchCommand])

  // BL-11: Marker handlers — Cmd/Ctrl+click on ruler drops one, drag moves
  // it, [/] keys navigate between them. All mutations route through the
  // command stack so undo/redo works.
  const createMarkerAt = useCallback((timeMs: number) => {
    if (!selectedTimelineId) return
    dispatchCommand(makeAddMarkerCmd(selectedTimelineId, newMarker(Math.round(timeMs))))
  }, [selectedTimelineId, dispatchCommand])

  const moveMarker = useCallback((markerId: string, fromMs: number, toMs: number) => {
    if (!selectedTimelineId || fromMs === toMs) return
    dispatchCommand(makeMoveMarkerCmd(selectedTimelineId, markerId, fromMs, Math.round(toMs)))
  }, [selectedTimelineId, dispatchCommand])

  const renameMarker = useCallback((marker: TimelineMarker, nextLabel: string) => {
    if (!selectedTimelineId || nextLabel === marker.label) return
    dispatchCommand(makeUpdateMarkerCmd(
      selectedTimelineId, marker.id,
      { label: marker.label, color: marker.color },
      { label: nextLabel,    color: marker.color },
    ))
  }, [selectedTimelineId, dispatchCommand])

  const recolorMarker = useCallback((marker: TimelineMarker, nextColor: string) => {
    if (!selectedTimelineId || nextColor === marker.color) return
    dispatchCommand(makeUpdateMarkerCmd(
      selectedTimelineId, marker.id,
      { label: marker.label, color: marker.color },
      { label: marker.label, color: nextColor    },
    ))
  }, [selectedTimelineId, dispatchCommand])

  const deleteMarker = useCallback((marker: TimelineMarker) => {
    if (!selectedTimelineId) return
    dispatchCommand(makeDeleteMarkerCmd(selectedTimelineId, marker))
  }, [selectedTimelineId, dispatchCommand])

  // BL-11: Toolbar callback — initialize work area covering full duration if
  // none exists, otherwise clear it. The drag handles take care of fine-tuning.
  const toggleWorkArea = useCallback(() => {
    if (!selectedTimelineId || !timeline) return
    const inMs  = timeline.workAreaInMs
    const outMs = timeline.workAreaOutMs
    if (inMs == null || outMs == null) {
      dispatchCommand(makeSetWorkAreaCmd(selectedTimelineId, inMs, outMs, 0, duration))
    } else {
      dispatchCommand(makeSetWorkAreaCmd(selectedTimelineId, inMs, outMs, undefined, undefined))
    }
  }, [selectedTimelineId, timeline, duration, dispatchCommand])

  // Apply a work-area drag commit.
  const setWorkAreaRange = useCallback((nextIn: number, nextOut: number) => {
    if (!selectedTimelineId || !timeline) return
    dispatchCommand(makeSetWorkAreaCmd(
      selectedTimelineId,
      timeline.workAreaInMs, timeline.workAreaOutMs,
      Math.round(nextIn), Math.round(nextOut),
    ))
  }, [selectedTimelineId, timeline, dispatchCommand])

  // BL-07: Shift+drag on the ruler → select every keyframe whose time falls
  // inside the dragged [startMs, endMs] window. addToExisting=true (Shift+
  // Ctrl/Cmd) merges with the current selection instead of replacing it.
  const rangeSelectKfs = useCallback((startMs: number, endMs: number, addToExisting: boolean) => {
    if (!timeline) return
    const lo = Math.min(startMs, endMs)
    const hi = Math.max(startMs, endMs)
    const hits = new Set<string>(addToExisting ? selectedKfIds : [])
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        if (kf.timeMs >= lo && kf.timeMs <= hi) hits.add(kf.id)
      }
    }
    onSelectKeyframes(hits)
  }, [timeline, selectedKfIds, onSelectKeyframes])

  // BL-07: Slide selected keyframes by delta ms. Clamped to [0, duration]
  // so kfs can't fall off either side. Uses the existing bulk-move command
  // so the whole shift is a single undo step.
  const slideSelectedKfs = useCallback((deltaMs: number) => {
    if (!selectedTimelineId || !timeline || selectedKfIds.size === 0) return
    const moves: KfMove[] = []
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        if (!selectedKfIds.has(kf.id)) continue
        const toMs = Math.max(0, Math.min(duration, kf.timeMs + deltaMs))
        if (toMs === kf.timeMs) continue
        moves.push({
          timelineId: selectedTimelineId,
          target: track.target,
          kfId: kf.id,
          fromMs: kf.timeMs,
          toMs,
        })
      }
    }
    if (moves.length > 0) dispatchCommand(makeBulkMoveKfCmd(moves))
  }, [timeline, selectedTimelineId, selectedKfIds, duration, dispatchCommand])

  // ── Right-click context menu + inline kf value editor ───────────────────
  // Single shared menu for keyframe right-clicks (we can extend to property
  // and layer rows later). Inline-edit input renders absolutely-positioned
  // over the timeline body using the keyframe's px coordinates.
  const ctxMenu = useContextMenu()
  const [ctxKf, setCtxKf] = useState<{ trackTarget: string; kfId: string } | null>(null)
  const [ctxLayerBar, setCtxLayerBar] = useState<{ layerId: string } | null>(null)
  // Right-click on the empty area of a property row → "Add Keyframe Here" menu.
  const [ctxTrackArea, setCtxTrackArea] = useState<{ trackTarget: string; timeMs: number } | null>(null)
  const [editingKf, setEditingKf] = useState<{
    trackTarget: string; kfId: string
    /** Initial anchor (in viewport space) — used to pick the first open
     *  position. Once the user drags the window, posX/posY take over. */
    anchorX: number; anchorY: number
    /** User-controlled window position. Null = derive from anchor. */
    posX: number | null
    posY: number | null
    draftTime:  string
    draftValue: string
  } | null>(null)

  // BL-45: Track-header right-click target (state declared up here so all
  // openX callbacks below can clear it via setCtxTrackHeader(null)).
  const [ctxTrackHeader, setCtxTrackHeader] = useState<{ trackTarget: string } | null>(null)

  // BL-07: Stagger modal + Keyframe Spreadsheet visibility
  const [staggerModalOpen, setStaggerModalOpen] = useState(false)
  const [keySheetOpen,     setKeySheetOpen]     = useState(false)

  // BL-11: Marker right-click target — set by MarkerOverlay's onContextMenu.
  const [ctxMarker, setCtxMarker] = useState<{ markerId: string } | null>(null)

  const openLayerBarMenu = useCallback((layerId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxKf(null); setCtxTrackArea(null); setCtxTrackHeader(null); setCtxMarker(null)
    setCtxLayerBar({ layerId })
    ctxMenu.open(e)
  }, [ctxMenu])

  const openKfMenu = useCallback((trackTarget: string, kfId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selectedKfIds.has(kfId)) onSelectKeyframes(new Set([kfId]))
    setCtxLayerBar(null); setCtxTrackArea(null); setCtxTrackHeader(null); setCtxMarker(null)
    setCtxKf({ trackTarget, kfId })
    ctxMenu.open(e)
  }, [selectedKfIds, onSelectKeyframes, ctxMenu])

  const openTrackAreaMenu = useCallback((trackTarget: string, timeMs: number, e: React.MouseEvent) => {
    setCtxKf(null); setCtxLayerBar(null); setCtxTrackHeader(null); setCtxMarker(null)
    setCtxTrackArea({ trackTarget, timeMs })
    ctxMenu.open(e)
  }, [ctxMenu])

  const openTrackHeaderMenu = useCallback((trackTarget: string, e: React.MouseEvent) => {
    e.preventDefault()
    setCtxKf(null); setCtxLayerBar(null); setCtxTrackArea(null); setCtxMarker(null)
    setCtxTrackHeader({ trackTarget })
    ctxMenu.open(e)
  }, [ctxMenu])

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
    // Anchor at the actual MOUSE position rather than the keyframe element's
    // bbox. The kf wrapper has weird CSS (translate -50%/-50% + a hover
    // tooltip that inflates its bounding rect mid-double-click) so reading
    // its rect gives a moving target. The mouse coords are always exactly
    // where the user clicked.
    setEditingKf({
      trackTarget, kfId,
      anchorX: e.clientX,
      anchorY: e.clientY,
      posX: null, posY: null,
      draftTime:  String(Math.round(kf.timeMs)),
      draftValue: String(kf.value),
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
      onMouseEnter={() => setTimelineHovered(true)}
      onMouseLeave={() => setTimelineHovered(false)}
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
        autoKeyMode={settings.autoKeyMode ?? (settings.autoKeyframe ? 'auto' : 'manual')}
        onAutoKeyModeChange={(mode) => onSettingsChange({
          ...settings,
          autoKeyMode: mode,
          // Keep the legacy boolean true ONLY when 'auto' — record mode
          // is conditional (only fires during playback) and is evaluated
          // dynamically in page.tsx's autoKeyChangedProps, not via this flag.
          autoKeyframe: mode === 'auto',
        })}
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
        ghostSettings={ghostSettings}
        selectedLayerIds={selectedLayerIds}
        onGhostUpdate={onGhostUpdate}
        onGhostToggle={onGhostToggle}
        onGhostPreset={onGhostPreset}
        onToggleWorkArea={toggleWorkArea}
        workAreaActive={timeline?.workAreaInMs != null && timeline?.workAreaOutMs != null}
      />

      <TrackToolBar
        hasKeyframes={!!(timeline && timeline.tracks.some((t) => t.keyframes.length > 0))}
        selectedCount={selectedKfIds.size}
        frameRate={scene.composition.frameRate}
        onSelectAll={selectAllKfs}
        onDeleteSelected={deleteSelectedKfs}
        onEaseSelected={easeSelectedKfs}
        onSlideSelected={slideSelectedKfs}
        onOpenStaggerModal={() => setStaggerModalOpen(true)}
        onOpenKeySpreadsheet={() => setKeySheetOpen((o) => !o)}
      />

      {/* ── Ruler row (above the layer sections, share scroll horizontally) ── */}
      <div className="flex border-b border-gray-700 shrink-0">
        <div className="w-60 shrink-0 border-r border-gray-700 bg-gray-900 flex items-center px-2 gap-1.5">
          <span className="text-[10px] text-gray-500 shrink-0">🔍</span>
          <input
            type="text"
            value={layerFilter}
            onChange={(e) => setLayerFilter(e.target.value)}
            placeholder="Filter layers…"
            className="flex-1 bg-transparent border-0 text-[10px] text-gray-300 placeholder-gray-600
                       focus:outline-none focus:text-gray-100 min-w-0"
          />
          {layerFilter && (
            <button
              onClick={() => setLayerFilter('')}
              className="text-[10px] text-gray-500 hover:text-gray-300 shrink-0"
              title="Clear filter"
            >✕</button>
          )}
          <span className="text-[10px] font-mono text-gray-500 shrink-0">
            {layerFilter ? `${visibleLayers.length}/${scene.layers.length}` : scene.layers.length}
          </span>
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
            onRangeSelect={rangeSelectKfs}
            onCreateMarker={createMarkerAt}
          />
          {/* BL-11: Work Area brackets — render below the ruler so the shaded
              tint sits on top of ticks without hiding them. */}
          {timeline && (
            <WorkAreaOverlay
              inMs={timeline.workAreaInMs}
              outMs={timeline.workAreaOutMs}
              durationMs={duration}
              msToScreenPx={vp.msToScreenPx}
              clientXToMs={vp.clientXToMs}
              onChange={setWorkAreaRange}
            />
          )}
          {/* BL-11: Marker flags */}
          {timeline?.markers && timeline.markers.length > 0 && (
            <MarkerOverlay
              markers={timeline.markers}
              msToScreenPx={vp.msToScreenPx}
              clientXToMs={vp.clientXToMs}
              durationMs={duration}
              onSeek={onTimeChange}
              onMoveMarker={(m, fromMs, toMs) => moveMarker(m.id, fromMs, toMs)}
              onContextMenu={(m, e) => {
                e.preventDefault()
                setCtxKf(null); setCtxLayerBar(null); setCtxTrackArea(null); setCtxTrackHeader(null)
                setCtxMarker({ markerId: m.id })
                ctxMenu.open(e)
              }}
            />
          )}
          {/* BL-07: Scale Handles overlay — only when 2+ kfs span a real range */}
          {selectionTimeBounds && (
            <ScaleHandlesOverlay
              minMs={selectionTimeBounds.minMs}
              maxMs={selectionTimeBounds.maxMs}
              msToScreenPx={vp.msToScreenPx}
              clientXToMs={vp.clientXToMs}
              durationMs={duration}
              onApply={applyScale}
            />
          )}
          {/* Bookmark flags — overlayed on top of the ruler */}
          {bookmarks.map((bk, i) => bk == null ? null : (
            <div
              key={i}
              className="absolute top-0 h-6 flex items-end justify-center pointer-events-auto cursor-pointer
                         text-[8px] font-mono text-purple-200 hover:text-white group z-10"
              style={{ left: `${vp.msToScreenPx(bk) - 6}px`, width: 12 }}
              onClick={() => jumpToBookmark(i)}
              onContextMenu={(e) => {
                e.preventDefault()
                setBookmarks((prev) => { const n = [...prev]; n[i] = null; return n })
              }}
              title={`Bookmark ${i + 1} @ ${Math.round(bk)}ms · Cmd+${i + 1} jump · Right-click clear`}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-full bg-purple-500/60 group-hover:bg-purple-300" />
              <span className="relative bg-purple-700 px-1 rounded-sm leading-none">{i + 1}</span>
            </div>
          ))}
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
              onDelete={(seg) => dispatchCommand(makeDeleteSegmentCmd(timeline.id, seg))}
            />
          )}
          {/* ── EventStrip (BL-36) ───────────────────────────────────────── */}
          {timeline && (
            <EventStrip
              events={timeline.events ?? []}
              durationMs={duration}
              totalContentPx={vp.totalContentPx}
              msToScreenPx={vp.msToScreenPx}
              clientXToMs={vp.clientXToMs}
              onCreateAt={(ms) => {
                if (!selectedTimelineId) return
                const name = window.prompt('Event name', 'event')
                if (!name) return
                const ev: TimelineEvent = {
                  id: nextEventId(),
                  timeMs: Math.max(0, Math.min(duration, Math.round(ms))),
                  name: name.trim() || 'event',
                }
                dispatchCommand(makeAddEventCmd(selectedTimelineId, ev))
              }}
              onEdit={(ev) => {
                if (!selectedTimelineId) return
                const nextName = window.prompt('Rename event', ev.name)
                if (nextName == null) return
                dispatchCommand(makeUpdateEventCmd(
                  selectedTimelineId, ev.id,
                  { name: ev.name,         timeMs: ev.timeMs, payload: ev.payload },
                  { name: nextName.trim(), timeMs: ev.timeMs, payload: ev.payload },
                ))
              }}
              onDelete={(ev) => {
                if (!selectedTimelineId) return
                dispatchCommand(makeDeleteEventCmd(selectedTimelineId, ev))
              }}
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
        {scene.layers.length > 0 && visibleLayers.length === 0 && (
          <div className="p-6 text-center text-xs text-gray-600">
            No layers match &ldquo;{layerFilter}&rdquo;.
            <button
              onClick={() => setLayerFilter('')}
              className="ml-2 text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >clear filter</button>
          </div>
        )}

        {visibleLayers.map((layer) => (
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
            pinIndex={pinIndexFor.get(layer.id) ?? -1}
            audioUrl={layer.type === 'audio' && layer.audio
              ? scene.assets?.find((a) => a.id === layer.audio!.assetId)?.url
              : undefined}
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
            onTrackAreaContextMenu={openTrackAreaMenu}
            onTrackHeaderContextMenu={openTrackHeaderMenu}
            onTrackAreaDoubleClick={(target, ms) => addKeyframeAtTime(target, ms)}
            clientXToMs={vp.clientXToMs}
            parameterWires={scene.parameterWires}
            onEditWire={onEditWire}
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

      {/* ── Stagger Keys modal (BL-07) ───────────────────────────────────── */}
      {staggerModalOpen && (
        <StaggerKeysModal
          items={staggerSelectionItems}
          onApply={applyStagger}
          onClose={() => setStaggerModalOpen(false)}
        />
      )}

      {/* ── Inline value editor (kf double-click) ─────────────────────── */}
      {editingKf && (() => {
        const tl = scene.timelines.find((t) => t.id === selectedTimelineId)
        const tr = tl?.tracks.find((t) => t.target === editingKf.trackTarget)
        const kf = tr?.keyframes.find((k) => k.id === editingKf.kfId)
        if (!kf || typeof kf.value !== 'number' || !selectedTimelineId || !tr) {
          setEditingKf(null); return null
        }
        // Find prev / next kfs to know if IN/OUT easing is meaningful.
        const sorted   = [...tr.keyframes].sort((a, b) => a.timeMs - b.timeMs)
        const idx      = sorted.findIndex((k) => k.id === kf.id)
        const prevKf   = idx > 0                   ? sorted[idx - 1] : null
        const nextKf   = idx < sorted.length - 1   ? sorted[idx + 1] : null
        // IN easing = the easing on the PREVIOUS kf (controls the segment
        // entering THIS kf). OUT easing = this kf's own easing.
        const inEasing  = prevKf?.easing.type ?? null
        const outEasing = nextKf ? kf.easing.type : null   // no segment → no OUT

        const close = () => setEditingKf(null)
        const commit = () => {
          const nextTime  = Number(editingKf.draftTime)
          const nextValue = Number(editingKf.draftValue)
          if (Number.isFinite(nextValue) && nextValue !== kf.value) {
            dispatchCommand(makeUpdateKfValueCmd(
              selectedTimelineId, editingKf.trackTarget, kf.id, kf.value, nextValue,
            ))
          }
          if (Number.isFinite(nextTime) && Math.round(nextTime) !== Math.round(kf.timeMs)) {
            const clamped = Math.max(0, Math.min(duration, Math.round(nextTime)))
            dispatchCommand(makeBulkMoveKfCmd([{
              kfId: kf.id, target: editingKf.trackTarget, timelineId: selectedTimelineId!,
              fromMs: kf.timeMs, toMs: clamped,
            }]))
          }
          close()
        }
        const setInEasing = (type: EasingType) => {
          if (!prevKf) return
          dispatchCommand(makeUpdateEasingCmd(
            selectedTimelineId!, editingKf.trackTarget, prevKf.id,
            prevKf.easing, { type },
          ))
        }
        const setOutEasing = (type: EasingType) => {
          if (!nextKf) return
          dispatchCommand(makeUpdateEasingCmd(
            selectedTimelineId!, editingKf.trackTarget, kf.id,
            kf.easing, { type },
          ))
        }

        return (
          <KeyframeEditWindow
            editingKf={editingKf}
            propPath={editingKf.trackTarget.replace(`layers.`, '')}
            inEasing={inEasing}
            outEasing={outEasing}
            hasPrev={!!prevKf}
            hasNext={!!nextKf}
            onChangeDraftTime={(v)  => setEditingKf({ ...editingKf, draftTime:  v })}
            onChangeDraftValue={(v) => setEditingKf({ ...editingKf, draftValue: v })}
            onMove={(x, y)          => setEditingKf({ ...editingKf, posX: x, posY: y })}
            onSetInEasing={setInEasing}
            onSetOutEasing={setOutEasing}
            onClose={close}
            onCommit={commit}
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
        // Already-animated property paths so we don't list them twice in
        // the "Add Animation" submenu.
        const animatedOnLayer = new Set(
          (timeline?.tracks ?? [])
            .filter((t) => t.target.startsWith(`layers.${layer.id}.`))
            .map((t) => t.target.replace(`layers.${layer.id}.`, ''))
        )
        const addableProps = ANIMATABLE_PROPERTIES.filter((p) => {
          if (animatedOnLayer.has(p.path)) return false
          return !p.layerTypes || p.layerTypes.includes(layer.type)
        })
        // Group by category for a nice submenu structure.
        const propsByGroup = new Map<string, typeof addableProps>()
        for (const p of addableProps) {
          const arr = propsByGroup.get(p.group) ?? []
          arr.push(p)
          propsByGroup.set(p.group, arr)
        }
        const items = [
          {
            kind: 'submenu' as const,
            label: '+ Add Animation',
            disabled: addableProps.length === 0,
            items: Array.from(propsByGroup.entries()).flatMap(([groupName, list], i) => [
              ...(i > 0 ? [{ kind: 'separator' as const }] : []),
              {
                kind: 'action' as const,
                label: `── ${groupName} ──`,
                shortcut: undefined,
                disabled: true,
                onSelect: () => { /* header row */ },
              },
              ...list.map((p) => ({
                kind: 'action' as const,
                label: p.label,
                shortcut: undefined,
                disabled: false,
                onSelect: () => {
                  addTrack(layer.id, p.path)
                  // Immediately drop a keyframe at the playhead so the new
                  // track isn't empty — common workflow.
                  setTimeout(() => addKeyframeAtTime(`layers.${layer.id}.${p.path}`, currentTimeMs), 0)
                },
              })),
            ]),
          },
          { kind: 'separator' as const },
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
          { kind: 'separator' as const },
          {
            kind: 'action' as const,
            label: layer.pinned ? '📌 Unpin Layer' : '📌 Pin Layer to Top',
            shortcut: undefined, disabled: false,
            onSelect: () => dispatchCommand(
              makeUpdateLayerCmd(layer.id, { pinned: !layer.pinned }, layer)
            ),
          },
          {
            kind: 'action' as const,
            label: layer.solo ? 'Exit Solo' : 'Solo in Timeline',
            shortcut: undefined, disabled: false,
            onSelect: () => dispatchCommand(
              makeUpdateLayerCmd(layer.id, { solo: !layer.solo }, layer)
            ),
          },
          { kind: 'separator' as const },
          {
            kind: 'submenu' as const, label: 'Color Label',
            disabled: false,
            items: LAYER_COLOR_LABELS.map((c) => ({
              kind: 'action' as const,
              label: c.label,
              shortcut: undefined,
              disabled: false,
              onSelect: () => dispatchCommand(
                makeUpdateLayerCmd(layer.id, { colorLabel: c.hex ?? undefined }, layer)
              ),
            })),
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

      {/* ── Track-area right-click menu (empty space inside a property row) ── */}
      {ctxMenu.isOpen && ctxTrackArea && (() => {
        const ms = ctxTrackArea.timeMs
        const items = [
          {
            kind: 'action' as const,
            label: `Add Keyframe Here  (${Math.round(ms)}ms)`,
            shortcut: undefined, disabled: false,
            onSelect: () => addKeyframeAtTime(ctxTrackArea.trackTarget, ms),
          },
          {
            kind: 'action' as const,
            label: 'Add Keyframe at Playhead',
            shortcut: undefined, disabled: false,
            onSelect: () => addKeyframeAtPlayhead(ctxTrackArea.trackTarget),
          },
          { kind: 'separator' as const },
          {
            kind: 'action' as const,
            label: 'Set Playhead Here',
            shortcut: undefined, disabled: false,
            onSelect: () => onTimeChange(Math.max(0, Math.min(duration, ms))),
          },
        ]
        return (
          <ContextMenu
            x={ctxMenu.state!.x} y={ctxMenu.state!.y}
            items={items}
            onClose={() => { ctxMenu.close(); setCtxTrackArea(null) }}
          />
        )
      })()}

      {/* ── Marker right-click menu (BL-11) ──────────────────────────────── */}
      {ctxMenu.isOpen && ctxMarker && selectedTimelineId && timeline && (() => {
        const marker = timeline.markers?.find((m) => m.id === ctxMarker.markerId)
        if (!marker) return null
        const items = [
          {
            kind: 'action' as const,
            label: 'Rename…',
            shortcut: undefined, disabled: false,
            onSelect: () => {
              const next = window.prompt('Marker label', marker.label)
              if (next != null) renameMarker(marker, next)
            },
          },
          {
            kind: 'submenu' as const,
            label: `Color (${marker.color ?? 'default'})`,
            items: ['#a78bfa', '#fbbf24', '#34d399', '#f87171', '#22d3ee', '#fb7185', '#e5e7eb']
              .map((c) => ({
                kind: 'action' as const,
                label: `${marker.color === c ? '✓ ' : '   '}${c}`,
                disabled: false,
                onSelect: () => recolorMarker(marker, c),
              })),
          },
          { kind: 'separator' as const },
          {
            kind: 'action' as const,
            label: `Jump to marker  (${Math.round(marker.timeMs)}ms)`,
            shortcut: undefined, disabled: false,
            onSelect: () => onTimeChange(marker.timeMs),
          },
          { kind: 'separator' as const },
          {
            kind: 'action' as const,
            label: 'Delete Marker',
            shortcut: '⌫', disabled: false,
            onSelect: () => deleteMarker(marker),
          },
        ]
        return (
          <ContextMenu
            x={ctxMenu.state!.x} y={ctxMenu.state!.y}
            items={items}
            onClose={() => { ctxMenu.close(); setCtxMarker(null) }}
          />
        )
      })()}

      {/* ── Track-header right-click menu (BL-45 OOR + BL-05 Wire actions) ─── */}
      {ctxMenu.isOpen && ctxTrackHeader && selectedTimelineId && timeline && (() => {
        const track = timeline.tracks.find((t) => t.target === ctxTrackHeader.trackTarget)
        if (!track) return null
        // Extract layerId + propertyPath from "layers.<id>.<prop>" track target
        const layerMatch = /^layers\.([^.]+)\.(.+)$/.exec(track.target)
        const layerIdOnTrack  = layerMatch?.[1]
        const propertyPath    = layerMatch?.[2]
        const wireOnProp = (layerIdOnTrack && propertyPath)
          ? (scene.parameterWires ?? []).find(
              (w) => w.enabled && w.target.layerId === layerIdOnTrack && w.target.propertyPath === propertyPath
            ) ?? null
          : null

        type Item = Parameters<typeof ContextMenu>[0]['items'][number]
        const items: Item[] = [
          buildOutOfRangeSubmenu(track.outOfRange, (next) => {
            dispatchCommand(
              makeSetOutOfRangeCmd(selectedTimelineId, track.target, track.outOfRange, next),
            )
          }),
          // BL-50 — Controller ▸ (switch between keyframe / waveform / noise)
          {
            kind: 'submenu', label: 'Controller', disabled: false,
            items: [
              {
                kind: 'action' as const,
                label: (!track.controller || track.controller.type === 'keyframe' ? '● ' : '  ') + 'Keyframe',
                shortcut: undefined, disabled: false,
                onSelect: () => dispatchCommand(makeSetTrackControllerCmd(
                  selectedTimelineId, track.target, track.controller, { type: 'keyframe' },
                )),
              },
              {
                kind: 'action' as const,
                label: (track.controller?.type === 'waveform' ? '● ' : '  ') + 'Waveform (sine / square / saw)',
                shortcut: undefined, disabled: false,
                onSelect: () => dispatchCommand(makeSetTrackControllerCmd(
                  selectedTimelineId, track.target, track.controller,
                  { type: 'waveform', waveform: { ...DEFAULT_WAVEFORM_PARAMS } },
                )),
              },
              {
                kind: 'action' as const,
                label: (track.controller?.type === 'noise' ? '● ' : '  ') + 'Noise (deterministic fbm)',
                shortcut: undefined, disabled: false,
                onSelect: () => dispatchCommand(makeSetTrackControllerCmd(
                  selectedTimelineId, track.target, track.controller,
                  { type: 'noise', noise: { ...DEFAULT_NOISE_PARAMS } },
                )),
              },
            ],
          },
          // BL-46 — Add Modifier ▸ (track-scope)
          {
            kind: 'submenu', label: '+ Add Modifier', disabled: false,
            items: BL46_MODIFIER_TYPES.map((type) => ({
              kind: 'action' as const,
              label: BL46_MODIFIER_LABEL[type] ?? type,
              shortcut: undefined,
              disabled: false,
              onSelect: () => {
                const m: CurveModifier = {
                  id: nextModifierId(),
                  type, enabled: true, blendMode: 'add', weight: 1,
                  parameters: defaultParametersFor(type),
                }
                dispatchCommand(makeAddCurveModifierCmd(
                  selectedTimelineId,
                  { kind: 'track', target: track.target },
                  m,
                ))
              },
            })),
          },
        ]
        // BL-51 polish — "Bake to Keyframes" appears when the track has
        // any signal-system feature that a basic interpolator can't replay.
        const usesSig =
          (track.modifiers && track.modifiers.length > 0) ||
          (track.controller && track.controller.type !== 'keyframe') ||
          !!track.easeCurve || !!track.timeWarp || !!track.multiplierCurve ||
          (track.outOfRange && (track.outOfRange.before !== 'constant' || track.outOfRange.after !== 'constant')) ||
          (track.keyframes.some((k) => k.segmentModifiers && k.segmentModifiers.length > 0))
        if (usesSig) {
          items.push({ kind: 'separator' })
          items.push({
            kind: 'action', label: 'Bake Track to Keyframes',
            shortcut: undefined, disabled: false,
            onSelect: () => {
              dispatchCommand(makeBakeTrackToKeyframesCmd(
                selectedTimelineId, track.target, track,
                { startMs: 0, endMs: duration, fps: 60, tolerance: 0.005 },
              ))
            },
          })
        }
        if (layerIdOnTrack && propertyPath && (onEditWire || onWireRequest)) {
          items.push({ kind: 'separator' })
          if (wireOnProp) {
            items.push({
              kind: 'action', label: 'Edit Wire…', shortcut: undefined, disabled: !onEditWire,
              onSelect: () => { onEditWire?.(wireOnProp) },
            })
          } else if (onWireRequest) {
            items.push({
              kind: 'action', label: 'Wire This Parameter…', shortcut: undefined, disabled: false,
              onSelect: () => onWireRequest({
                layerId: layerIdOnTrack, propertyPath, valueType: 'number',
              }),
            })
          }
        }
        return (
          <ContextMenu
            x={ctxMenu.state!.x} y={ctxMenu.state!.y}
            items={items}
            onClose={() => { ctxMenu.close(); setCtxTrackHeader(null) }}
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

      {/* ── Minimap (BL-43) — quick overview + pan ────────────────────────── */}
      <TimelineMinimap
        durationMs={duration}
        currentTimeMs={currentTimeMs}
        timeline={timeline}
        scrollLeftPx={vp.scrollLeftPx}
        totalContentPx={vp.totalContentPx}
        trackWidth={vp.trackWidth}
        setScrollLeftPx={vp.setScrollLeftPx}
        onSeek={onTimeChange}
      />

      {/* ── BL-07: Keyframe Spreadsheet drawer (toggled by ⊞ Sheet) ─────── */}
      {keySheetOpen && selectedTimelineId && (
        <KeyframeSpreadsheet
          rows={spreadsheetRows}
          onUpdateTime={(kfId, target, fromMs, toMs) =>
            dispatchCommand(makeMoveKfCmd(selectedTimelineId, target, kfId, fromMs, toMs))
          }
          onUpdateValue={(kfId, target, fromValue, toValue) =>
            dispatchCommand(makeUpdateKfValueCmd(selectedTimelineId, target, kfId, fromValue, toValue))
          }
          onUpdateEasing={(kfId, target, toEasing) => {
            const tr = timeline?.tracks.find((t) => t.target === target)
            const kf = tr?.keyframes.find((k) => k.id === kfId)
            if (!kf) return
            dispatchCommand(makeUpdateEasingCmd(selectedTimelineId, target, kfId, kf.easing, { type: toEasing }))
          }}
          onDelete={(kfId, target) => {
            const tr = timeline?.tracks.find((t) => t.target === target)
            const kf = tr?.keyframes.find((k) => k.id === kfId)
            if (!kf) return
            dispatchCommand(makeDeleteKfCmd(selectedTimelineId, target, kf))
          }}
          onClose={() => setKeySheetOpen(false)}
        />
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
        autoKeyMode={settings.autoKeyMode ?? (settings.autoKeyframe ? 'auto' : 'manual')}
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

// ── KeyframeEditWindow ─────────────────────────────────────────────────────
// Floating, draggable, modeless edit window. Non-modal so the underlying
// timeline stays fully interactive while it's open. Opens to the right of
// the clicked keyframe (or flipped to the left if there's no room),
// vertically centred on the kf. After the first paint the user can drag
// it anywhere by the title bar; the position sticks in `editingKf.posX/Y`
// so re-renders don't bounce it back.

const POPOVER_W = 252
const POPOVER_H = 220
const ANCHOR_GAP = 14

function KeyframeEditWindow({
  editingKf, propPath, inEasing, outEasing, hasPrev, hasNext,
  onChangeDraftTime, onChangeDraftValue, onMove,
  onSetInEasing, onSetOutEasing, onClose, onCommit,
}: {
  editingKf: {
    anchorX: number; anchorY: number
    posX: number | null; posY: number | null
    draftTime: string; draftValue: string
  }
  propPath: string
  inEasing: EasingType | null
  outEasing: EasingType | null
  hasPrev: boolean
  hasNext: boolean
  onChangeDraftTime:  (v: string) => void
  onChangeDraftValue: (v: string) => void
  onMove:             (x: number, y: number) => void
  onSetInEasing:      (t: EasingType) => void
  onSetOutEasing:     (t: EasingType) => void
  onClose:            () => void
  onCommit:           () => void
}) {
  const { left, top } = useMemo(() => {
    if (editingKf.posX != null && editingKf.posY != null) {
      return { left: editingKf.posX, top: editingKf.posY }
    }
    // Initial placement. Pick the side (above/below, right/left) with more
    // space. If neither side fits comfortably, fall back to anchoring at
    // the centre of the viewport — guarantees the popover is fully visible
    // even when the kf is in a tiny dock leaf at the screen edge.
    const vw = typeof window !== 'undefined' ? window.innerWidth  : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight :  720
    const ax = editingKf.anchorX
    const ay = editingKf.anchorY
    // Horizontal — prefer the side with more space.
    const rightSpace = vw - ax - 8
    const leftSpace  = ax - 8
    let l: number
    if (rightSpace >= POPOVER_W + ANCHOR_GAP)      l = ax + ANCHOR_GAP
    else if (leftSpace >= POPOVER_W + ANCHOR_GAP)  l = ax - ANCHOR_GAP - POPOVER_W
    else                                           l = (vw - POPOVER_W) / 2
    // Vertical — prefer above (keeps kf visible). Flip below if no room.
    const topSpace    = ay - 8
    const bottomSpace = vh - ay - 8
    let t: number
    if (topSpace >= POPOVER_H + ANCHOR_GAP)        t = ay - POPOVER_H - ANCHOR_GAP
    else if (bottomSpace >= POPOVER_H + ANCHOR_GAP) t = ay + ANCHOR_GAP
    else                                            t = (vh - POPOVER_H) / 2
    // Final safety clamp — never let the window escape the viewport.
    l = Math.max(8, Math.min(vw - POPOVER_W - 8, l))
    t = Math.max(8, Math.min(vh - POPOVER_H - 8, t))
    return { left: l, top: t }
  }, [editingKf.anchorX, editingKf.anchorY, editingKf.posX, editingKf.posY])

  // Drag from the title bar — global pointer listeners so the drag tracks
  // even when the cursor leaves the title bar mid-drag.
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  useEffect(() => {
    if (!dragRef.current) return
    const onMoveEv = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return
      const vw = window.innerWidth, vh = window.innerHeight
      const nx = Math.max(8, Math.min(vw - POPOVER_W - 8, d.origX + e.clientX - d.startX))
      const ny = Math.max(8, Math.min(vh - POPOVER_H - 8, d.origY + e.clientY - d.startY))
      onMove(nx, ny)
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('pointermove', onMoveEv)
    window.addEventListener('pointerup',   onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMoveEv)
      window.removeEventListener('pointerup',   onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }) // re-arm each render — ref drives the actual gating

  // Click-outside close — non-modal, so we listen at the document level
  // and ignore clicks inside the window. Stop closing if the user is
  // mid-drag (rare race when releasing the pointer over an unrelated area).
  const windowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (dragRef.current) return
      if (windowRef.current && windowRef.current.contains(e.target as Node)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const beginDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: left, origY: top,
    }
  }

  return (
    <div
      ref={windowRef}
      className="fixed z-50 bg-gray-900 border border-gray-700 rounded-md shadow-2xl
                 text-[11px] text-gray-300 select-none"
      style={{ left, top, width: POPOVER_W }}
      onKeyDown={(e) => {
        if (e.key === 'Enter')  { e.preventDefault(); onCommit() }
        if (e.key === 'Escape') { e.preventDefault(); onClose() }
        e.stopPropagation()
      }}
    >
      {/* Title bar — drag handle + close */}
      <div
        className="flex items-center justify-between px-2 py-1 bg-gray-800
                   rounded-t-md border-b border-gray-700 cursor-move"
        onPointerDown={beginDrag}
      >
        <span className="text-[10px] font-mono text-gray-400 truncate" title={propPath}>
          {propPath}
        </span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-white
                     hover:bg-gray-700 rounded leading-none"
          title="Close (Esc)"
        >×</button>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-gray-600">Time (ms)</span>
            <input
              autoFocus type="number" value={editingKf.draftTime}
              onChange={(e) => onChangeDraftTime(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="px-1.5 py-1 bg-gray-950 border border-gray-700 rounded
                         text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-gray-600">Value</span>
            <input
              type="number" step="any" value={editingKf.draftValue}
              onChange={(e) => onChangeDraftValue(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="px-1.5 py-1 bg-gray-950 border border-gray-700 rounded
                         text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <EasingSlot
            label="In"
            value={inEasing}
            disabled={!hasPrev}
            emptyLabel={!hasPrev ? '— no prev key —' : undefined}
            onChange={onSetInEasing}
          />
          <EasingSlot
            label="Out"
            value={outEasing}
            disabled={!hasNext}
            emptyLabel={!hasNext ? '— no next key —' : undefined}
            onChange={onSetOutEasing}
          />
        </div>

        <div className="flex justify-end gap-1">
          <button
            onClick={onClose}
            className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 rounded text-gray-400"
          >Cancel</button>
          <button
            onClick={onCommit}
            className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white"
          >Apply  ↵</button>
        </div>
      </div>
    </div>
  )
}

// ── EasingSlot ─────────────────────────────────────────────────────────────
// Small <select> used in the keyframe edit popover for IN / OUT easing.
// When `disabled` is true (no neighbouring keyframe) we render a flat
// placeholder line instead of an empty <select> so the user instantly sees
// "nothing to set here" without trying to interact.
const EASING_OPTIONS: { value: EasingType; label: string }[] = [
  { value: 'linear',       label: 'Linear' },
  { value: 'easeIn',       label: 'Ease In' },
  { value: 'easeOut',      label: 'Ease Out' },
  { value: 'easeInOut',    label: 'Ease In/Out' },
  { value: 'hold',         label: 'Hold' },
  { value: 'customBezier', label: 'Custom Bezier' },
]
function EasingSlot({
  label, value, disabled, emptyLabel, onChange,
}: {
  label:      string
  value:      EasingType | null
  disabled:   boolean
  emptyLabel?: string
  onChange:   (type: EasingType) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-gray-600">{label}</span>
      {disabled ? (
        <div className="px-1.5 py-1 bg-gray-950/50 border border-dashed border-gray-800
                        rounded text-[9px] text-gray-600 italic text-center select-none">
          {emptyLabel ?? '— n/a —'}
        </div>
      ) : (
        <select
          value={value ?? 'linear'}
          onChange={(e) => onChange(e.target.value as EasingType)}
          className="px-1.5 py-1 bg-gray-950 border border-gray-700 rounded
                     text-white font-mono focus:outline-none focus:border-blue-500"
        >
          {EASING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </div>
  )
}
