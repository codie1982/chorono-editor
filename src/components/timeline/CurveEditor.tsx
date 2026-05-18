'use client'
import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import type { ChronoScene, Track, Layer, Keyframe } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import {
  pickTrackColor, unionValueRange, buildCurvePath,
  buildCurvePathSegments, hasNonConstantOutOfRange,
  msToX, valueToY, pickTimeTickMs, pickValueTick, formatTickValue,
  type CurveViewport, type ValueRange,
} from '@/lib/timeline/curveMath'
import { useCurveDrag } from './hooks/useCurveDrag'
import {
  makeUpdateEasingCmd, makeAddKfCmd, makeDeleteKfCmd, makeUpdateKfValueCmd,
  makeMirrorTimingCmd, makeFlattenSegmentCmd, makeReverseValuesCmd,
  type KfValueRef,
} from '@/lib/editor/commands-keyframe'
import { evaluateTrack } from '@/lib/evaluator'
import { updateKfTimeMs, updateKfEasing } from '@/lib/timeline/keyframeOps'
import type { TangentMode } from '@/lib/types'
import { nextKfId } from '@/lib/defaults'
import ContextMenu, { useContextMenu, type MenuItem } from '@/components/ui/ContextMenu'
import type { EasingType } from '@/lib/types'
import {
  buildKeyframeMenu, buildEmptyAreaMenu, buildSegmentMenu,
} from './keyframeMenuItems'

interface Props {
  scene:              ChronoScene
  editor:             EditorStateReturn
  selectedLayerId:    string | null
  selectedTimelineId: string | null
  currentTimeMs:      number
  onTimeChange:       (ms: number) => void
  selectedKfIds:      Set<string>
  onSelectKeyframes:  (next: Set<string>) => void
}

const LEFT_GUTTER  = 110   // px reserved for the property name + Y-axis labels
const TOP_GUTTER   = 24    // px reserved for X-axis labels
const BOTTOM_PAD   = 16
const DEFAULT_BEZIER = { cx1: 0.42, cy1: 0, cx2: 0.58, cy2: 1 } as const

/**
 * 3ds Max / After Effects-style curve editor.
 *
 * Shows every animated property of the selected layer as a colour-coded
 * curve on a shared time × value plot. Click anywhere on the plot to seek;
 * drag a keyframe node to retime (X) or revalue (Y) it in real time. Bezier
 * tangent handles for fully custom easing are a follow-up — for now, the
 * built-in easing types (linear / ease* / customBezier) are reflected in
 * the sampled curve so the picture matches playback exactly.
 *
 * Non-numeric tracks (string / boolean / color) are hidden — they don't
 * have a meaningful value axis. Add a key in the timeline panel first.
 */
export default function CurveEditor({
  scene, editor, selectedLayerId, selectedTimelineId,
  currentTimeMs, onTimeChange, selectedKfIds, onSelectKeyframes,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef       = useRef<SVGSVGElement>(null)
  /** Live ResizeObserver — held across re-renders so a single observer
   *  follows the container even if the callback ref re-attaches. */
  const roRef = useRef<ResizeObserver | null>(null)

  const timeline = scene.timelines.find((t) => t.id === selectedTimelineId) ?? null
  const layer    = scene.layers.find((l) => l.id === selectedLayerId) ?? null
  const duration = timeline?.durationMs ?? scene.composition.durationMs

  // ── Track set: every numeric track on the selected layer ─────────────────
  //
  // TODO(big-feature): "Show in Curve Editor" pin set.
  //   Today the Curve Editor's track set is implicit from the selected
  //   layer. A v2 model would let the user PIN specific tracks across any
  //   layers (a `visiblePropertyIds` set in editor state), so they can
  //   tune e.g. "Logo.opacity + Card.x" together without changing selection.
  //   Implementation: lift the visible-track set out of this component
  //   into useEditorState / useTrackViewState; replace the layer-driven
  //   `tracks` filter with a Set-driven lookup.
  const tracks: Track[] = useMemo(() => {
    if (!timeline || !layer) return []
    const prefix = `layers.${layer.id}.`
    return timeline.tracks.filter((t) =>
      t.target.startsWith(prefix) &&
      t.keyframes.length > 0 &&
      typeof t.keyframes[0].value === 'number',
    )
  }, [timeline, layer])

  // ── Per-track visibility toggle (3ds Max-style: click curve name to hide) ─
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  // ── Curve isolation (BL-40) — when set, all other tracks render as low-opacity
  // ghosts so the user can focus on this one curve without losing peripheral
  // shape context. Esc clears. Toggling the same track also clears.
  const [isolatedTrack, setIsolatedTrack] = useState<string | null>(null)
  const visibleTracks = useMemo(
    () => tracks.filter((t) => !hidden.has(t.target)),
    [tracks, hidden],
  )

  // ── Normalize mode: per-track Y rescale ───────────────────────────────────
  // When on, each curve is mapped to its own [min, max] on the Y axis so
  // curves with very different value ranges (e.g. opacity 0–1 vs. x 0–1000)
  // become visually comparable at the same height.
  const [normalizeMode, setNormalizeMode] = useState(false)

  const perTrackRanges = useMemo((): Map<string, ValueRange> => {
    const m = new Map<string, ValueRange>()
    for (const t of visibleTracks) {
      const vals = t.keyframes
        .map((k) => k.value)
        .filter((v): v is number => typeof v === 'number')
      if (vals.length === 0) { m.set(t.target, { min: -1, max: 1 }); continue }
      const lo = Math.min(...vals)
      const hi = Math.max(...vals)
      const pad = (hi - lo) * 0.1 || 0.5
      m.set(t.target, { min: lo - pad, max: hi + pad })
    }
    return m
  }, [visibleTracks])

  // ── Hover state — shows kf metadata in the status bar ────────────────────
  const [hoveredKf, setHoveredKf] = useState<{
    trackTarget: string; kfId: string; ms: number; value: number; easingType: string
  } | null>(null)
  // Track being hovered (over the curve line itself, not a keyframe node).
  // Highlights the corresponding visible path so the user can tell which
  // curve they're about to interact with.
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null)
  // Clicked segment — the portion of a curve between two consecutive keys.
  // Clicking a segment ALSO selects its two bounding keyframes so the
  // existing easing/delete toolbar acts on them.
  const [selectedSegment, setSelectedSegment] = useState<{
    trackTarget: string; kfAId: string; kfBId: string
  } | null>(null)

  // ── Size observation (SVG fills its container) ────────────────────────────
  // Callback ref instead of useEffect+useRef so we measure correctly even
  // when the container is conditionally rendered (the editor shows several
  // early-return Empty states before the real chart mounts; a one-shot
  // useEffect[] would miss the late mount).
  const [size, setSize] = useState({ w: 600, h: 320 })
  const containerCb = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el
    // Tear down any previous observer (re-attach when remount happens).
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null }
    if (!el) return
    // Measure once immediately so the first paint already uses real dims.
    const r = el.getBoundingClientRect()
    setSize({ w: Math.max(200, r.width), h: Math.max(160, r.height) })
    // Then keep tracking subsequent resizes (split drags, fullscreen, …).
    const ro = new ResizeObserver(() => {
      const rr = el.getBoundingClientRect()
      setSize({ w: Math.max(200, rr.width), h: Math.max(160, rr.height) })
    })
    ro.observe(el)
    roRef.current = ro
  }, [])

  // ── Time/value viewport ───────────────────────────────────────────────────
  const [viewStartMs, setViewStartMs] = useState(0)
  const [viewEndMs,   setViewEndMs]   = useState(duration)

  // Re-fit the X axis when timeline duration changes
  useEffect(() => { setViewStartMs(0); setViewEndMs(duration) }, [duration])

  const range: ValueRange = useMemo(
    () => unionValueRange(visibleTracks) ?? { min: -1, max: 1 },
    [visibleTracks],
  )

  const plotW = Math.max(50, size.w - LEFT_GUTTER - 8)
  const plotH = Math.max(50, size.h - TOP_GUTTER - BOTTOM_PAD)
  const viewport: CurveViewport = {
    startMs: viewStartMs, endMs: viewEndMs,
    range, widthPx: plotW, heightPx: plotH,
  }

  // Per-track viewport resolver — returns viewport with per-track range when
  // normalizeMode is on; falls back to shared range when off.
  const getTrackViewport = useCallback((target: string): CurveViewport => {
    if (!normalizeMode) return viewport
    const r = perTrackRanges.get(target) ?? range
    return { ...viewport, range: r }
  }, [normalizeMode, perTrackRanges, viewport, range])

  // ── Pointer mapping (client → SVG-plot-local) ─────────────────────────────
  const clientToLocal = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: clientX - rect.left - LEFT_GUTTER,
      y: clientY - rect.top  - TOP_GUTTER,
    }
  }, [])

  // ── Toolbar state ─────────────────────────────────────────────────────────
  // Show/hide bezier tangent handles globally. Off by default keeps the
  // chart less noisy when scrubbing; toggle from the toolbar when shaping
  // easing curves.
  const [showHandles, setShowHandles] = useState(true)

  // ── Right-click context menu ─────────────────────────────────────────────
  // One menu state shared across all three flavours (empty area / keyframe
  // / segment) — we pick which item-builder to call based on `menuKind`.
  // Position + clickMs/clickValue captured at open time so "Set Playhead
  // Here" etc. act on the actual point the user pointed at, not what
  // happens to be under the cursor by the time the action fires.
  const ctxMenu = useContextMenu()
  type CtxKind =
    | { kind: 'empty';    timeMs: number }
    | { kind: 'kf';       trackTarget: string; kfId: string }
    | { kind: 'segment';  trackTarget: string; timeMs: number }
  const [ctxData, setCtxData] = useState<CtxKind | null>(null)

  // ── Inline value-edit (kf double-click) ──────────────────────────────────
  // Renders a small <input> floating over the keyframe node. Commit on
  // Enter / blur, cancel on Escape. Coordinates are SVG-local px so it
  // stays glued to the kf even when the viewport pans.
  const [editingKf, setEditingKf] = useState<{
    trackTarget: string; kfId: string; xPx: number; yPx: number; draft: string
  } | null>(null)
  // TODO(big-feature): Speed Graph mode — derivative of value-over-time.
  //   Add a `graphType: 'value' | 'speed'` state and a curve-sampling fork
  //   that returns dy/dt instead of y. Renderer reuses the same SVG path
  //   pipeline (just different sampler).
  // TODO(big-feature): Normalize mode — per-track Y rescale to [0,1] so
  //   curves with very different ranges (opacity 0–1 vs. x 0–1000) become
  //   visually comparable. State flag + per-track range override in viewport.

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // F = fit selected · A = fit all · H = toggle handles. Only fire while the
  // mouse is over our container so we don't steal input from text fields in
  // other panels. Inputs internal to the curve editor (inline edit) are
  // exempt via `e.target.tagName === 'INPUT'`.
  const [isHovered, setIsHovered] = useState(false)
  useEffect(() => {
    if (!isHovered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tgt = e.target as HTMLElement | null
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); fitToSelection() }
      else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault(); setViewStartMs(0); setViewEndMs(duration)
      }
      else if (e.key === 'h' || e.key === 'H') { e.preventDefault(); setShowHandles((v) => !v) }
      else if (e.key === 'i' || e.key === 'I') {
        // Toggle isolation: hovered track → solo it; else if anything is
        // isolated → clear; else no-op (no hover target).
        e.preventDefault()
        if (hoveredTrack) setIsolatedTrack((cur) => cur === hoveredTrack ? null : hoveredTrack)
        else if (isolatedTrack) setIsolatedTrack(null)
      }
      else if (e.key === 'Escape' && isolatedTrack) {
        e.preventDefault(); setIsolatedTrack(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // fitToSelection captured below where it's defined; close over deps via
    // the latest-ref pattern is unnecessary here because state changes
    // re-create the listener.
  }, [isHovered, duration, hoveredTrack, isolatedTrack]) // fitToSelection is stable enough; small cycle is OK

  // ── Fit-to-selection — zooms the X axis to the selected keyframes' range ─
  const fitToSelection = useCallback(() => {
    if (selectedKfIds.size === 0) return
    let lo = Infinity, hi = -Infinity
    for (const t of tracks) for (const k of t.keyframes) {
      if (!selectedKfIds.has(k.id)) continue
      if (k.timeMs < lo) lo = k.timeMs
      if (k.timeMs > hi) hi = k.timeMs
    }
    if (lo === Infinity) return
    if (lo === hi) { lo -= 100; hi += 100 }      // single-kf: pad ±100ms
    const pad = (hi - lo) * 0.1
    setViewStartMs(Math.max(0, lo - pad))
    setViewEndMs(hi + pad)
  }, [tracks, selectedKfIds])

  // ── Select all visible keyframes ──────────────────────────────────────────
  const selectAllKfs = useCallback(() => {
    const next = new Set<string>()
    for (const t of visibleTracks) for (const k of t.keyframes) next.add(k.id)
    onSelectKeyframes(next)
  }, [visibleTracks, onSelectKeyframes])

  // ── Bulk easing — applies to all selected kfs across all tracks ───────────
  const applyEasingToSelected = useCallback((type: EasingType) => {
    if (!selectedTimelineId || selectedKfIds.size === 0) return
    const tl = scene.timelines.find((t) => t.id === selectedTimelineId)
    if (!tl) return
    interface KfRef { target: string; kfId: string; fromEasing: EasingType }
    const refs: KfRef[] = []
    for (const tr of tl.tracks) {
      for (const k of tr.keyframes) {
        if (selectedKfIds.has(k.id)) {
          refs.push({ target: tr.target, kfId: k.id, fromEasing: (k.easing?.type ?? 'easeOut') as EasingType })
        }
      }
    }
    if (refs.length === 0) return
    const toEasing = type === 'customBezier'
      ? { type: 'customBezier' as const, bezier: DEFAULT_BEZIER }
      : { type }
    editor.dispatchCommand({
      label: `Set Easing: ${type} (${refs.length})`,
      execute: (s) => refs.reduce((sc, r) => updateKfEasing(sc, selectedTimelineId, r.target, r.kfId, toEasing as { type: EasingType }), s),
      undo:    (s) => refs.reduce((sc, r) => updateKfEasing(sc, selectedTimelineId, r.target, r.kfId, { type: r.fromEasing }), s),
    })
  }, [scene.timelines, selectedTimelineId, selectedKfIds, editor])

  // ── Bulk tangent mode — applies to all selected kfs across all tracks ────
  const applyTangentToSelected = useCallback((mode: TangentMode) => {
    if (!selectedTimelineId || selectedKfIds.size === 0) return
    const tl = scene.timelines.find((t) => t.id === selectedTimelineId)
    if (!tl) return
    interface KfRef { target: string; kfId: string; fromMode: TangentMode | undefined }
    const refs: KfRef[] = []
    for (const tr of tl.tracks) {
      for (const k of tr.keyframes) {
        if (selectedKfIds.has(k.id)) {
          refs.push({ target: tr.target, kfId: k.id, fromMode: k.tangentMode as TangentMode | undefined })
        }
      }
    }
    if (refs.length === 0) return
    editor.dispatchCommand({
      label: `Set Tangent: ${mode} (${refs.length})`,
      execute: (s) => refs.reduce((sc, r) =>
        mapKfInScene(sc, selectedTimelineId, r.target, r.kfId, (k) => ({ ...k, tangentMode: mode })), s),
      undo:    (s) => refs.reduce((sc, r) =>
        mapKfInScene(sc, selectedTimelineId, r.target, r.kfId, (k) => ({ ...k, tangentMode: r.fromMode })), s),
    })
  }, [scene.timelines, selectedTimelineId, selectedKfIds, editor])

  // ── Bulk delete selected kfs ──────────────────────────────────────────────
  const deleteSelectedKfs = useCallback(() => {
    if (!selectedTimelineId || selectedKfIds.size === 0) return
    const tl = scene.timelines.find((t) => t.id === selectedTimelineId)
    if (!tl) return
    interface KfSnap { target: string; kf: Keyframe }
    const snaps: KfSnap[] = []
    for (const tr of tl.tracks) {
      for (const k of tr.keyframes) {
        if (selectedKfIds.has(k.id)) snaps.push({ target: tr.target, kf: k })
      }
    }
    if (snaps.length === 0) return
    editor.dispatchCommand({
      label: `Delete ${snaps.length} Keyframe${snaps.length !== 1 ? 's' : ''}`,
      execute: (s) => snaps.reduce((sc, { target, kf }) => {
        const tl2 = sc.timelines.find((t) => t.id === selectedTimelineId)
        if (!tl2) return sc
        return {
          ...sc,
          timelines: sc.timelines.map((t) => t.id !== selectedTimelineId ? t :
            { ...t, tracks: t.tracks.map((tr) => tr.target !== target ? tr :
              { ...tr, keyframes: tr.keyframes.filter((k) => k.id !== kf.id) }) })
        }
      }, s),
      undo: (s) => snaps.reduce((sc, { target, kf }) => ({
        ...sc,
        timelines: sc.timelines.map((t) => t.id !== selectedTimelineId ? t :
          { ...t, tracks: t.tracks.map((tr) => tr.target !== target ? tr :
            { ...tr, keyframes: [...tr.keyframes, kf].sort((a, b) => a.timeMs - b.timeMs) }) })
      }), s),
    })
    onSelectKeyframes(new Set())
  }, [scene.timelines, selectedTimelineId, selectedKfIds, editor, onSelectKeyframes])

  // ── Add-keyframe helper — used by segment-dblclick and context menu ──────
  // Evaluates the track at `ms` so the inserted keyframe sits ON the curve
  // (no visual jump in the interpolated value). New keyframe inherits the
  // previous keyframe's easing so the segment shape continues naturally.
  const addKeyframeAt = useCallback((trackTarget: string, ms: number) => {
    if (!selectedTimelineId) return
    const tl = scene.timelines.find((t) => t.id === selectedTimelineId)
    const tr = tl?.tracks.find((t) => t.target === trackTarget)
    if (!tr) return
    const value = evaluateTrack(tr, ms)
    if (value == null) return
    // Find the previous kf to inherit its easing type so the curve doesn't
    // visually kink at the inserted point.
    const sorted = [...tr.keyframes].sort((a, b) => a.timeMs - b.timeMs)
    const prev = [...sorted].reverse().find((k) => k.timeMs <= ms)
    const easing = prev?.easing ?? { type: 'easeOut' as const }
    editor.dispatchCommand(makeAddKfCmd(selectedTimelineId, trackTarget, {
      id: nextKfId(), timeMs: Math.round(ms), value, easing,
    }))
  }, [scene.timelines, selectedTimelineId, editor])

  // ── Drag controller ───────────────────────────────────────────────────────
  const drag = useCurveDrag({
    scene, editor, viewport,
    timelineId: selectedTimelineId, clientToLocal,
  })

  // ── Bezier-handle drag — for customBezier easing on a segment ────────────
  //
  // Each customBezier kf carries `easing.bezier = {cx1, cy1, cx2, cy2}` in
  // normalized [0,1] easing-space. We render P1 (orange) and P2 (cyan)
  // visually positioned on the segment between kf[i] and kf[i+1], anchored
  // to those kfs. Dragging maps the pointer back into normalized space
  // and dispatches makeUpdateEasingCmd through the transaction system so
  // we get a single undo step per drag.
  interface BezierDragRef {
    kfA:        Keyframe           // segment start (the one whose easing we edit)
    kfB:        Keyframe           // segment end (for axis remapping)
    trackTarget: string
    handle:     'p1' | 'p2'
    originalBezier: { cx1: number; cy1: number; cx2: number; cy2: number }
  }
  const bezierDragRef = useRef<BezierDragRef | null>(null)

  const beginBezierDrag = (
    e: React.PointerEvent<SVGElement>,
    kfA: Keyframe, kfB: Keyframe, trackTarget: string, handle: 'p1' | 'p2',
  ) => {
    if (!selectedTimelineId) return
    if (kfA.easing?.type !== 'customBezier') return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    bezierDragRef.current = {
      kfA, kfB, trackTarget, handle,
      originalBezier: { ...(kfA.easing.bezier ?? DEFAULT_BEZIER) },
    }
    editor.beginTransaction()
  }

  const moveBezierDrag = useCallback((e: PointerEvent) => {
    const d = bezierDragRef.current
    if (!d) return
    const { x, y } = clientToLocal(e.clientX, e.clientY)
    // Convert SVG-local px → time/value coords
    const ms  = viewStartMs + (x / plotW) * Math.max(1, viewEndMs - viewStartMs)
    const span = Math.max(0.0001, range.max - range.min)
    const norm = (plotH - y) / plotH
    const val  = range.min + norm * span
    // Remap to normalized [0,1] easing space anchored at the segment.
    const dt = d.kfB.timeMs - d.kfA.timeMs || 1
    const dv = (d.kfB.value as number) - (d.kfA.value as number) || 1
    // X must stay in [0,1] so easing remains monotone in time; Y may
    // overshoot for bounce/back-style curves.
    const cxRaw = (ms  - d.kfA.timeMs) / dt
    const cyRaw = (val - (d.kfA.value as number)) / dv
    let cx = Math.max(0, Math.min(1, cxRaw))
    let cy = Math.max(-0.5, Math.min(1.5, cyRaw))

    // ── Weighted-tangent axis lock (BL-40) ─────────────────────────────
    // Shift → adjust WEIGHT (handle length along its original direction).
    // Alt   → adjust ANGLE  (preserve original length, rotate handle).
    // No modifier → free 2D drag (default — both weight and angle change).
    //
    // For P1 the handle vector is from (0,0); for P2 it's from (1,1).
    // Project / scale the new (cx, cy) in that handle's local frame.
    if (e.shiftKey || e.altKey) {
      const origP = d.handle === 'p1'
        ? { ox: 0, oy: 0, vx: d.originalBezier.cx1,     vy: d.originalBezier.cy1 }
        : { ox: 1, oy: 1, vx: d.originalBezier.cx2 - 1, vy: d.originalBezier.cy2 - 1 }
      const newVx = cx - origP.ox
      const newVy = cy - origP.oy
      const origLen2 = origP.vx * origP.vx + origP.vy * origP.vy
      if (origLen2 > 1e-6) {
        if (e.shiftKey) {
          // Project (newV) onto origV — weight = magnitude along original dir
          const scale = (newVx * origP.vx + newVy * origP.vy) / origLen2
          cx = origP.ox + scale * origP.vx
          cy = origP.oy + scale * origP.vy
          cx = Math.max(0, Math.min(1, cx))
        } else {
          // Alt: preserve original length, just rotate to new direction
          const newLen = Math.hypot(newVx, newVy)
          if (newLen > 1e-6) {
            const origLen = Math.sqrt(origLen2)
            cx = origP.ox + (newVx / newLen) * origLen
            cy = origP.oy + (newVy / newLen) * origLen
            cx = Math.max(0, Math.min(1, cx))
          }
        }
      }
    }

    // ── Tangent-mode-aware mutation ───────────────────────────────────
    // 'broken' (default) → only the dragged handle moves.
    // 'aligned'          → the OTHER handle mirrors across the keyframe so
    //                      the two tangent lines stay collinear (smooth curve).
    //                      P1 sits in [0,1]×any near kfA; "mirror across kfA"
    //                      means reflect (cx, cy) through (0,0) but constrained
    //                      to live near kfB. The simple, well-behaved choice is
    //                      reflection through the segment midpoint (0.5, 0.5):
    //                          mirrored = (1 - cx, 1 - cy).
    //                      That keeps both handles inside the segment box and
    //                      gives a visually symmetric S-curve out of the box.
    const mode = (d.kfA.tangentMode ?? 'broken') as 'broken' | 'aligned' | 'auto' | 'linear'
    let nextBezier = d.handle === 'p1'
      ? { ...d.originalBezier, cx1: cx, cy1: cy }
      : { ...d.originalBezier, cx2: cx, cy2: cy }
    if (mode === 'aligned') {
      if (d.handle === 'p1') {
        nextBezier = { ...nextBezier, cx2: 1 - cx, cy2: 1 - cy }
      } else {
        nextBezier = { ...nextBezier, cx1: 1 - cx, cy1: 1 - cy }
      }
    }
    // TODO(big-feature): 'auto' mode — solve handles from neighbouring kf
    //   tangent (Catmull-Rom or Bessel). Until that lands, treat as 'broken'.

    // Apply to live scene via previewTransaction so the curve re-samples.
    const nextScene: ChronoScene = {
      ...scene,
      timelines: scene.timelines.map((tl) => tl.id !== selectedTimelineId ? tl :
        { ...tl, tracks: tl.tracks.map((t) => t.target !== d.trackTarget ? t :
          { ...t, keyframes: t.keyframes.map((k) => k.id !== d.kfA.id ? k :
            { ...k, easing: { type: 'customBezier', bezier: nextBezier } }) }) }),
    }
    editor.previewTransaction(nextScene)
  }, [scene, editor, selectedTimelineId, viewStartMs, viewEndMs, plotW, plotH, range, clientToLocal])

  const endBezierDrag = useCallback(() => {
    const d = bezierDragRef.current
    if (!d) return
    bezierDragRef.current = null
    // Pull final bezier from the live (preview) scene so we commit the
    // ACTUAL last position, not the cached snapshot.
    const liveTl = editor.scene.timelines.find((tl) => tl.id === selectedTimelineId)
    const liveTk = liveTl?.tracks.find((t) => t.target === d.trackTarget)
    const liveKf = liveTk?.keyframes.find((k) => k.id === d.kfA.id)
    const finalEasing = liveKf?.easing ?? { type: 'customBezier' as const, bezier: d.originalBezier }
    const fromEasing  = { type: 'customBezier' as const, bezier: d.originalBezier }
    editor.commitTransaction(makeUpdateEasingCmd(
      selectedTimelineId!, d.trackTarget, d.kfA.id, fromEasing, finalEasing,
    ))
  }, [editor, selectedTimelineId])

  useEffect(() => {
    // Single global handlers — listening only while a handle drag is in flight.
    if (!bezierDragRef.current) return
    const onMove = (e: PointerEvent) => moveBezierDrag(e)
    const onUp   = ()              => endBezierDrag()
    const onKey  = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        bezierDragRef.current = null
        editor.cancelTransaction()
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    window.addEventListener('keydown',     onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
      window.removeEventListener('keydown',     onKey)
    }
    // Re-arm after every render — the ref is the source of truth.
  })

  // Global pointermove / pointerup once a drag is active. Single effect
  // (rather than per-node listeners) avoids handler-ordering races during
  // multi-track interaction.
  useEffect(() => {
    if (!drag.isDragging) return
    const onMove = (e: PointerEvent) => drag.move(e)
    const onUp   = ()              => drag.end()
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') drag.cancel() }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    window.addEventListener('keydown',     onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
      window.removeEventListener('keydown',     onKey)
    }
  }, [drag])

  // ── Plot drag — three modes selected by modifier at pointerdown ──────────
  //
  //   plain LMB drag   → SCRUB     · live-updates the playhead (time)
  //   Ctrl + LMB drag  → PAN       · slides the visible time window L/R
  //   Shift + LMB drag → ZOOM      · horizontal motion → zoom in/out
  //                                  anchored at the drag-start time
  //
  // Modifier state is locked at pointerdown — Ctrl pressed mid-drag won't
  // promote a scrub into a pan, matching every other professional editor.
  // Esc cancels (pan/zoom revert; scrub leaves the playhead at the last
  // committed position because each move already wrote the value).
  type PlotDragMode = 'scrub' | 'pan' | 'zoom' | 'lasso'
  interface PlotDragRef {
    mode:       PlotDragMode
    startX:     number          // SVG-local px
    startY:     number          // SVG-local px
    startMs:    number          // time at the drag-start position
    /** Snapshot of the viewport at drag start — undo target for pan/zoom. */
    snapStart:  number
    snapEnd:    number
  }
  const plotDragRef = useRef<PlotDragRef | null>(null)
  // Lasso rectangle in SVG-local px (visible while mode === 'lasso')
  const [lassoRect, setLassoRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  const xToTime = useCallback((x: number) =>
    viewStartMs + (x / plotW) * Math.max(1, viewEndMs - viewStartMs),
  [viewStartMs, viewEndMs, plotW])

  const onPlotPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.button !== 0 || drag.isDragging) return
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const { x, y } = clientToLocal(e.clientX, e.clientY)
    // Modifier-driven mode selection. Alt for lasso (rectangle-select kfs)
    // keeps the default unmodified drag as scrub per user preference.
    const mode: PlotDragMode =
      e.altKey                ? 'lasso' :
      e.ctrlKey || e.metaKey  ? 'pan'   :
      e.shiftKey              ? 'zoom'  :
                                'scrub'
    plotDragRef.current = {
      mode,
      startX:    x,
      startY:    y,
      startMs:   xToTime(x),
      snapStart: viewStartMs,
      snapEnd:   viewEndMs,
    }
    // Scrub fires immediately so a single click still seeks (no drag required).
    if (mode === 'scrub') {
      onTimeChange(Math.max(0, Math.min(duration, xToTime(x))))
      // Click on empty plot drops any segment highlight.
      setSelectedSegment(null)
    }
    if (mode === 'lasso') {
      setLassoRect({ x1: x, y1: y, x2: x, y2: y })
    }
  }

  const onPlotPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const d = plotDragRef.current
    if (!d) return
    const { x } = clientToLocal(e.clientX, e.clientY)
    if (d.mode === 'scrub') {
      onTimeChange(Math.max(0, Math.min(duration, xToTime(x))))
      return
    }
    if (d.mode === 'pan') {
      // Convert pixel delta back into ms in the ORIGINAL viewport space so
      // the cursor stays glued to the moment under it — no drift.
      const origSpan = d.snapEnd - d.snapStart
      const dMs = ((x - d.startX) / plotW) * origSpan
      const clamped = clampWindow(d.snapStart - dMs, d.snapEnd - dMs, duration)
      setViewStartMs(clamped.s); setViewEndMs(clamped.e)
      return
    }
    if (d.mode === 'zoom') {
      // Horizontal drag right = zoom IN; left = zoom OUT.
      // Mapping a pixel delta to a multiplicative factor keeps the rate
      // responsive whether you're zoomed way out or in tight.
      const dx = x - d.startX
      const factor = Math.exp(-dx / 180)              // ±180px → ~e× change
      const newSpan = Math.max(50, (d.snapEnd - d.snapStart) * factor)
      // Anchor the zoom at the drag-start time so the cursor's reference
      // point doesn't slide away mid-drag.
      const ratio = (d.startMs - d.snapStart) / (d.snapEnd - d.snapStart || 1)
      const s = d.startMs - ratio * newSpan
      const ev = s + newSpan
      const clamped = clampWindow(s, ev, duration)
      setViewStartMs(clamped.s); setViewEndMs(clamped.e)
      return
    }
    if (d.mode === 'lasso') {
      // Just update the rectangle — selection is committed on pointerup so
      // we don't spam re-selection on every pixel.
      const { y: pY } = clientToLocal(e.clientX, e.clientY)
      setLassoRect({ x1: d.startX, y1: d.startY, x2: x, y2: pY })
    }
  }

  const onPlotPointerUp = (e: React.PointerEvent<SVGRectElement>) => {
    const d = plotDragRef.current
    if (d?.mode === 'lasso' && lassoRect) {
      // Commit selection — collect every kf whose screen position lies
      // inside the lasso rectangle. Hit-test uses the same coord pipeline
      // used to render the kfs, so what you see is what you select.
      const lo = { x: Math.min(lassoRect.x1, lassoRect.x2), y: Math.min(lassoRect.y1, lassoRect.y2) }
      const hi = { x: Math.max(lassoRect.x1, lassoRect.x2), y: Math.max(lassoRect.y1, lassoRect.y2) }
      const next = new Set<string>(e.shiftKey ? selectedKfIds : [])
      for (const t of visibleTracks) {
        const tvp = getTrackViewport(t.target)
        for (const k of t.keyframes) {
          if (typeof k.value !== 'number') continue
          const kx = msToX(tvp, k.timeMs)
          const ky = valueToY(tvp, k.value)
          if (kx >= lo.x && kx <= hi.x && ky >= lo.y && ky <= hi.y) next.add(k.id)
        }
      }
      onSelectKeyframes(next)
    }
    plotDragRef.current = null
    setLassoRect(null)
  }

  // ── Wheel — still useful for quick zoom around cursor (no modifier),
  //          or pan with Shift (vertical wheel mapped to horizontal pan). ──
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (e.shiftKey) {
      const span = viewEndMs - viewStartMs
      const dx   = (e.deltaY / plotW) * span
      const clamped = clampWindow(viewStartMs + dx, viewEndMs + dx, duration)
      setViewStartMs(clamped.s); setViewEndMs(clamped.e)
    } else {
      const { x } = clientToLocal(e.clientX, e.clientY)
      const cursorMs = viewStartMs + (x / plotW) * (viewEndMs - viewStartMs)
      const factor   = e.deltaY > 0 ? 1.15 : 0.85
      const newSpan  = Math.max(50, (viewEndMs - viewStartMs) * factor)
      const ratio    = (cursorMs - viewStartMs) / (viewEndMs - viewStartMs || 1)
      const s = cursorMs - ratio * newSpan
      const ev = s + newSpan
      const clamped = clampWindow(s, ev, duration)
      setViewStartMs(clamped.s); setViewEndMs(clamped.e)
    }
  }

  // ── Ticks ─────────────────────────────────────────────────────────────────
  const timeTick  = pickTimeTickMs(viewEndMs - viewStartMs)
  const valueTick = pickValueTick(range)
  const timeTicks  = niceTickArray(viewStartMs, viewEndMs, timeTick)
  const valueTicks = niceTickArray(range.min,  range.max,  valueTick)

  // ── Empty states ──────────────────────────────────────────────────────────
  if (!layer) return (
    <Empty msg="Select a layer to inspect its animation curves." />
  )
  if (!timeline) return (
    <Empty msg="No timeline selected." />
  )
  if (tracks.length === 0) return (
    <Empty msg={`"${layer.name}" has no animated numeric properties yet.`} />
  )

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerCb}
      className="flex flex-col h-full bg-gray-950 relative overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      // `tabIndex` so the container can receive focus for screen readers,
      // even though we use window-level keyboard listeners gated on hover.
      tabIndex={0}
    >

      {/* Top bar — two rows:
          Row 1: chart-wide toggles + curve legend
          Row 2: (only when kfs selected) bulk easing / tangent / delete */}
      <div className="flex flex-col border-b border-gray-800 bg-gray-900/70 shrink-0">

        {/* ── Row 1: toolbar + curve legend ──────────────────────────── */}
        <div className="flex items-center gap-1 px-2 py-1 flex-wrap">
          <ToolbarBtn
            title="Fit all curves to view (A)"
            onClick={() => { setViewStartMs(0); setViewEndMs(duration) }}
          >Fit</ToolbarBtn>
          <ToolbarBtn
            title="Fit selected keyframes to view (F)"
            onClick={() => fitToSelection()}
            disabled={selectedKfIds.size === 0}
          >Fit Sel</ToolbarBtn>
          <ToolbarBtn
            title={showHandles ? 'Hide bezier handles (H)' : 'Show bezier handles (H)'}
            onClick={() => setShowHandles((v) => !v)}
            active={showHandles}
          >Handles</ToolbarBtn>
          <ToolbarBtn
            title="Normalize: rescale each curve to its own min/max so all curves fill the same height"
            onClick={() => setNormalizeMode((v) => !v)}
            active={normalizeMode}
          >Norm</ToolbarBtn>
          <ToolbarBtn
            title="Select all visible keyframes"
            onClick={selectAllKfs}
            disabled={visibleTracks.length === 0}
          >All</ToolbarBtn>

          <span className="w-px h-4 bg-gray-700 mx-1.5 shrink-0" />

          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mr-1 shrink-0">
            Curves
          </span>
          {tracks.map((t, i) => {
            const color = pickTrackColor(t.target, i)
            const isHidden = hidden.has(t.target)
            const isIso    = isolatedTrack === t.target
            const label = t.target.replace(`layers.${layer.id}.`, '')
            // BL-45: OOR badge — shown only if before/after has any non-constant mode
            const oor = t.outOfRange
            const oorBefore = oor?.before ?? 'constant'
            const oorAfter  = oor?.after  ?? 'constant'
            const hasOor = oorBefore !== 'constant' || oorAfter !== 'constant'
            return (
              <button
                key={t.target}
                onClick={(e) => {
                  // Shift+click → toggle isolation (BL-40); plain click → hide/show.
                  if (e.shiftKey) {
                    setIsolatedTrack((cur) => cur === t.target ? null : t.target)
                    return
                  }
                  setHidden((prev) => {
                    const next = new Set(prev)
                    if (next.has(t.target)) next.delete(t.target)
                    else                    next.add(t.target)
                    return next
                  })
                }}
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-opacity ${
                  isHidden ? 'opacity-30 hover:opacity-60' : 'opacity-100'
                } ${isIso ? 'ring-1 ring-blue-400 bg-blue-950/40' : 'hover:bg-gray-800'}`}
                title={`${isHidden ? 'Show' : 'Hide'} curve · Shift+click to ${isIso ? 'exit isolate' : 'isolate'} (I)${
                  hasOor ? ` · Out of Range: ${oorBefore} ◀ ▶ ${oorAfter}` : ''
                }`}
              >
                <span style={{ color }}>■</span>
                <span className="ml-1 text-gray-300">{label}</span>
                {isIso && <span className="ml-1 text-blue-400 text-[8px]">SOLO</span>}
                {hasOor && (
                  <span
                    className="ml-1 text-purple-400 text-[8px] px-1 rounded bg-purple-950/40 border border-purple-800/40"
                    title={`Out of Range — Before: ${oorBefore}, After: ${oorAfter}`}
                  >
                    {oorBefore !== 'constant' ? oorBefore[0].toUpperCase() : '·'}
                    {'◀▶'}
                    {oorAfter !== 'constant' ? oorAfter[0].toUpperCase() : '·'}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Row 2: bulk easing/tangent/delete (only when kfs selected) ─ */}
        {selectedKfIds.size > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-900/90 border-t border-gray-800/60 flex-wrap">
            <span className="text-[9px] uppercase tracking-wider text-gray-600 font-semibold pr-1 shrink-0">
              Easing
            </span>
            {([
              { type: 'linear'      as EasingType, label: 'Lin',        title: 'Linear'          },
              { type: 'easeIn'      as EasingType, label: 'In',         title: 'Ease In'         },
              { type: 'easeOut'     as EasingType, label: 'Out',        title: 'Ease Out'        },
              { type: 'easeInOut'   as EasingType, label: 'In/Out',     title: 'Ease In-Out'     },
              { type: 'hold'        as EasingType, label: 'Hold',       title: 'Hold (step)'     },
              { type: 'customBezier'as EasingType, label: 'Bezier',     title: 'Custom Bezier'   },
            ] as const).map(({ type, label, title }) => (
              <button
                key={type}
                onClick={() => applyEasingToSelected(type)}
                title={`Set easing to ${title} for selected keyframes`}
                className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-gray-800 hover:bg-blue-900
                           text-gray-400 hover:text-blue-200 border border-gray-700 transition-colors"
              >{label}</button>
            ))}

            <span className="w-px h-3 bg-gray-700 mx-1 shrink-0" />

            <span className="text-[9px] uppercase tracking-wider text-gray-600 font-semibold pr-1 shrink-0">
              Tangent
            </span>
            {([
              { mode: 'broken'  as TangentMode, label: 'Broken',  title: 'Broken — each handle moves independently' },
              { mode: 'aligned' as TangentMode, label: 'Aligned', title: 'Aligned — handles stay collinear (smooth)' },
              { mode: 'auto'    as TangentMode, label: 'Auto',    title: 'Auto — Catmull-Rom smooth tangent'        },
              { mode: 'linear'  as TangentMode, label: 'Linear',  title: 'Linear — flat tangent (no overshoot)'     },
            ] as const).map(({ mode, label, title }) => (
              <button
                key={mode}
                onClick={() => applyTangentToSelected(mode)}
                title={title}
                className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-gray-800 hover:bg-purple-900
                           text-gray-400 hover:text-purple-200 border border-gray-700 transition-colors"
              >{label}</button>
            ))}

            <span className="w-px h-3 bg-gray-700 mx-1 shrink-0" />

            <button
              onClick={deleteSelectedKfs}
              title={`Delete ${selectedKfIds.size} selected keyframe${selectedKfIds.size !== 1 ? 's' : ''}`}
              className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-gray-800 hover:bg-red-900
                         text-gray-500 hover:text-red-300 border border-gray-700 transition-colors"
            >
              Delete ({selectedKfIds.size})
            </button>

            <span className="ml-auto text-[9px] font-mono text-gray-600 shrink-0">
              {selectedKfIds.size} selected
            </span>
          </div>
        )}
      </div>

      <svg
        ref={svgRef}
        width={size.w} height={size.h}
        className="block flex-1 cursor-crosshair select-none"
        onWheel={onWheel}
      >
        {/* ── Left gutter: Y-axis value labels ─────────────────────────── */}
        {valueTicks.map((v, i) => {
          const y = TOP_GUTTER + valueToY(viewport, v)
          return (
            <g key={`vt-${i}`}>
              <line x1={LEFT_GUTTER - 4} x2={LEFT_GUTTER} y1={y} y2={y} stroke="#4b5563" />
              <text x={LEFT_GUTTER - 6} y={y + 3} textAnchor="end"
                fontSize="9" fill="#9ca3af" fontFamily="monospace">
                {formatTickValue(v)}
              </text>
              <line
                x1={LEFT_GUTTER} x2={LEFT_GUTTER + plotW}
                y1={y} y2={y}
                stroke="#1f2937" strokeDasharray="2 4"
              />
            </g>
          )
        })}

        {/* ── Top gutter: X-axis time labels ───────────────────────────── */}
        {timeTicks.map((tMs, i) => {
          const x = LEFT_GUTTER + msToX(viewport, tMs)
          return (
            <g key={`tt-${i}`}>
              <line x1={x} x2={x} y1={TOP_GUTTER - 4} y2={TOP_GUTTER} stroke="#4b5563" />
              <text x={x} y={TOP_GUTTER - 6} textAnchor="middle"
                fontSize="9" fill="#9ca3af" fontFamily="monospace">
                {formatTimeMs(tMs)}
              </text>
              <line
                x1={x} x2={x}
                y1={TOP_GUTTER} y2={TOP_GUTTER + plotH}
                stroke="#1f2937" strokeDasharray="2 4"
              />
            </g>
          )
        })}

        {/* ── Plot background hit-target — scrub / pan / zoom by modifier ── */}
        <rect
          x={LEFT_GUTTER} y={TOP_GUTTER}
          width={plotW} height={plotH}
          fill="transparent"
          style={{
            cursor:
              plotDragRef.current?.mode === 'pan'  ? 'grabbing' :
              plotDragRef.current?.mode === 'zoom' ? 'ew-resize' :
                                                    'crosshair',
          }}
          onPointerDown={onPlotPointerDown}
          onPointerMove={onPlotPointerMove}
          onPointerUp={onPlotPointerUp}
          onPointerCancel={onPlotPointerUp}
          onContextMenu={(e) => {
            e.preventDefault()
            const { x } = clientToLocal(e.clientX, e.clientY)
            const ms = viewStartMs + (x / plotW) * Math.max(1, viewEndMs - viewStartMs)
            setCtxData({ kind: 'empty', timeMs: Math.max(0, Math.min(duration, ms)) })
            ctxMenu.open(e)
          }}
        />

        {/* ── Zero-line (where value = 0) — bold so origin is obvious ── */}
        {range.min < 0 && range.max > 0 && (
          <line
            x1={LEFT_GUTTER} x2={LEFT_GUTTER + plotW}
            y1={TOP_GUTTER + valueToY(viewport, 0)}
            y2={TOP_GUTTER + valueToY(viewport, 0)}
            stroke="#374151" strokeWidth={1}
          />
        )}

        {/* ── Curves ───────────────────────────────────────────────────── */}
        {/* Each track renders TWO paths:
              1. A wide invisible hit-target (8px stroke) for double-click /
                 right-click — SVG strokes are pointer-event sensitive only
                 along their drawn width, so a 1.5px curve is a frustrating
                 target. The hit path widens this without changing visuals.
              2. The visible coloured curve.                                */}
        <g transform={`translate(${LEFT_GUTTER} ${TOP_GUTTER})`}>
          {visibleTracks.map((t, i) => {
            const color = pickTrackColor(t.target, i)
            const tvp = getTrackViewport(t.target)
            const d = buildCurvePath(t, tvp)
            const handleDblClick = (e: React.MouseEvent) => {
              const { x } = clientToLocal(e.clientX, e.clientY)
              const ms = viewStartMs + (x / plotW) * Math.max(1, viewEndMs - viewStartMs)
              addKeyframeAt(t.target, Math.max(0, Math.min(duration, ms)))
            }
            const isHovered  = hoveredTrack === t.target
            const isIsolated = isolatedTrack === t.target
            // When something is isolated, non-isolated tracks are dimmed
            // ghosts (still visible for shape reference, not interactive).
            const isDimmed = isolatedTrack != null && !isIsolated
            // Find which segment the pointer is over (used by click + ctx)
            const sortedKfs = [...t.keyframes].sort((a, b) => a.timeMs - b.timeMs)
            const findSegmentAt = (ms: number) => {
              for (let i = 0; i < sortedKfs.length - 1; i++) {
                if (ms >= sortedKfs[i].timeMs && ms <= sortedKfs[i + 1].timeMs) {
                  return { kfA: sortedKfs[i], kfB: sortedKfs[i + 1] }
                }
              }
              return null
            }
            // Highlighted segment path for THIS track, if selected.
            let selSegD = ''
            if (selectedSegment?.trackTarget === t.target) {
              const a = sortedKfs.find((k) => k.id === selectedSegment.kfAId)
              const b = sortedKfs.find((k) => k.id === selectedSegment.kfBId)
              if (a && b) {
                selSegD = buildCurvePath(
                  { ...t, keyframes: [a, b] },
                  { ...tvp, startMs: a.timeMs, endMs: b.timeMs,
                    widthPx: msToX(tvp, b.timeMs) - msToX(tvp, a.timeMs) },
                )
              }
            }
            return (
              <g key={t.target}>
                <path
                  d={d}
                  fill="none" stroke="transparent"
                  strokeWidth={10}
                  style={{ cursor: 'pointer' }}
                  pointerEvents={isDimmed ? 'none' : undefined}
                  onMouseEnter={() => setHoveredTrack(t.target)}
                  onMouseLeave={() => setHoveredTrack((cur) => cur === t.target ? null : cur)}
                  onClick={(e) => {
                    e.stopPropagation()
                    const { x } = clientToLocal(e.clientX, e.clientY)
                    const ms = viewStartMs + (x / plotW) * Math.max(1, viewEndMs - viewStartMs)
                    const seg = findSegmentAt(ms)
                    if (!seg) return
                    setSelectedSegment({ trackTarget: t.target, kfAId: seg.kfA.id, kfBId: seg.kfB.id })
                    const next = new Set(e.shiftKey ? selectedKfIds : [])
                    next.add(seg.kfA.id); next.add(seg.kfB.id)
                    onSelectKeyframes(next)
                  }}
                  onDoubleClick={handleDblClick}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const { x } = clientToLocal(e.clientX, e.clientY)
                    const ms = viewStartMs + (x / plotW) * Math.max(1, viewEndMs - viewStartMs)
                    setCtxData({ kind: 'segment', trackTarget: t.target, timeMs: Math.max(0, Math.min(duration, ms)) })
                    ctxMenu.open(e)
                  }}
                >
                  <title>Click to select segment · Double-click to add keyframe · Right-click for segment options</title>
                </path>
                {/* BL-45: split visible curve into in-range (solid) + out-of-range
                    (dashed) segments when the track has cycle/loop/pingPong/linear/
                    relativeRepeat set. Falls through to a single cached path
                    when out-of-range is constant/constant (the default). */}
                {(() => {
                  const strokeW = isIsolated ? 2.5 : isHovered ? 3 : 1.5
                  const baseOpacity = isDimmed ? 0.18 : isHovered ? 1 : 0.95
                  const filterStyle = isIsolated
                    ? { filter: `drop-shadow(0 0 4px ${color})` }
                    : isHovered
                      ? { filter: `drop-shadow(0 0 3px ${color})` }
                      : undefined

                  if (!hasNonConstantOutOfRange(t)) {
                    return (
                      <path
                        d={d}
                        fill="none" stroke={color}
                        strokeWidth={strokeW}
                        opacity={baseOpacity}
                        style={filterStyle}
                        pointerEvents="none"
                      />
                    )
                  }

                  const segs = buildCurvePathSegments(t, tvp)
                  const dashedOpacity = baseOpacity * 0.55
                  const dashArray = '5 4'
                  return (
                    <>
                      {segs.inRange && (
                        <path
                          d={segs.inRange} fill="none" stroke={color}
                          strokeWidth={strokeW} opacity={baseOpacity}
                          style={filterStyle} pointerEvents="none"
                        />
                      )}
                      {segs.before && (
                        <path
                          d={segs.before} fill="none" stroke={color}
                          strokeWidth={strokeW} strokeDasharray={dashArray}
                          opacity={dashedOpacity}
                          pointerEvents="none"
                        >
                          <title>Out-of-range (before): {t.outOfRange?.before ?? 'constant'}</title>
                        </path>
                      )}
                      {segs.after && (
                        <path
                          d={segs.after} fill="none" stroke={color}
                          strokeWidth={strokeW} strokeDasharray={dashArray}
                          opacity={dashedOpacity}
                          pointerEvents="none"
                        >
                          <title>Out-of-range (after): {t.outOfRange?.after ?? 'constant'}</title>
                        </path>
                      )}
                      {/* Range boundary tick marks — small vertical guides */}
                      {segs.rangeStartX !== null && (
                        <line
                          x1={segs.rangeStartX} y1={0}
                          x2={segs.rangeStartX} y2={plotH}
                          stroke={color} strokeOpacity={0.25}
                          strokeWidth={1} strokeDasharray="2 3"
                          pointerEvents="none"
                        />
                      )}
                      {segs.rangeEndX !== null && (
                        <line
                          x1={segs.rangeEndX} y1={0}
                          x2={segs.rangeEndX} y2={plotH}
                          stroke={color} strokeOpacity={0.25}
                          strokeWidth={1} strokeDasharray="2 3"
                          pointerEvents="none"
                        />
                      )}
                    </>
                  )
                })()}
                {selSegD && (
                  <g
                    transform={`translate(${msToX(tvp, sortedKfs.find((k) => k.id === selectedSegment!.kfAId)!.timeMs)} 0)`}
                    pointerEvents="none"
                  >
                    <path
                      d={selSegD}
                      fill="none" stroke="#fff"
                      strokeWidth={5} opacity={0.35}
                    />
                    <path
                      d={selSegD}
                      fill="none" stroke={color}
                      strokeWidth={3.5} opacity={1}
                      style={{ filter: `drop-shadow(0 0 4px ${color})` }}
                    />
                  </g>
                )}
              </g>
            )
          })}
        </g>

        {/* ── Bezier handles ─────────────────────────────────────────────
            For every segment where kf[i].easing.type === 'customBezier',
            draw P1 (orange) anchored at kf[i] and P2 (cyan) anchored at
            kf[i+1], with tangent lines back to the anchors. Dragging a
            handle remaps the pointer position into the segment's
            normalized [0,1] easing space and dispatches makeUpdateEasingCmd
            via the transaction system (single undo step per drag).
            Globally hidden when the toolbar "Show Handles" toggle is off. */}
        {showHandles && <g transform={`translate(${LEFT_GUTTER} ${TOP_GUTTER})`}>
          {visibleTracks.flatMap((t) => {
            const tvp = getTrackViewport(t.target)
            const sorted = [...t.keyframes].sort((a, b) => a.timeMs - b.timeMs)
            const out: React.ReactNode[] = []
            for (let i = 0; i < sorted.length - 1; i++) {
              const kfA = sorted[i]
              const kfB = sorted[i + 1]
              if (kfA.easing?.type !== 'customBezier') continue
              if (typeof kfA.value !== 'number' || typeof kfB.value !== 'number') continue
              const bez = kfA.easing.bezier ?? DEFAULT_BEZIER
              const ax = msToX(tvp, kfA.timeMs),  ay = valueToY(tvp, kfA.value)
              const bx = msToX(tvp, kfB.timeMs),  by = valueToY(tvp, kfB.value)
              // Map normalized (cx, cy) → segment-local pixel coords.
              const p1x = ax + bez.cx1 * (bx - ax)
              const p1y = ay + bez.cy1 * (by - ay)
              const p2x = ax + bez.cx2 * (bx - ax)
              const p2y = ay + bez.cy2 * (by - ay)
              // Weighted-tangent radius: handle vector magnitude in [0,1]²
              // easing space. The further the handle is from its anchor, the
              // more "weight" it has on the curve — so we draw it slightly
              // bigger. r ∈ [3, 7] px.
              const w1 = Math.hypot(bez.cx1,     bez.cy1)
              const w2 = Math.hypot(bez.cx2 - 1, bez.cy2 - 1)
              const r1 = 3 + Math.max(0, Math.min(1, w1 / Math.SQRT2)) * 4
              const r2 = 3 + Math.max(0, Math.min(1, w2 / Math.SQRT2)) * 4
              out.push(
                <g key={`bz-${t.target}-${kfA.id}`}>
                  {/* Tangent lines from anchor → handle */}
                  <line x1={ax} y1={ay} x2={p1x} y2={p1y} stroke="#f59e0b" strokeWidth={1} opacity={0.7} />
                  <line x1={bx} y1={by} x2={p2x} y2={p2y} stroke="#22d3ee" strokeWidth={1} opacity={0.7} />
                  {/* P1 (orange = outgoing tangent from kfA) */}
                  <circle
                    cx={p1x} cy={p1y} r={r1}
                    fill="#f59e0b" stroke="#1e1b4b" strokeWidth={1.5}
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => beginBezierDrag(e, kfA, kfB, t.target, 'p1')}
                  >
                    <title>Bezier P1 — drag to reshape · Shift = weight only · Alt = angle only</title>
                  </circle>
                  {/* P2 (cyan = incoming tangent into kfB) */}
                  <circle
                    cx={p2x} cy={p2y} r={r2}
                    fill="#22d3ee" stroke="#1e1b4b" strokeWidth={1.5}
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => beginBezierDrag(e, kfA, kfB, t.target, 'p2')}
                  >
                    <title>Bezier P2 — drag to reshape · Shift = weight only · Alt = angle only</title>
                  </circle>
                </g>
              )
            }
            return out
          })}
        </g>}

        {/* ── Keyframe nodes ───────────────────────────────────────────── */}
        <g transform={`translate(${LEFT_GUTTER} ${TOP_GUTTER})`}>
          {visibleTracks.flatMap((t, i) => {
            const color = pickTrackColor(t.target, i)
            const tvp = getTrackViewport(t.target)
            return t.keyframes.map((kf) => {
              const isDragged = drag.preview != null && drag.isDragging
                                && drag.preview.value === kf.value && drag.preview.ms === kf.timeMs
              const ms  = isDragged ? drag.preview!.ms    : kf.timeMs
              const val = isDragged ? drag.preview!.value : (kf.value as number)
              const cx = msToX(tvp, ms)
              const cy = valueToY(tvp, val)
              const isSelected = selectedKfIds.has(kf.id)
              const isHov = hoveredKf?.kfId === kf.id && hoveredKf.trackTarget === t.target
              return (
                <g key={`${t.target}-${kf.id}`}>
                  {/* Hover highlight ring */}
                  {isHov && (
                    <circle cx={cx} cy={cy} r={9}
                      fill="none" stroke={color} strokeWidth={1} opacity={0.4}
                      pointerEvents="none"
                    />
                  )}
                  <circle
                    cx={cx} cy={cy}
                    r={isSelected ? 5 : 4}
                    fill={isSelected ? '#fff' : color}
                    stroke={isHov ? '#fff' : color}
                    strokeWidth={isSelected ? 2 : isHov ? 1.5 : 1}
                    style={{ cursor: 'move' }}
                    onMouseEnter={() => setHoveredKf({
                      trackTarget: t.target, kfId: kf.id,
                      ms: kf.timeMs, value: kf.value as number,
                      easingType: kf.easing?.type ?? 'easeOut',
                    })}
                    onMouseLeave={() => setHoveredKf(null)}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      setHoveredKf(null)
                      // Alt-drag duplicate: clone the keyframe first, then
                      // begin drag on the new one. The original stays put;
                      // the clone follows the cursor. Two undo steps
                      // (add + move) — standard editor behaviour.
                      if (e.altKey && selectedTimelineId) {
                        const cloneId = nextKfId()
                        const clone = { ...kf, id: cloneId }
                        editor.dispatchCommand(makeAddKfCmd(selectedTimelineId, t.target, clone))
                        onSelectKeyframes(new Set([cloneId]))
                        drag.begin(e, clone, t.target)
                        return
                      }
                      // Update selection: replace unless Shift pressed
                      const next = new Set(e.shiftKey ? selectedKfIds : [])
                      if (e.shiftKey && selectedKfIds.has(kf.id)) next.delete(kf.id)
                      else                                          next.add(kf.id)
                      onSelectKeyframes(next)
                      drag.begin(e, kf, t.target)
                    }}
                    onDoubleClick={(e) => {
                      // Inline edit: open a small input over the kf node.
                      e.stopPropagation()
                      if (typeof kf.value !== 'number') return
                      setEditingKf({
                        trackTarget: t.target, kfId: kf.id,
                        xPx: cx, yPx: cy,
                        draft: String(kf.value),
                      })
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (!selectedKfIds.has(kf.id)) onSelectKeyframes(new Set([kf.id]))
                      setCtxData({ kind: 'kf', trackTarget: t.target, kfId: kf.id })
                      ctxMenu.open(e)
                    }}
                  />
                </g>
              )
            })
          })}
        </g>

        {/* ── Playhead vertical line ───────────────────────────────────── */}
        <line
          x1={LEFT_GUTTER + msToX(viewport, currentTimeMs)}
          x2={LEFT_GUTTER + msToX(viewport, currentTimeMs)}
          y1={TOP_GUTTER} y2={TOP_GUTTER + plotH}
          stroke="#ef4444" strokeWidth={1.5} opacity={0.85}
        />

        {/* Lasso selection rectangle (visible while Alt+drag is active) */}
        {lassoRect && (
          <rect
            x={LEFT_GUTTER + Math.min(lassoRect.x1, lassoRect.x2)}
            y={TOP_GUTTER  + Math.min(lassoRect.y1, lassoRect.y2)}
            width={Math.abs(lassoRect.x2 - lassoRect.x1)}
            height={Math.abs(lassoRect.y2 - lassoRect.y1)}
            fill="#3b82f6" fillOpacity={0.12}
            stroke="#60a5fa" strokeWidth={1} strokeDasharray="3 3"
            pointerEvents="none"
          />
        )}
      </svg>

      {/* Inline value-edit input (kf double-click) ─────────────────────────
          Positioned absolutely over the SVG using the kf's pixel coords.
          Auto-focuses on open; commits on Enter / blur, cancels on Esc. */}
      {editingKf && (() => {
        // Re-resolve the kf each render so the underlying value updates
        // (e.g. another panel changed it during the edit) are reflected.
        const k = scene.timelines
          .find((tl) => tl.id === selectedTimelineId)?.tracks
          .find((t) => t.target === editingKf.trackTarget)?.keyframes
          .find((kk) => kk.id === editingKf.kfId)
        if (!k) { setEditingKf(null); return null }
        const commit = () => {
          if (!selectedTimelineId) return
          const v = Number(editingKf.draft)
          if (Number.isFinite(v) && v !== k.value && typeof k.value === 'number') {
            editor.dispatchCommand(makeUpdateKfValueCmd(
              selectedTimelineId, editingKf.trackTarget, k.id, k.value, v,
            ))
          }
          setEditingKf(null)
        }
        return (
          <input
            autoFocus
            type="number"
            value={editingKf.draft}
            onChange={(e) => setEditingKf({ ...editingKf, draft: e.target.value })}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  { e.preventDefault(); commit() }
              if (e.key === 'Escape') { e.preventDefault(); setEditingKf(null) }
              e.stopPropagation()
            }}
            onFocus={(e) => e.currentTarget.select()}
            className="absolute z-50 w-20 px-1 py-0.5 text-[11px] font-mono
                       bg-gray-950 text-white border border-blue-500 rounded
                       focus:outline-none"
            style={{
              left: LEFT_GUTTER + editingKf.xPx - 40,
              top:  TOP_GUTTER  + editingKf.yPx - 24,
            }}
          />
        )
      })()}

      {/* Right-click menu — items vary by `ctxData.kind` ──────────────────── */}
      {ctxMenu.isOpen && ctxData && (
        <ContextMenu
          x={ctxMenu.state!.x}
          y={ctxMenu.state!.y}
          items={buildCtxMenuItems()}
          onClose={() => { ctxMenu.close(); setCtxData(null) }}
        />
      )}

      {/* Status bar — drag readout / hover info / hint ─────────────────────── */}
      <div className="flex items-center gap-0 px-2 h-5 text-[9px] font-mono border-t border-gray-800
                      bg-gray-950/80 text-gray-600 shrink-0 select-none overflow-hidden">
        {drag.preview ? (
          // Active drag — show time + value
          <span className="text-yellow-400">
            t = {Math.round(drag.preview.ms)}ms · v = {formatTickValue(drag.preview.value)}
          </span>
        ) : hoveredKf ? (
          // Hovering a keyframe — show its metadata
          <>
            <span className="text-yellow-300">⬦</span>
            <span className="ml-1 text-gray-400">{Math.round(hoveredKf.ms)}ms</span>
            <span className="mx-1 text-gray-700">·</span>
            <span className="text-gray-400">{formatTickValue(hoveredKf.value)}</span>
            <span className="mx-1 text-gray-700">·</span>
            <span className="text-blue-400">{hoveredKf.easingType}</span>
            {normalizeMode && (
              <><span className="mx-1 text-gray-700">·</span><span className="text-green-500">norm</span></>
            )}
          </>
        ) : (
          // Idle — show hint + normalize indicator
          <span className="truncate">
            {normalizeMode && <span className="text-green-500 mr-2">NORM</span>}
            Drag=scrub · Ctrl+drag=pan · Shift+drag=zoom · Alt+drag=lasso · Dbl-click curve=add kf · F/A/H
          </span>
        )}
      </div>
    </div>
  )

  // ── Build menu items based on which context was right-clicked ──────────
  function buildCtxMenuItems(): MenuItem[] {
    if (!ctxData || !selectedTimelineId) return []
    const tl = scene.timelines.find((t) => t.id === selectedTimelineId)!

    const setEasingFor = (kf: Keyframe, trackTarget: string, type: EasingType) => {
      const next = type === 'customBezier'
        ? { type, bezier: kf.easing?.bezier ?? DEFAULT_BEZIER }
        : { type }
      editor.dispatchCommand(makeUpdateEasingCmd(selectedTimelineId!, trackTarget, kf.id, kf.easing, next))
    }

    if (ctxData.kind === 'kf') {
      const track = tl.tracks.find((t) => t.target === ctxData.trackTarget)
      const kf    = track?.keyframes.find((k) => k.id === ctxData.kfId)
      if (!kf || !track) return []
      const frameMs = scene.composition.frameRate > 0 ? 1000 / scene.composition.frameRate : 0
      return buildKeyframeMenu(kf, {
        editValue: (k) => {
          // Reuse the inline-edit input by positioning it over the kf.
          if (typeof k.value !== 'number') return
          setEditingKf({
            trackTarget: ctxData.trackTarget, kfId: k.id,
            xPx: msToX(viewport, k.timeMs),
            yPx: valueToY(viewport, k.value),
            draft: String(k.value),
          })
        },
        setEasing:     (k, t) => setEasingFor(k, ctxData.trackTarget, t),
        deleteKf:      () => editor.dispatchCommand(makeDeleteKfCmd(selectedTimelineId!, ctxData.trackTarget, kf)),
        duplicateKf:   (k) => {
          const clone = { ...k, id: nextKfId(), timeMs: k.timeMs + Math.max(100, frameMs) }
          editor.dispatchCommand(makeAddKfCmd(selectedTimelineId!, ctxData.trackTarget, clone))
          onSelectKeyframes(new Set([clone.id]))
        },
        alignToFrame:  frameMs > 0 ? () => {
          const snapped = Math.round(kf.timeMs / frameMs) * frameMs
          if (snapped === kf.timeMs) return
          editor.dispatchCommand({
            label: 'Align Keyframe to Frame',
            execute: (s) => updateKfTimeMs(s, selectedTimelineId!, ctxData.trackTarget, kf.id, snapped),
            undo:    (s) => updateKfTimeMs(s, selectedTimelineId!, ctxData.trackTarget, kf.id, kf.timeMs),
          })
        } : undefined,
        mirrorTiming: selectedKfIds.size > 1 ? () => {
          // Collect every selected kf across the active timeline so the
          // mirror works on multi-track selections too.
          const refs: { kfId: string; target: string; timelineId: string }[] = []
          for (const tr of tl.tracks) {
            for (const k of tr.keyframes) {
              if (selectedKfIds.has(k.id)) refs.push({ kfId: k.id, target: tr.target, timelineId: selectedTimelineId! })
            }
          }
          const cmd = makeMirrorTimingCmd(scene, refs)
          if (cmd) editor.dispatchCommand(cmd)
        } : undefined,
        reverseValues: selectedKfIds.size > 1 ? () => {
          const refs: KfValueRef[] = []
          for (const tr of tl.tracks) {
            for (const k of tr.keyframes) {
              if (selectedKfIds.has(k.id)) refs.push({ kfId: k.id, target: tr.target, timelineId: selectedTimelineId! })
            }
          }
          const cmd = makeReverseValuesCmd(scene, refs)
          if (cmd) editor.dispatchCommand(cmd)
        } : undefined,
        setTangentMode: (k, mode) => {
          const prev = k.tangentMode
          editor.dispatchCommand({
            label: `Set Tangent: ${mode}`,
            execute: (s) => mapKfInScene(s, selectedTimelineId!, ctxData.trackTarget, k.id,
              (kk) => ({ ...kk, tangentMode: mode })),
            undo:    (s) => mapKfInScene(s, selectedTimelineId!, ctxData.trackTarget, k.id,
              (kk) => ({ ...kk, tangentMode: prev })),
          })
        },
        convertToHold: (k) => setEasingFor(k, ctxData.trackTarget, 'hold'),
      }, selectedKfIds.size)
    }

    if (ctxData.kind === 'segment') {
      const track = tl.tracks.find((t) => t.target === ctxData.trackTarget)
      if (!track) return []
      // Set the easing on the kf at-or-before the click point — that's the
      // kf whose `easing` controls the segment under the cursor.
      const sorted = [...track.keyframes].sort((a, b) => a.timeMs - b.timeMs)
      const seg = [...sorted].reverse().find((k) => k.timeMs <= ctxData.timeMs)
      const setSeg = (type: EasingType) =>
        seg && setEasingFor(seg, ctxData.trackTarget, type)
      return buildSegmentMenu({
        addKeyframeHere: () => addKeyframeAt(ctxData.trackTarget, ctxData.timeMs),
        setLinear:    () => setSeg('linear'),
        setEaseIn:    () => setSeg('easeIn'),
        setEaseOut:   () => setSeg('easeOut'),
        setEaseInOut: () => setSeg('easeInOut'),
        setHold:      () => setSeg('hold'),
        flatten:      () => {
          // Flatten the segment under the cursor: find the kf at-or-before
          // the click and the kf right after; equalise B.value = A.value.
          if (!seg) return
          const idx = sorted.findIndex((k) => k.id === seg.id)
          const kfB = sorted[idx + 1]
          if (!kfB) return
          const cmd = makeFlattenSegmentCmd(scene, tl.id, ctxData.trackTarget, seg.id, kfB.id)
          if (cmd) editor.dispatchCommand(cmd)
        },
      })
    }

    // Empty area menu
    return buildEmptyAreaMenu({
      setPlayheadHere: () => onTimeChange(ctxData.timeMs),
      fitAll:          () => { setViewStartMs(0); setViewEndMs(duration) },
      fitSelected:     fitToSelection,
      // TODO(sprint 2): paste/marker/work-area + select-before/after here —
      // wire when the keyframe clipboard reaches the curve editor.
    })
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function clampWindow(s: number, e: number, duration: number): { s: number; e: number } {
  const span = Math.max(50, e - s)
  let ns = Math.max(0, s)
  let ne = ns + span
  if (ne > duration * 1.5) { ne = duration * 1.5; ns = ne - span }
  return { s: ns, e: ne }
}

function niceTickArray(start: number, end: number, step: number): number[] {
  if (step <= 0) return []
  const out: number[] = []
  const first = Math.ceil(start / step) * step
  for (let v = first; v <= end + step * 0.001; v += step) out.push(v)
  return out
}

function formatTimeMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 2).replace(/\.?0+$/, '')}s`
  return `${Math.round(ms)}ms`
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-full text-xs text-gray-500 bg-gray-950">
      {msg}
    </div>
  )
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

// ── Tiny toolbar button — kept inline so we don't grow the UI primitives
//    folder for a one-use button. If we reuse it elsewhere later, lift it. ─
function ToolbarBtn({ children, title, onClick, active, disabled }: {
  children: React.ReactNode
  title:    string
  onClick:  () => void
  active?:  boolean
  disabled?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`text-[10px] px-2 py-0.5 rounded transition-colors
        ${disabled
          ? 'text-gray-700 cursor-not-allowed'
          : active
            ? 'bg-blue-600 text-white hover:bg-blue-500'
            : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
    >
      {children}
    </button>
  )
}
