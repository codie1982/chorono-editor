'use client'
import {
  useRef, useEffect, useCallback, useState, useLayoutEffect, useMemo,
} from 'react'
import type { ChronoScene, Layer, BezierPath, Timeline } from '@/lib/types'
import type { TimelineGhostSettings } from '@/lib/types/editor'
import { hitTestLayer, hitTestLayersAt, bezierPathBounds, type AssetElementMap } from '@/lib/renderer'
import { resolveInstanceLayer } from '@/lib/clone/InstanceResolver'
import { resolveDisplayTransform } from '@/lib/render/resolveDisplayTransform'
import { updateLayerProperty } from '@/lib/editor/autoKeyframe'
import { makeUpdateLayerCmd, makeAddLayerCmd } from '@/lib/editor/commands-layer'
import { makeCloneCmd, type CloneArrayCommand } from '@/lib/editor/commands-clone'
import type { CloneMode } from '@/lib/clone/CloneTypes'
// BL-73 — Spline drawing tools
import type { SplinePrimitiveKind } from '@/lib/types/spline'
import {
  computeSplineBounds,
  hitTestSplinePoint, hitTestSplineHandle, hitTestSplineSegment, hitTestSplineContour,
  moveSplinePoint, moveSplineHandle, insertPointOnSegment, deleteSplinePoint,
  setSplinePointType, setSegmentType, setContourClosed, reverseContour,
} from '@/lib/spline'
import {
  hitTestPath, hitTestSegment, insertAnchorOnSegment, togglePathClosed,
  moveAnchor, moveInHandle, moveOutHandle,
} from '@/lib/path/pathOps'
import type { Guide } from '@/lib/snap/AlignmentGuides'
import { SnapEngine, type SnapEngineSettings } from '@/lib/snap/SnapEngine'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { SnapSettingsHook } from '@/app/hooks/useSnapSettings'
import MotionPathOverlay from './MotionPathOverlay'
import PathGuideOverlay from './PathGuideOverlay'
import PathEditOverlay from './PathEditOverlay'
import SplineEditOverlay from './SplineEditOverlay'
import ContextMenu, { useContextMenu } from './ui/ContextMenu'
import { buildCanvasMenu, type CanvasMenuHandlers } from './canvas/buildCanvasMenu'
import {
  rotate90CW, rotate90CCW, flipHorizontal, flipVertical, centerOrigin,
} from '@/lib/editor/layerTransforms'
// ── Canvas interaction types + leaf presentational components ──────────────
import type {
  Handle, ActiveDrag, RotateState, ScaleAxisState,
} from './canvas/types/canvasDragTypes'
import { SelectionFrame } from './canvas/overlays/SelectionFrame'
import { AnchorHandle } from './canvas/overlays/AnchorHandle'
import { MoveAxisGizmo, ScaleAxisGizmo } from './canvas/overlays/AxisGizmos'
import { RotateRing } from './canvas/overlays/RotateRing'
import { TransformHUD } from './canvas/overlays/TransformHUD'
import { Rulers } from './canvas/overlays/Rulers'
import { FitMenu } from './canvas/controls/FitMenu'
import { SnapMenu } from './canvas/controls/SnapMenu'
import { ViewMenu } from './canvas/controls/ViewMenu'
import { useCanvasRenderer } from './canvas/hooks/useCanvasRenderer'
import { usePreviewDrag } from './canvas/hooks/usePreviewDrag'
import { useSelectionTools } from './canvas/hooks/useSelectionTools'
import { useSplineDrawing } from './canvas/hooks/useSplineDrawing'
// ── Pure drag math (framework-free, unit-tested in lib/canvas/math) ────────
import { clamp } from '@/lib/canvas/math/coordinateMath'
import { applyAxisLock } from '@/lib/canvas/math/moveMath'
import { wrapAngle180, angleDegFromPivot, rotatePointAroundPivot } from '@/lib/canvas/math/rotateMath'
import { scaleFactorFromDelta, clampScale, scaleTransformAroundPivot } from '@/lib/canvas/math/scaleMath'
import { calculateAnchorMove } from '@/lib/canvas/math/anchorMath'
import { calculateResize } from '@/lib/canvas/math/resizeMath'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
  timeMs: number
  selectedLayerId: string | null
  /** Multi-selection set — when set has >1 entries, drag operations move
   *  ALL of them together (group-style transform). */
  selectedLayerIds?: Set<string>
  assets: AssetElementMap
  onSelectLayer: (id: string | null, shiftHeld?: boolean) => void
  /** Optional pre-computed override map from the interactive runtime hook
   *  (already merges timeline + param + binding overrides). */
  overrides?:    Map<string, number>
  /** Runtime parameter values for text placeholder + colour resolution. */
  paramValues?:  Map<string, string | number | boolean>
  /** When true, canvas clicks on layers with tappable:true fire a runtime
   *  'click' event INSTEAD of changing selection. Used by RuntimePreviewPanel
   *  to exercise event bindings without leaving the builder. */
  previewMode?:  boolean
  /** Called with the layer id when a tappable layer is clicked in preview mode. */
  onLayerClickInPreview?: (layerId: string) => void
  /** Preview-mode drag events on draggable layers — fires Trigger events. */
  onLayerDragInPreview?: (
    layerId: string,
    phase:   'start' | 'move' | 'end',
    dx:      number,
    dy:      number,
    progress:number,
  ) => void
  /** Optional external control of pan mode — when provided, SceneCanvas reads
   *  from this prop instead of its internal toggle. Lets the top toolbar drive
   *  the canvas tool state without lifting all state. */
  panMode?: boolean
  onPanModeChange?: (next: boolean) => void
  /** External tool mode. Drives gizmo visibility (3DS Max-style isolated
   *  transform modes) plus the legacy Select / Pan / Pen utilities.
   *    select  → all gizmos visible (resize + rotate + anchor + axis arrows)
   *    move    → frame + axis arrows only (no resize / rotate / anchor)
   *    rotate  → frame + rotation handles only
   *    scale   → frame + resize handles only
   *    anchor  → anchor crosshair only (no frame, no resize/rotate)
   *    pan     → canvas drag mode (no gizmos)
   *    pen     → path anchor editing (existing behaviour) */
  toolMode?: 'select' | 'pan' | 'pen' | 'move' | 'rotate' | 'scale' | 'anchor'
    | 'selection-box' | 'selection-lasso' | 'selection-circle' | 'selection-paint'
    | 'spline-draw'
  /** BL-66 — Push a tool-mode change up to the page (e.g. double-clicking a
   *  path enters pen mode so the user can immediately edit it; cancelling
   *  path pick mode returns to 'select'). */
  onToolModeChange?: (next: 'select' | 'pan' | 'pen' | 'move' | 'rotate' | 'scale' | 'anchor') => void
  /** BL-73 — Active spline primitive being drawn (null = not in draw mode). */
  splineDrawKind?: SplinePrimitiveKind | null
  /** BL-73 — When set, drawn splines append into this layer instead of a new one. */
  splineAppendTargetId?: string | null
  /** BL-73 — Called after a spline draw commits (page resets draw mode). */
  onSplineDrawCommit?: () => void
  /** BL-73 Sprint 5 — mirrors the selected spline point id up to the page so
   *  the properties panel can show a point editor. */
  onSplinePointSelected?: (pointId: string | null) => void
  /** BL-60 Faz 3 — Replace / add / subtract layers from the current selection
   *  after a canvas selection-tool drag completes. Mode is 'replace' (plain
   *  drag), 'add' (Shift+drag), or 'subtract' (Alt+drag). */
  onSelectByGeometry?: (layerIds: Set<string>, mode: 'replace' | 'add' | 'subtract') => void
  /** BL-60 Faz 3 — Hit-test mode for selection tools:
   *  'touching' (default) = any layer whose bounds overlap the drawn shape
   *  'inside'             = only layers whose bounds fit fully within the shape */
  selectionContainMode?: 'inside' | 'touching'
  /** Snap settings — owned by the page so the dockable SnapPanel + the
   *  in-canvas SnapMenu both read/write the same source of truth. */
  snap: SnapSettingsHook
  /** Called once per drag-end / transform commit. Page-level auto-key
   *  pipeline (BL-41) uses this to snapshot changed animatable properties
   *  into keyframes when the timeline mode is Auto or REC + playing. */
  onAfterLayerCommit?: (prev: Layer, next: Layer) => void
  /** Fullscreen toggle — when provided, FitMenu shows an "⛶ Fullscreen
   *  canvas" item and reflects the current state. */
  fullscreen?: boolean
  onToggleFullscreen?: () => void
  /** Optional callbacks injected by page.tsx for right-click menu actions
   *  that need access to page-level state (clipboard, grouping, etc.).
   *  Anything not provided is shown as a disabled row in the menu. */
  menuHandlers?: {
    cut?:       () => void
    copy?:      () => void
    paste?:     () => void
    canPaste?:  boolean
    duplicate?: () => void
    group?:     () => void
    ungroup?:   () => void
    canUngroup?:boolean
    deleteLayer?: () => void
    animateProperty?: (propertyPath: string) => void
    alignLeft?:   () => void
    alignCenter?: () => void
    alignRight?:  () => void
    alignTop?:    () => void
    alignMiddle?: () => void
    alignBottom?: () => void
    distributeHorizontally?: () => void
    distributeVertically?:   () => void
    /** BL-17 Faz 1 — Bake the selected primitive into an editable spline. */
    convertToSpline?: () => void
    /** BL-73 Sprint 6 — Convert a text layer into editable spline glyph outlines. */
    convertTextToSpline?: () => void
    /** BL-59 Clone & Array — quick clone (one new layer, default offset). */
    cloneQuick?:    () => void
    /** BL-59 Clone & Array — opens CloneModal. */
    cloneSettings?: () => void
    /** BL-59 Clone & Array — opens ArrayModal. */
    arraySettings?: () => void
    /** BL-59 — Select all layers sharing this layer's arrayGroupId. */
    selectAllInArray?: (layerId: string) => void
    /** BL-59 — Predicate: does the right-clicked layer belong to an array? */
    isLayerInArray?: (layerId: string) => boolean
    /** BL-59 — Clone & Align: this layer = source, other selected = targets. */
    cloneAlignToSelected?: (sourceId: string) => void
    /** BL-59 — Bake a Repeater wrapper layer into real cloned layers. */
    bakeRepeater?: (repeaterId: string) => void
    /** BL-67 — Enter motion-path pick mode for the right-clicked layer. */
    assignMotionPath?: () => void
  }
  /** BL-67 — When set, all path layers are drawn as dashed pickable overlays
   *  and a click on one assigns it as the target layer's followPath. */
  pathPickMode?: { targetLayerId: string } | null
  /** BL-67 — Called when the user clicks a path in pick mode. */
  onAssignPath?: (targetLayerId: string, pathLayerId: string) => void
  /** BL-67 — Called when the user presses Escape (or clicks outside) to leave pick mode. */
  onExitPathPickMode?: () => void
  /** BL-56 — Ghost / Onion-Skin settings (playhead-relative frame preview). */
  ghostSettings?: TimelineGhostSettings
  /** BL-56 — Selected timeline used to source keyframe tracks for ghost frames. */
  selectedTimeline?: Timeline | null
}

const PADDING   = 24
const MIN_ZOOM  = 0.1
const MAX_ZOOM  = 8
const ZOOM_STEP = 1.25
const MIN_SIZE  = 4    // smallest allowed layer dimension (px in composition space)

export default function SceneCanvas({
  scene, editor, timeMs, selectedLayerId, selectedLayerIds, assets, onSelectLayer,
  overrides, paramValues, previewMode, onLayerClickInPreview, onLayerDragInPreview,
  panMode: controlledPanMode, onPanModeChange, toolMode, onToolModeChange, snap,
  onSelectByGeometry, selectionContainMode = 'touching',
  fullscreen, onToggleFullscreen,
  menuHandlers, onAfterLayerCommit,
  ghostSettings, selectedTimeline,
  pathPickMode = null, onAssignPath, onExitPathPickMode,
  splineDrawKind = null, splineAppendTargetId = null, onSplineDrawCommit, onSplinePointSelected,
}: Props) {
  const [hoveredPickPathId, setHoveredPickPathId] = useState<string | null>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { width, height } = scene.composition

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const [zoom, setZoom]       = useState(1)
  const [maxSide, setMaxSide] = useState({ w: 0, h: 0 })

  // ── Snap config — owned upstream by useSnapSettings ─────────────────────
  // Mirror to a ref so pointermove closures see fresh values without being
  // re-created every settings change (drag handlers run thousands of times).
  // Naming kept ("master/grid/objects/...") so the algorithm below didn't
  // need to be rewritten when the source moved up the tree.
  const snapSettings = snap.settings
  const snapEnabled   = snapSettings.enabled
  const snapToGridOn  = snapSettings.targets.grid
  const snapToObjects = snapSettings.targets.objects
  const snapToPoints  = snapSettings.targets.points
  const snapToGuides  = snapSettings.targets.guides
  const snapToPixel   = snapSettings.targets.pixel
  const gridSize      = snapSettings.grid.sizePx
  // BL-26 — central SnapEngine, lazy-init + setSettings on change.
  // Held in a ref so drag closures pick up the live engine without
  // re-creating the handlers on every settings toggle.
  const engineRef = useRef<SnapEngine | null>(null)
  if (engineRef.current === null) engineRef.current = new SnapEngine(snapSettings as SnapEngineSettings)
  useEffect(() => { engineRef.current?.setSettings(snapSettings as SnapEngineSettings) }, [snapSettings])
  const snapRef = useRef({
    master: snapEnabled, grid: snapToGridOn, objects: snapToObjects,
    points: snapToPoints, guides: snapToGuides, pixel: snapToPixel,
    size:   gridSize,
  })
  useEffect(() => {
    snapRef.current = {
      master: snapEnabled,
      grid:   snapToGridOn,
      objects: snapToObjects,
      points:  snapToPoints,
      guides:  snapToGuides,
      pixel:   snapToPixel,
      size:    gridSize,
    }
  }, [snapEnabled, snapToGridOn, snapToObjects, snapToPoints, snapToGuides, snapToPixel, gridSize])

  // ── View options (rulers + grid front/back) ──────────────────────────────
  const [showRulers,  setShowRulers]  = useState(true)
  const [gridInFront, setGridInFront] = useState(false)
  const [showGuides,  setShowGuides]  = useState(true)

  // ── Right-click context menu — opens at cursor on a layer hit ────────────
  // Targets the right-clicked layer (not necessarily the selected one) so
  // users can act on any object without changing selection first. Selection
  // does, however, get updated so e.g. Animate can keyframe the right layer.
  const ctxMenu = useContextMenu()
  const [ctxTargetLayerId, setCtxTargetLayerId] = useState<string | null>(null)
  // ── Right-click on empty canvas area → fit / zoom shortcuts ──────────────
  const emptyCanvasCtx = useContextMenu()
  // ── BL-73 Sprint 5 — right-click on a spline point / segment / contour ───
  const splineCtx = useContextMenu()
  const splineCtxTargetRef = useRef<
    | { kind: 'point';   id: string }
    | { kind: 'segment'; id: string; t: number }
    | { kind: 'contour'; id: string }
    | null
  >(null)

  // ── Alignment guides (canvas-center / edges / other-layer snap) ─────────
  // Active guides are stored in a ref AND state so changes trigger render
  // but inside-pointermove updates don't re-create handler closures.
  const [activeGuides, setActiveGuides] = useState<Guide[]>([])
  const guidesRef = useRef<Guide[]>([])
  const setGuides = (g: Guide[]) => {
    guidesRef.current = g
    setActiveGuides(g)
  }

  // ── Pan mode (move the whole view instead of objects) ───────────────────
  // Controlled (via props) when parent provides it; otherwise self-managed.
  const [internalPanMode, setInternalPanMode] = useState(false)
  const panMode = controlledPanMode ?? internalPanMode
  const setPanMode = (next: boolean | ((p: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(panMode) : next
    if (onPanModeChange) onPanModeChange(resolved)
    else setInternalPanMode(resolved)
  }
  const [pan, setPan]         = useState({ x: 0, y: 0 })
  const panDragRef = useRef<{
    startClientX: number; startClientY: number; startPan: { x: number; y: number }
  } | null>(null)

  // ── Hover preview (red outline of the layer that would be selected) ─────
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null)
  const hoverRafRef = useRef<number | null>(null)

  // ── Fit menu (dropdown opens above the Fit button) ──────────────────────
  const [fitMenuOpen, setFitMenuOpen] = useState(false)
  const fitMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!fitMenuOpen) return
    const close = (e: MouseEvent) => {
      if (fitMenuRef.current && !fitMenuRef.current.contains(e.target as Node)) setFitMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [fitMenuOpen])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setMaxSide({ w: r.width - PADDING * 2, h: r.height - PADDING * 2 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitZoom = useMemo(() => {
    if (maxSide.w <= 0 || maxSide.h <= 0) return 1
    return Math.min(maxSide.w / width, maxSide.h / height, MAX_ZOOM)
  }, [maxSide, width, height])

  // ── Zoom presets ─────────────────────────────────────────────────────────
  /** Pan offset (display px) that places (cx, cy) in composition coords at the
   *  centre of the viewport, given a zoom level. Reverses the flex centring. */
  const panToCentre = useCallback((cx: number, cy: number, z: number) => ({
    x: (width  / 2 - cx) * z,
    y: (height / 2 - cy) * z,
  }), [width, height])

  const fitAll = useCallback(() => {
    setZoom(fitZoom); setPan({ x: 0, y: 0 })
  }, [fitZoom])

  const fitWidth = useCallback(() => {
    if (maxSide.w <= 0) return
    const z = clamp(maxSide.w / width, MIN_ZOOM, MAX_ZOOM)
    setZoom(z); setPan({ x: 0, y: 0 })
  }, [maxSide.w, width])

  const fitHeight = useCallback(() => {
    if (maxSide.h <= 0) return
    const z = clamp(maxSide.h / height, MIN_ZOOM, MAX_ZOOM)
    setZoom(z); setPan({ x: 0, y: 0 })
  }, [maxSide.h, height])

  const actualSize = useCallback(() => {
    setZoom(1); setPan({ x: 0, y: 0 })
  }, [])

  const zoomTo = useCallback((z: number) => {
    setZoom(clamp(z, MIN_ZOOM, MAX_ZOOM)); setPan({ x: 0, y: 0 })
  }, [])

  /** Fit selected layer to viewport (with 40px padding) and centre it. */
  const fitSelection = useCallback(() => {
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer || !layer.size) return
    const PAD = 40
    const z = clamp(
      Math.min((maxSide.w - PAD * 2) / layer.size.width, (maxSide.h - PAD * 2) / layer.size.height),
      MIN_ZOOM, MAX_ZOOM,
    )
    const cx = layer.transform.x + layer.size.width  / 2
    const cy = layer.transform.y + layer.size.height / 2
    setZoom(z); setPan(panToCentre(cx, cy, z))
  }, [scene.layers, selectedLayerId, maxSide, panToCentre])

  /** Re-centre selected layer in the viewport without changing zoom. */
  const centreSelection = useCallback(() => {
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer) return
    const w = layer.size?.width  ?? (layer.text?.fontSize ? 120 : 80)
    const h = layer.size?.height ?? (layer.text?.fontSize ?? 24)
    const cx = layer.transform.x + w / 2
    const cy = layer.transform.y + h / 2
    setPan(panToCentre(cx, cy, zoom))
  }, [scene.layers, selectedLayerId, zoom, panToCentre])

  // ── Refs for live values inside window-level pointer listeners ───────────
  const sceneRef = useRef(scene)
  useEffect(() => { sceneRef.current = scene }, [scene])

  const editorRef = useRef(editor)
  useEffect(() => { editorRef.current = editor }, [editor])

  const compositionRef = useRef({ width, height })
  useEffect(() => { compositionRef.current = { width, height } }, [width, height])

  /** Composition-pixels per CSS-pixel (depends on actual displayed canvas size). */
  const pxScale = useRef({ sx: 1, sy: 1 })
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    pxScale.current = {
      sx: rect.width  > 0 ? width  / rect.width  : 1,
      sy: rect.height > 0 ? height / rect.height : 1,
    }
  }, [zoom, width, height])

  /**
   * Live on-screen → composition scale, read fresh from the canvas rect.
   * Drag math MUST use this (not the cached `pxScale`) so a layout change
   * mid-session can't desync the cursor-to-layer mapping. Cache is the
   * fallback when the canvas element is momentarily unavailable.
   */
  const readScale = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const { width: cw, height: ch } = compositionRef.current
    return {
      sx: rect && rect.width  > 0 ? cw / rect.width  : pxScale.current.sx,
      sy: rect && rect.height > 0 ? ch / rect.height : pxScale.current.sy,
    }
  }, [])

  const dragRef = useRef<ActiveDrag | null>(null)

  // BL-03: Pen-tool close-path double-click detection. First click on the
  // path's first anchor stores the timestamp; a second click within 350ms
  // on the same anchor triggers togglePathClosed instead of starting a drag.
  const closePathClickRef = useRef<{ layerId: string; timeMs: number } | null>(null)

  // BL-60 Faz 3 — Canvas marquee selection tools (box / lasso / circle / paint).
  const { selectionOverlay, beginSelectionDrag } = useSelectionTools({
    canvasRef, sceneRef, width, height,
    selectionContainMode, onSelectByGeometry,
  })

  /** BL-73 Sprint 3 — hovered spline element (point / handle / segment). */
  const [splineHover, setSplineHover] = useState<
    | { kind: 'point';   id: string }
    | { kind: 'handle';  pointId: string; handleKind: 'in' | 'out' }
    | { kind: 'segment'; id: string }
    | null
  >(null)
  /** BL-73 Sprint 4 — currently selected spline point (Delete / properties). */
  const [selectedSplinePointId, setSelectedSplinePointId] = useState<string | null>(null)
  const selectedSplinePointIdRef = useRef<string | null>(null)
  useEffect(() => { selectedSplinePointIdRef.current = selectedSplinePointId }, [selectedSplinePointId])
  // Mirror to the page so the properties panel can show a point editor.
  useEffect(() => { onSplinePointSelected?.(selectedSplinePointId) }, [selectedSplinePointId, onSplinePointSelected])

  // ── Drag-time numeric HUD (position / rotation / size readout) ───────────
  // Mirrors AE / Figma — appears next to the cursor while transforming.
  const [dragHud, setDragHud] = useState<{ x: number; y: number; label: string } | null>(null)

  // ── Pointer handlers shared by move + resize (window-level) ──────────────
  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const { width: cw, height: ch } = compositionRef.current
    // Compute the on-screen → composition scale LIVE from the canvas rect.
    // The cached pxScale only refreshes on zoom/width/height changes, so any
    // OTHER layout shift (panel toggle, window resize, mid-pan transition)
    // leaves it stale — dragging then runs at the wrong scale and objects
    // "escape" the cursor or snap back. Reading the rect each move keeps the
    // delta exact; the cache is only a fallback if the canvas is unmounted.
    const { sx, sy } = readScale()
    const dx = (e.clientX - drag.startClientX) * sx
    const dy = (e.clientY - drag.startClientY) * sy

    const snapState = snapRef.current
    // Each snap type is independently gated on the master Enable Snapping.
    //   objects → snap moving layer edges/centres to OTHER layers + canvas
    //   points  → snap moving layer corner points to other layers' corners
    //             (currently shares the snapRect target set with objects)
    //   grid    → snap to the visible composition grid (uses gridSize)
    //   pixel   → round final position / size to integer composition px
    //   guides  → user-placed ruler guides (no ruler-guide UI yet — wired
    //             as a future-proof flag, no behaviour change today)
    const snap = {
      master:  snapState.master,
      objects: snapState.master && snapState.objects,
      points:  snapState.master && snapState.points,
      guides:  snapState.master && snapState.guides,
      grid:    snapState.master && snapState.grid,
      pixel:   snapState.master && snapState.pixel,
      size:    snapState.size,
      // Legacy alias preserved for the anchor branch which only knows about
      // grid snap (anchor doesn't align to other layers — it's a pivot).
      enabled: snapState.master && snapState.grid,
    }

    if (drag.kind === 'move') {
      // Compute delta from the PRIMARY layer's drag — apply that delta to
      // every layer in movingLayers (multi-select preserves relative spacing).
      const primaryOx = drag.originalLayer.transform.x
      const primaryOy = drag.originalLayer.transform.y
      // Shift held → constrain to the dominant axis (Figma / Illustrator
      // standard — user just drags in the direction they want and Shift
      // locks it). Cleaner than separate "Ctrl=horizontal, Ctrl+Shift=
      // vertical" mappings: one key, intuitive, no need to remember which
      // modifier means which axis.
      // Hard axis lock from Move-mode arrows beats Shift's dominant-axis logic.
      const { dx: dxLocked, dy: dyLocked } = applyAxisLock(dx, dy, drag.axisLock, e.shiftKey)
      let pnx = primaryOx + dxLocked
      let pny = primaryOy + dyLocked

      // ── BL-26: delegate the object → grid → pixel chain to SnapEngine ──
      // The engine reads master + per-type toggles + grid size from its
      // settings (kept fresh by the engineRef useEffect above). Same math
      // as before, just routed through one place so vertex / segment snap
      // (BL-27) can plug into the same pipeline.
      const movingIds = new Set(drag.movingLayers.map(m => m.id))
      const otherRects = sceneRef.current.layers
        .filter(l => !movingIds.has(l.id) && !l.hidden && l.type !== 'audio' && l.size)
        .map(l => ({
          id: l.id, x: l.transform.x, y: l.transform.y,
          width: l.size!.width, height: l.size!.height,
        }))
      const snapped = engineRef.current!.snapRect(
        { x: pnx, y: pny, width: drag.width, height: drag.height },
        { canvasWidth: cw, canvasHeight: ch, otherLayers: otherRects },
      )
      pnx = snapped.point.x
      pny = snapped.point.y
      // Guide overlay — clear if the engine returned none, otherwise show.
      if (snapped.guides.length > 0) setGuides(snapped.guides)
      else if (guidesRef.current.length > 0) setGuides([])

      pnx = clamp(pnx, 0, Math.max(0, cw - drag.width))
      pny = clamp(pny, 0, Math.max(0, ch - drag.height))
      const actualDx = pnx - primaryOx
      const actualDy = pny - primaryOy

      let next = sceneRef.current
      // Drag overrides force the canvas to show the cursor-follow position even
      // when the layer's transform.x/y is keyframed — without them the renderer
      // evaluates the timeline track and the layer appears frozen at its
      // keyframed value while only the snap guides move. (Preview only; the
      // commit path / auto-key still decides whether a keyframe is written.)
      const nextDragOverrides = new Map<string, number>()
      for (const { id, originalLayer } of drag.movingLayers) {
        const nx = originalLayer.transform.x + actualDx
        const ny = originalLayer.transform.y + actualDy
        next = updateLayerProperty(next, id, 'transform.x', nx)
        next = updateLayerProperty(next, id, 'transform.y', ny)
        nextDragOverrides.set(`layers.${id}.transform.x`, nx)
        nextDragOverrides.set(`layers.${id}.transform.y`, ny)
      }
      editorRef.current.previewTransaction(next)
      setDragOverrides(nextDragOverrides)
      const cloneTag = drag.cloneMode
        ? (drag.cloneMode === 'instance' ? '⧉ Instance   ' : '⧉ Copy   ')
        : ''
      setDragHud({
        x: e.clientX, y: e.clientY,
        label: `${cloneTag}X ${Math.round(pnx)}   Y ${Math.round(pny)}`,
      })
      return
    }

    if (drag.kind === 'pathPoint') {
      const orig = drag.originalLayer
      if (!orig.path) return
      const a = orig.path.anchors[drag.anchorIndex]
      if (!a) return

      let nextPath: BezierPath
      if (drag.part === 'anchor') {
        nextPath = moveAnchor(orig.path, drag.anchorIndex, dx, dy)
      } else if (drag.part === 'inHandle') {
        const baseX = a.inX ?? a.x
        const baseY = a.inY ?? a.y
        nextPath = moveInHandle(orig.path, drag.anchorIndex, baseX + dx, baseY + dy)
      } else {
        const baseX = a.outX ?? a.x
        const baseY = a.outY ?? a.y
        nextPath = moveOutHandle(orig.path, drag.anchorIndex, baseX + dx, baseY + dy)
      }

      const nextScene: ChronoScene = {
        ...sceneRef.current,
        layers: sceneRef.current.layers.map((l) => l.id !== drag.layerId ? l : { ...l, path: nextPath }),
      }
      editorRef.current.previewTransaction(nextScene)
      return
    }

    // BL-73 Sprint 4 — drag a spline point (handles follow) or a bezier handle
    // (smooth/bezier continuity applied). Always mutate from the drag-start
    // snapshot so the delta is absolute, not accumulated.
    if (drag.kind === 'splinePoint' || drag.kind === 'splineHandle') {
      const orig = drag.originalLayer
      if (orig.type !== 'spline' || !orig.spline) return
      const nextSpline = drag.kind === 'splinePoint'
        ? moveSplinePoint(orig.spline, drag.pointId, drag.startX + dx, drag.startY + dy)
        : moveSplineHandle(orig.spline, drag.pointId, drag.handleKind, drag.startX + dx, drag.startY + dy)
      const nextScene: ChronoScene = {
        ...sceneRef.current,
        layers: sceneRef.current.layers.map((l) => l.id !== drag.layerId ? l : { ...l, spline: nextSpline }),
      }
      editorRef.current.previewTransaction(nextScene)
      return
    }

    // BL-66 — Pen Tool, new anchor being placed: drag distance turns a corner
    // anchor into a smooth one with outHandle at the cursor (inHandle mirrored).
    if (drag.kind === 'newAnchorDraw') {
      const layer = sceneRef.current.layers.find(l => l.id === drag.layerId)
      if (!layer?.path) return
      const dragDist = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY)
      // Cursor in layer-local coordinates (dx,dy already in composition px).
      const handleX = drag.anchorX + dx
      const handleY = drag.anchorY + dy
      const anchors = layer.path.anchors.slice()
      if (dragDist > 5) {
        anchors[drag.anchorIndex] = {
          x: drag.anchorX, y: drag.anchorY,
          outX: handleX, outY: handleY,
          inX: 2 * drag.anchorX - handleX,
          inY: 2 * drag.anchorY - handleY,
          pointType: 'smooth',
        }
      } else {
        anchors[drag.anchorIndex] = {
          x: drag.anchorX, y: drag.anchorY,
          pointType: 'corner',
        }
      }
      const nextScene: ChronoScene = {
        ...sceneRef.current,
        layers: sceneRef.current.layers.map((l) =>
          l.id !== drag.layerId ? l : { ...l, path: { ...layer.path!, anchors } },
        ),
      }
      editorRef.current.previewTransaction(nextScene)
      // Subtle HUD so the user sees the handle length
      setDragHud({
        x: e.clientX, y: e.clientY,
        label: dragDist > 5 ? `Smooth · ${Math.round(dragDist)}px` : 'Corner',
      })
      return
    }

    if (drag.kind === 'scaleAxis') {
      // Sensitivity — 100 composition px of drag doubles the scale.
      // Positive drag (right/down) = bigger; negative = smaller. Shift =
      // uniform regardless of which arrow was grabbed. Scale is floored at
      // MIN_SCALE below so a layer can't flip past zero / vanish.
      const axis = e.shiftKey ? 'both' : drag.axis
      const { factorX, factorY } = scaleFactorFromDelta(dx, dy, axis)

      if (drag.multiLayerOrigins && drag.multiLayerOrigins.length > 0
          && drag.pivotX != null && drag.pivotY != null) {
        // BL-03: multi-select scale around common pivot. Each layer's
        // position-offset from pivot is multiplied by the factor so layers
        // both grow AND spread out (or shrink and pull in).
        let scene = sceneRef.current
        for (const o of drag.multiLayerOrigins) {
          const { x: nx, y: ny } = scaleTransformAroundPivot(
            o.originalX, o.originalY,
            o.originalLayer.transform.anchorX, o.originalLayer.transform.anchorY,
            drag.pivotX, drag.pivotY, factorX, factorY,
          )
          const nsx = clampScale(o.originalScaleX, factorX)
          const nsy = clampScale(o.originalScaleY, factorY)
          scene = updateLayerProperty(scene, o.layerId, 'transform.x',      nx)
          scene = updateLayerProperty(scene, o.layerId, 'transform.y',      ny)
          scene = updateLayerProperty(scene, o.layerId, 'transform.scaleX', nsx)
          scene = updateLayerProperty(scene, o.layerId, 'transform.scaleY', nsy)
        }
        editorRef.current.previewTransaction(scene)
        setDragHud({
          x: e.clientX, y: e.clientY,
          label: `${(factorX * 100).toFixed(0)}% × ${(factorY * 100).toFixed(0)}%  (${drag.multiLayerOrigins.length} layers)`,
        })
      } else {
        const o = drag.originalLayer.transform
        const nsx = clampScale(o.scaleX, factorX)
        const nsy = clampScale(o.scaleY, factorY)
        let next = updateLayerProperty(sceneRef.current, drag.layerId, 'transform.scaleX', nsx)
        next     = updateLayerProperty(next,             drag.layerId, 'transform.scaleY', nsy)
        editorRef.current.previewTransaction(next)
        setDragHud({
          x: e.clientX, y: e.clientY,
          label: `SX ${nsx.toFixed(2)}   SY ${nsy.toFixed(2)}`,
        })
      }
      return
    }

    if (drag.kind === 'rotate') {
      // Pointer angle from pivot → delta vs. start angle. Shift = snap to 15°.
      const rect = canvasRef.current!.getBoundingClientRect()
      const wx = (e.clientX - rect.left) * (compositionRef.current.width  / rect.width)
      const wy = (e.clientY - rect.top)  * (compositionRef.current.height / rect.height)
      const curAngle = angleDegFromPivot(drag.anchorWorldX, drag.anchorWorldY, wx, wy)
      let delta = curAngle - drag.startAngle
      if (e.shiftKey) delta = Math.round(delta / 15) * 15

      if (drag.multiLayerOrigins && drag.multiLayerOrigins.length > 0) {
        // BL-03: multi-select rotation around common pivot.
        let scene = sceneRef.current
        for (const o of drag.multiLayerOrigins) {
          // Anchor of this layer at drag start (its rotation pivot for translation)
          const ax = o.originalX + o.originalLayer.transform.anchorX
          const ay = o.originalY + o.originalLayer.transform.anchorY
          const { x: nx, y: ny } = rotatePointAroundPivot(ax, ay, drag.anchorWorldX, drag.anchorWorldY, delta)
          // Apply rotated translation + cumulative rotation
          const rot = wrapAngle180(o.originalRotation + delta)
          scene = updateLayerProperty(scene, o.layerId, 'transform.x', nx - o.originalLayer.transform.anchorX)
          scene = updateLayerProperty(scene, o.layerId, 'transform.y', ny - o.originalLayer.transform.anchorY)
          scene = updateLayerProperty(scene, o.layerId, 'transform.rotationDeg', rot)
        }
        editorRef.current.previewTransaction(scene)
        setDragHud({
          x: e.clientX, y: e.clientY,
          label: `${delta.toFixed(1)}°  (${drag.multiLayerOrigins.length} layers)`,
        })
      } else {
        // Single-layer (existing) behavior
        const nextRot = wrapAngle180(drag.originalRotation + delta)
        const next = updateLayerProperty(sceneRef.current, drag.layerId, 'transform.rotationDeg', nextRot)
        editorRef.current.previewTransaction(next)
        setDragHud({
          x: e.clientX, y: e.clientY,
          label: `${nextRot.toFixed(1)}°`,
        })
      }
      return
    }

    if (drag.kind === 'anchor') {
      // Anchor lives in layer-local coords. Snap is applied to the layer's
      // local axis (so the grid you see on canvas still aligns 1:1). The
      // math also compensates transform.x/y so a rotated/scaled layer stays
      // visually pinned while its pivot moves.
      const orig = drag.originalLayer.transform
      const { anchorX: nAX, anchorY: nAY, x: nX, y: nY } = calculateAnchorMove({
        x: orig.x, y: orig.y,
        anchorX: orig.anchorX, anchorY: orig.anchorY,
        rotationDeg: orig.rotationDeg, scaleX: orig.scaleX, scaleY: orig.scaleY,
        dx, dy,
        snapGrid: snap.grid, snapPixel: snap.pixel, gridSize: snap.size,
      })

      const nextScene: ChronoScene = {
        ...sceneRef.current,
        layers: sceneRef.current.layers.map((l) => l.id !== drag.layerId ? l : {
          ...l,
          transform: { ...l.transform, anchorX: nAX, anchorY: nAY, x: nX, y: nY },
        }),
      }
      editorRef.current.previewTransaction(nextScene)
      setDragHud({
        x: e.clientX, y: e.clientY,
        label: `Anchor  ${Math.round(nAX)}, ${Math.round(nAY)}`,
      })
      return
    }

    // ── Resize ────────────────────────────────────────────────────────────
    // calculateResize owns the geometry: per-handle deltas, Cmd/Ctrl aspect
    // lock, min-size + pixel snap + composition-bounds clamp, and keeping the
    // anchor's proportional position across the resize.
    const layer = drag.originalLayer
    if (!layer.size) return
    const proportional = e.metaKey || e.ctrlKey  // Cmd/Ctrl → aspect-lock

    const { x: nx, y: ny, width: nw, height: nh, anchorX: nax, anchorY: nay } = calculateResize({
      x: layer.transform.x, y: layer.transform.y,
      width: layer.size.width, height: layer.size.height,
      anchorX: layer.transform.anchorX, anchorY: layer.transform.anchorY,
      handle: drag.handle,
      dx, dy,
      proportional,
      snapPixel: snap.pixel,
      minSize: MIN_SIZE,
      boundsWidth: cw, boundsHeight: ch,
    })

    const nextScene: ChronoScene = {
      ...sceneRef.current,
      layers: sceneRef.current.layers.map((l) => l.id !== drag.layerId ? l : {
        ...l,
        transform: { ...l.transform, x: nx, y: ny, anchorX: nax, anchorY: nay },
        size: { width: nw, height: nh },
      }),
    }
    editorRef.current.previewTransaction(nextScene)
    setDragHud({
      x: e.clientX, y: e.clientY,
      label: `W ${Math.round(nw)}   H ${Math.round(nh)}`,
    })
  }, [readScale])

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup',   handlePointerUp)
    // Clear alignment guides + drag HUD once the drag is over
    setGuides([])
    setDragHud(null)
    // Drop the move-drag preview overrides — the committed scene (and auto-key,
    // if active) now drives what the canvas shows.
    setDragOverrides((prev) => (prev.size > 0 ? new Map() : prev))

    const ed = editorRef.current
    const finalLayer = ed.scene.layers.find((l) => l.id === drag.layerId)
    if (!finalLayer) { ed.cancelTransaction(); return }

    // Path point drag — commit if path actually changed
    if (drag.kind === 'pathPoint') {
      const pChanged = JSON.stringify(finalLayer.path) !== JSON.stringify(drag.originalLayer.path)
      if (!pChanged) { ed.cancelTransaction(); return }
      ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, finalLayer, drag.originalLayer))
      onAfterLayerCommit?.(drag.originalLayer, finalLayer)
      return
    }

    // BL-73 Sprint 4 — spline point / handle drag commit.
    if (drag.kind === 'splinePoint' || drag.kind === 'splineHandle') {
      const changed = JSON.stringify(finalLayer.spline) !== JSON.stringify(drag.originalLayer.spline)
      if (!changed) { ed.cancelTransaction(); return }
      ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, finalLayer, drag.originalLayer))
      onAfterLayerCommit?.(drag.originalLayer, finalLayer)
      return
    }

    // BL-66 — New anchor placement commit. The preview already holds the
    // final shape (corner or smooth with handles); just commit the diff.
    // Anchor pivot is auto-centred on the path AABB so rotate / scale gizmos
    // pivot around the path's visual centre instead of canvas origin.
    if (drag.kind === 'newAnchorDraw') {
      const pChanged = JSON.stringify(finalLayer.path) !== JSON.stringify(drag.originalLayer.path)
      if (!pChanged) { ed.cancelTransaction(); return }
      let committed = finalLayer
      if (finalLayer.path && finalLayer.path.anchors.length > 0) {
        const bb = bezierPathBounds(finalLayer.path)
        committed = {
          ...finalLayer,
          transform: {
            ...finalLayer.transform,
            anchorX: bb.x + bb.width  / 2,
            anchorY: bb.y + bb.height / 2,
          },
        }
      }
      ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, committed, drag.originalLayer))
      onAfterLayerCommit?.(drag.originalLayer, committed)
      return
    }

    if (drag.kind === 'rotate') {
      // BL-03: multi-select rotate → batch every changed layer into a single
      // undo step (similar to the multi-move branch below).
      if (drag.multiLayerOrigins && drag.multiLayerOrigins.length > 0) {
        const ops: { layerId: string; next: Layer; prev: Layer }[] = []
        for (const o of drag.multiLayerOrigins) {
          const fl = ed.scene.layers.find((l) => l.id === o.layerId)
          if (!fl) continue
          const orig = o.originalLayer
          const changed =
            fl.transform.x !== orig.transform.x ||
            fl.transform.y !== orig.transform.y ||
            fl.transform.rotationDeg !== orig.transform.rotationDeg
          if (changed) ops.push({ layerId: o.layerId, next: fl, prev: orig })
        }
        if (ops.length === 0) { ed.cancelTransaction(); return }
        const cmds = ops.map((op) => makeUpdateLayerCmd(op.layerId, op.next, op.prev))
        ed.commitTransaction({
          label: `Rotate ${ops.length} Layers`,
          execute: (s) => cmds.reduce((sc, c) => c.execute(sc), s),
          undo:    (s) => cmds.slice().reverse().reduce((sc, c) => c.undo(sc), s),
        })
        return
      }
      const rChanged = finalLayer.transform.rotationDeg !== drag.originalLayer.transform.rotationDeg
      if (!rChanged) { ed.cancelTransaction(); return }
      ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, finalLayer, drag.originalLayer))
      onAfterLayerCommit?.(drag.originalLayer, finalLayer)
      return
    }

    // BL-03: Multi-layer scale → batch one undo step (same pattern as
    // multi-rotate + multi-move).
    if (drag.kind === 'scaleAxis' && drag.multiLayerOrigins && drag.multiLayerOrigins.length > 0) {
      const ops: { layerId: string; next: Layer; prev: Layer }[] = []
      for (const o of drag.multiLayerOrigins) {
        const fl = ed.scene.layers.find((l) => l.id === o.layerId)
        if (!fl) continue
        const orig = o.originalLayer
        const changed =
          fl.transform.x      !== orig.transform.x ||
          fl.transform.y      !== orig.transform.y ||
          fl.transform.scaleX !== orig.transform.scaleX ||
          fl.transform.scaleY !== orig.transform.scaleY
        if (changed) ops.push({ layerId: o.layerId, next: fl, prev: orig })
      }
      if (ops.length === 0) { ed.cancelTransaction(); return }
      const cmds = ops.map((op) => makeUpdateLayerCmd(op.layerId, op.next, op.prev))
      ed.commitTransaction({
        label: `Scale ${ops.length} Layers`,
        execute: (s) => cmds.reduce((sc, c) => c.execute(sc), s),
        undo:    (s) => cmds.slice().reverse().reduce((sc, c) => c.undo(sc), s),
      })
      return
    }

    // Clone-drag commit → for each dragged original, create a clone at the
    // dragged offset. commitTransaction applies the command to the BASE scene
    // (originals at their start positions, no clones), so the originals stay
    // put and the clones land at the drop position. ONE undo step.
    if (drag.kind === 'move' && drag.cloneMode) {
      const mode = drag.cloneMode
      const cloneCmds: CloneArrayCommand[] = []
      for (const { id, originalLayer } of drag.movingLayers) {
        const moved = ed.scene.layers.find((l) => l.id === id)
        if (!moved) continue
        const offX = moved.transform.x - originalLayer.transform.x
        const offY = moved.transform.y - originalLayer.transform.y
        cloneCmds.push(makeCloneCmd({
          source: originalLayer, count: 1, offsetX: offX, offsetY: offY,
          timeline: null, allLayers: ed.scene.layers,
          duplicateAnimation: false, mode,
        }))
      }
      if (cloneCmds.length === 0) { ed.cancelTransaction(); return }
      const verb = mode === 'instance' ? 'Instance' : 'Clone'
      const combined: CloneArrayCommand = cloneCmds.length === 1
        ? cloneCmds[0]
        : {
            label: `${verb} ${cloneCmds.length} layers`,
            execute: (s) => cloneCmds.reduce((sc, c) => c.execute(sc), s),
            undo:    (s) => cloneCmds.slice().reverse().reduce((sc, c) => c.undo(sc), s),
            layerMetadata: Object.assign({}, ...cloneCmds.map((c) => c.layerMetadata)),
            result: {
              label: `${verb} ${cloneCmds.length} layers`,
              createdLayerIds: cloneCmds.flatMap((c) => c.result.createdLayerIds),
              createdTrackTargets: cloneCmds.flatMap((c) => c.result.createdTrackTargets),
              suggestedSelection: cloneCmds.flatMap((c) => c.result.suggestedSelection),
            },
          }
      ed.commitTransaction(combined)
      // Select the primary clone so the user keeps working on the new copy.
      const primaryCloneId = cloneCmds[0].result.suggestedSelection[0]
        ?? cloneCmds[0].result.createdLayerIds[0]
      if (primaryCloneId) onSelectLayer(primaryCloneId)
      return
    }

    // Multi-layer move → batch one undo step
    if (drag.kind === 'move' && drag.movingLayers.length > 1) {
      const moved: { layerId: string; next: Layer; prev: Layer }[] = []
      for (const { id, originalLayer } of drag.movingLayers) {
        const fl = ed.scene.layers.find(l => l.id === id)
        if (!fl) continue
        if (fl.transform.x !== originalLayer.transform.x ||
            fl.transform.y !== originalLayer.transform.y) {
          moved.push({ layerId: id, next: fl, prev: originalLayer })
        }
      }
      if (moved.length === 0) { ed.cancelTransaction(); return }
      const cmds = moved.map(m => makeUpdateLayerCmd(m.layerId, m.next, m.prev))
      // Lazy-load batch builder so this file's bundle stays cool.
      import('@/lib/editor/commands-batch').then(({ makeBatchCmd }) => {
        ed.commitTransaction(makeBatchCmd(`Move ${moved.length} layers`, cmds))
        moved.forEach((m) => onAfterLayerCommit?.(m.prev, m.next))
      }).catch(() => {
        // Fallback: commit primary only
        ed.commitTransaction(cmds[0])
        onAfterLayerCommit?.(moved[0].prev, moved[0].next)
      })
      return
    }

    // Only commit if something actually changed. Anchor lives on the
    // transform too — must be included or anchor-only drags get reverted.
    const orig = drag.originalLayer
    const tChanged =
      finalLayer.transform.x       !== orig.transform.x ||
      finalLayer.transform.y       !== orig.transform.y ||
      finalLayer.transform.anchorX !== orig.transform.anchorX ||
      finalLayer.transform.anchorY !== orig.transform.anchorY ||
      finalLayer.transform.rotationDeg !== orig.transform.rotationDeg ||
      finalLayer.transform.scaleX  !== orig.transform.scaleX ||
      finalLayer.transform.scaleY  !== orig.transform.scaleY
    const sChanged = !!finalLayer.size && !!orig.size && (
      finalLayer.size.width  !== orig.size.width ||
      finalLayer.size.height !== orig.size.height
    )
    if (!tChanged && !sChanged) { ed.cancelTransaction(); return }
    ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, finalLayer, orig))
    onAfterLayerCommit?.(orig, finalLayer)
  }, [handlePointerMove, onAfterLayerCommit, onSelectLayer])

  // ── Canvas pointerdown → select + start move ─────────────────────────────
  // ── Pan (move whole view) ─────────────────────────────────────────────────
  const handlePanMove = useCallback((e: PointerEvent) => {
    const p = panDragRef.current
    if (!p) return
    setPan({
      x: p.startPan.x + (e.clientX - p.startClientX),
      y: p.startPan.y + (e.clientY - p.startClientY),
    })
  }, [])
  const handlePanUp = useCallback(() => {
    if (!panDragRef.current) return
    panDragRef.current = null
    window.removeEventListener('pointermove', handlePanMove)
    window.removeEventListener('pointerup',   handlePanUp)
  }, [handlePanMove])
  const beginPan = useCallback((e: React.PointerEvent) => {
    panDragRef.current = {
      startClientX: e.clientX, startClientY: e.clientY,
      startPan: { ...pan },
    }
    window.addEventListener('pointermove', handlePanMove)
    window.addEventListener('pointerup',   handlePanUp)
  }, [pan, handlePanMove, handlePanUp])



  // ── BL-73 Spline drawing tools (box-drag primitives + multi-click line) ──
  const { splinePreview, onSplineDrawPointerDown } = useSplineDrawing({
    canvasRef, compositionRef, sceneRef, editorRef,
    toolMode, splineDrawKind, splineAppendTargetId, onSplineDrawCommit,
    onSelectLayer, setDragHud,
  })

  // BL-73 Sprint 4 — clear point selection when the layer selection changes.
  useEffect(() => { setSelectedSplinePointId(null) }, [selectedLayerId])

  // BL-73 Sprint 4 — Delete / Backspace removes the selected spline point.
  // Capture phase so it pre-empts the page's layer-delete shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const pid = selectedSplinePointIdRef.current
      if (!pid) return
      const layer = sceneRef.current.layers.find(l => l.id === selectedLayerId)
      if (layer?.type !== 'spline' || !layer.spline) return
      const next = deleteSplinePoint(layer.spline, pid)
      if (next === layer.spline) return  // no-op (e.g. ≤ 2 points) — let it pass
      e.preventDefault()
      e.stopPropagation()
      editorRef.current.dispatchCommand(makeUpdateLayerCmd(layer.id, { spline: next }, layer))
      setSelectedSplinePointId(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selectedLayerId])

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Middle-mouse OR pan-mode + left button → pan the view, not the layer
    if (e.button === 1 || (panMode && e.button === 0)) {
      e.preventDefault()
      beginPan(e)
      return
    }
    if (e.button !== 0) return

    // BL-67 — While pick mode is active, clicks on the canvas itself (not on
    // a pickable path) cancel the operation. Path clicks are handled by the
    // SVG overlay above (with stopPropagation), so they don't reach here.
    if (pathPickMode) {
      onExitPathPickMode?.()
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = width  / rect.width
    const sy = height / rect.height
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy

    // ── BL-73: Spline drawing ──────────────────────────────────────────────
    if (toolMode === 'spline-draw' && splineDrawKind) {
      e.preventDefault()
      onSplineDrawPointerDown(cx, cy, e.pointerId)
      return
    }

    // ── BL-60 Faz 3: Canvas selection tools (box / lasso / circle / paint) ──
    if ((toolMode === 'selection-box' || toolMode === 'selection-lasso' ||
         toolMode === 'selection-circle' || toolMode === 'selection-paint')
        && onSelectByGeometry) {
      e.preventDefault()
      const mode: 'replace' | 'add' | 'subtract' =
        e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace'
      const tool =
        toolMode === 'selection-box'    ? 'box' :
        toolMode === 'selection-lasso'  ? 'lasso' :
        toolMode === 'selection-circle' ? 'circle' : 'paint'
      beginSelectionDrag(tool, mode, cx, cy, e.pointerId)
      return
    }

    // ── Runtime preview mode: clicks on tappable layers fire trigger events
    //    instead of changing selection. Lets the author exercise layer-click
    //    rules without leaving the builder.
    if (previewMode) {
      const stack = hitTestLayersAt(scene, timeMs, cx, cy)
      // Prefer draggable layer over tappable when both are set, since drag
      // requires the drag-start handler to capture the pointer immediately.
      for (const id of stack) {
        const layer = scene.layers.find((l) => l.id === id)
        if (!layer) continue
        if (layer.draggable && onLayerDragInPreview) {
          beginPreviewDrag(layer, e.clientX, e.clientY, cx, cy)
          return
        }
        if (layer.tappable && onLayerClickInPreview) {
          onLayerClickInPreview(id)
          return
        }
      }
      return
    }

    // ── Pen Tool: if a path layer is selected, first check anchor/handle hits
    //    BEFORE the normal layer hit-test. Drag the anchor/handle, not the layer.
    const selectedLayer = scene.layers.find((l) => l.id === selectedLayerId)

    // ── BL-73 Sprint 4: edit the selected spline (handle → point → insert) ──
    if (selectedLayer && selectedLayer.type === 'spline' && selectedLayer.spline && !selectedLayer.locked
        && (toolMode === 'select' || toolMode === 'pen')) {
      const lx = cx - selectedLayer.transform.x
      const ly = cy - selectedLayer.transform.y
      const tol = 8 / zoom

      const hh = hitTestSplineHandle(selectedLayer.spline, lx, ly, tol)
      if (hh) {
        const handle = Object.values(selectedLayer.spline.handles)
          .find(h => h.pointId === hh.pointId && h.kind === hh.kind)
        if (handle) {
          editor.beginTransaction()
          dragRef.current = {
            kind: 'splineHandle', layerId: selectedLayer.id, originalLayer: selectedLayer,
            pointId: hh.pointId, handleKind: hh.kind,
            startClientX: e.clientX, startClientY: e.clientY, startX: handle.x, startY: handle.y,
          }
          window.addEventListener('pointermove', handlePointerMove)
          window.addEventListener('pointerup',   handlePointerUp)
          return
        }
      }

      const hp = hitTestSplinePoint(selectedLayer.spline, lx, ly, tol)
      if (hp) {
        const p = selectedLayer.spline.points[hp]
        setSelectedSplinePointId(hp)
        editor.beginTransaction()
        dragRef.current = {
          kind: 'splinePoint', layerId: selectedLayer.id, originalLayer: selectedLayer,
          pointId: hp, startClientX: e.clientX, startClientY: e.clientY, startX: p.x, startY: p.y,
        }
        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup',   handlePointerUp)
        return
      }

      // Pen mode: click on a segment inserts a point (De Casteljau split).
      if (toolMode === 'pen') {
        const hs = hitTestSplineSegment(selectedLayer.spline, lx, ly, 6 / zoom)
        if (hs) {
          const nextSpline = insertPointOnSegment(selectedLayer.spline, hs.segmentId, hs.t)
          editor.dispatchCommand(makeUpdateLayerCmd(selectedLayer.id, { spline: nextSpline }, selectedLayer))
          return
        }
      }
      // Clicked elsewhere inside the spline selection → clear point selection,
      // then fall through to normal layer move/selection.
      setSelectedSplinePointId(null)
    }

    if (selectedLayer && selectedLayer.type === 'path' && selectedLayer.path && !selectedLayer.locked) {
      const lx = cx - selectedLayer.transform.x
      const ly = cy - selectedLayer.transform.y
      const penHit = hitTestPath(selectedLayer.path, lx, ly, 8)
      if (penHit) {
        // BL-03: Pen-tool double-click on FIRST anchor of an open path closes it.
        // We detect "quick second click" via the click-time ref so the first
        // click still starts a normal anchor drag — the second-within-350ms
        // upgrades to a close action and bypasses the drag.
        if (
          toolMode === 'pen' &&
          penHit.type === 'anchor' &&
          penHit.anchorIndex === 0 &&
          !selectedLayer.path.closed &&
          selectedLayer.path.anchors.length >= 2
        ) {
          const now = performance.now()
          const last = closePathClickRef.current
          if (last && last.layerId === selectedLayer.id && now - last.timeMs <= 350) {
            // Second click → close the path
            closePathClickRef.current = null
            const closed = togglePathClosed(selectedLayer.path)
            editor.dispatchCommand(makeUpdateLayerCmd(
              selectedLayer.id,
              { ...selectedLayer, path: closed },
              selectedLayer,
            ))
            return
          }
          closePathClickRef.current = { layerId: selectedLayer.id, timeMs: now }
          // Fall through — start the normal anchor drag for the first click
        }

        editor.beginTransaction()
        dragRef.current = {
          kind: 'pathPoint',
          layerId: selectedLayer.id,
          originalLayer: selectedLayer,
          startClientX: e.clientX,
          startClientY: e.clientY,
          anchorIndex: penHit.anchorIndex,
          part: penHit.type,
        }
        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup',   handlePointerUp)
        return
      }

      // Pen mode + click on a SEGMENT (not an anchor) → insert anchor at the
      // click point so the curve is unchanged but the user can now grab a
      // new control point. Standard Figma/Illustrator behavior. (BL-03)
      if (toolMode === 'pen') {
        const segHit = hitTestSegment(selectedLayer.path, lx, ly, 6)
        if (segHit) {
          const nextPath = insertAnchorOnSegment(selectedLayer.path, segHit.segmentIndex, segHit.t)
          editor.dispatchCommand(makeUpdateLayerCmd(
            selectedLayer.id,
            { ...selectedLayer, path: nextPath },
            selectedLayer,
          ))
          return
        }

        // BL-66 — Click on empty area: APPEND a provisional corner anchor and
        // start a `newAnchorDraw` drag. If the user drags > 5px before release,
        // we upgrade it to a smooth anchor with bezier handles (outHandle at
        // cursor, inHandle mirrored). Pure-click commits as a corner.
        const provisional = {
          ...selectedLayer,
          path: {
            ...selectedLayer.path,
            anchors: [
              ...selectedLayer.path.anchors,
              { x: lx, y: ly, pointType: 'corner' as const },
            ],
          },
        }
        editor.beginTransaction()
        editor.previewTransaction({
          ...sceneRef.current,
          layers: sceneRef.current.layers.map(l => l.id === selectedLayer.id ? provisional : l),
        })
        dragRef.current = {
          kind: 'newAnchorDraw',
          layerId: selectedLayer.id,
          originalLayer: selectedLayer,
          anchorX: lx,
          anchorY: ly,
          startClientX: e.clientX,
          startClientY: e.clientY,
          anchorIndex: provisional.path.anchors.length - 1,
        }
        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup',   handlePointerUp)
        return
      }
    }

    // Alt/Option-click cycles through stacked layers under the cursor — useful
    // when a top layer (e.g. a full-canvas background) is blocking selection
    // of layers underneath. Plain click takes the topmost hit.
    //
    // Group semantics (Figma-style): clicking a grouped child SELECTS the
    // topmost ancestor group instead, so the group can be dragged. Alt-click
    // bypasses this and lets you pick the literal child.
    let hit: string | null
    if (e.altKey) {
      const stack = hitTestLayersAt(scene, timeMs, cx, cy)
      if (stack.length === 0) hit = null
      else {
        const cur = selectedLayerId ?? ''
        const idx = stack.indexOf(cur)
        hit = idx === -1 ? stack[0] : stack[(idx + 1) % stack.length]
      }
    } else {
      hit = hitTestLayer(scene, timeMs, cx, cy)
      // Bubble up to topmost ancestor group
      if (hit) {
        let cur = scene.layers.find(l => l.id === hit)
        while (cur?.parentId) {
          const parent = scene.layers.find(l => l.id === cur!.parentId)
          if (!parent) break
          if (parent.type === 'group') hit = parent.id
          cur = parent
        }
      }
    }
    // Shift+click: toggle layer in/out of the multi-selection set and stop —
    // no drag is started, the user can re-click to drag their selection.
    // Skip when Cmd/Ctrl is held so Cmd+Shift+drag stays free for instance-clone.
    if (e.shiftKey && !e.altKey && !(e.metaKey || e.ctrlKey)) {
      onSelectLayer(hit, true)
      return
    }

    // Don't change selection when clicking on a layer that's already part of
    // the multi-selection (preserves the multi-select set so the upcoming
    // drag moves all peers).
    const inMultiSet = !!hit && (selectedLayerIds?.has(hit) ?? false)
    if (!inMultiSet) onSelectLayer(hit)
    if (!hit) return
    const layer = scene.layers.find((l) => l.id === hit)
    if (!layer || layer.locked) return

    // Build the list of layers to move together. When clicking a member of the
    // multi-selection, every selected (non-locked) layer travels with it.
    const movingLayers: { id: string; originalLayer: Layer }[] = []
    if (inMultiSet && selectedLayerIds && selectedLayerIds.size > 1) {
      // Resolve each selected id to a non-locked layer snapshot
      for (const id of Array.from(selectedLayerIds)) {
        const l = scene.layers.find(x => x.id === id)
        if (l && !l.locked) movingLayers.push({ id: l.id, originalLayer: l })
      }
      // Ensure primary is included (already covered if it's in the set)
    } else {
      movingLayers.push({ id: layer.id, originalLayer: layer })
    }

    editor.beginTransaction()

    // Cmd/Ctrl + drag → clone-while-dragging (3ds Max-style). We move the
    // ORIGINAL layer(s) during the drag (smooth, no render-lag), then on
    // release we leave a clone at the drop position and snap the original back
    // to its start. Result: original stays put, a copy/instance lands where
    // the user dropped — all as ONE undo step.
    //   Cmd        → copy clone
    //   Cmd+Shift  → instance clone (references the source; edits propagate)
    const cloneMode: CloneMode | undefined =
      (e.metaKey || e.ctrlKey) ? (e.shiftKey ? 'instance' : 'copy') : undefined

    dragRef.current = {
      kind: 'move',
      layerId: layer.id,
      originalLayer: layer,
      movingLayers,
      startClientX: e.clientX,
      startClientY: e.clientY,
      width:  layer.size?.width  ?? (layer.text?.fontSize ? 120 : 80),
      height: layer.size?.height ?? (layer.text?.fontSize ?? 24),
      cloneMode,
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [scene, timeMs, width, height, onSelectLayer, editor, handlePointerMove, handlePointerUp, panMode, beginPan, selectedLayerId, previewMode, onLayerClickInPreview, toolMode, onSelectByGeometry, beginSelectionDrag, pathPickMode, onExitPathPickMode, splineDrawKind, onSplineDrawPointerDown, zoom])

  // ── Handle pointerdown → start resize ────────────────────────────────────
  const beginResize = useCallback((handle: Handle) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer || layer.locked || !layer.size) return
    editor.beginTransaction()
    dragRef.current = {
      kind: 'resize',
      layerId: layer.id,
      originalLayer: layer,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [scene.layers, selectedLayerId, editor, handlePointerMove, handlePointerUp])

  // ── Anchor handle pointerdown → start anchor drag ────────────────────────
  const beginAnchorDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer || layer.locked) return
    editor.beginTransaction()
    dragRef.current = {
      kind: 'anchor',
      layerId: layer.id,
      originalLayer: layer,
      startClientX: e.clientX,
      startClientY: e.clientY,
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [scene.layers, selectedLayerId, editor, handlePointerMove, handlePointerUp])

  // ── Move-mode axis arrow pointerdown → constrained move drag ─────────────
  // Click X arrow → drag locked to horizontal. Click Y arrow → vertical.
  // Click center square → free (no lock). Mirrors 3DS Max move gizmo.
  const beginAxisMove = useCallback((axis: 'x' | 'y' | null) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer || layer.locked) return
    editor.beginTransaction()
    dragRef.current = {
      kind: 'move',
      layerId: layer.id,
      originalLayer: layer,
      movingLayers: [{ id: layer.id, originalLayer: layer }],
      startClientX: e.clientX,
      startClientY: e.clientY,
      width:  layer.size?.width  ?? (layer.text?.fontSize ? 120 : 80),
      height: layer.size?.height ?? (layer.text?.fontSize ?? 24),
      axisLock: axis,
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [scene.layers, selectedLayerId, editor, handlePointerMove, handlePointerUp])

  // ── Scale-mode axis gizmo pointerdown → scaleX/scaleY drag ──────────────
  // X arrow → modifies transform.scaleX. Y → scaleY. Centre → uniform.
  // Distinct from frame-resize (which mutates width/height) — this drives
  // the scale MATRIX, which is what keyframe animations interpolate.
  const beginScaleAxis = useCallback((axis: 'x' | 'y' | 'both') => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const primary = scene.layers.find((l) => l.id === selectedLayerId)
    if (!primary || primary.locked) return

    // BL-03: Multi-select scale around shared pivot (centroid of selection).
    const ids = selectedLayerIds && selectedLayerIds.size > 1
      ? Array.from(selectedLayerIds)
          .map((id) => scene.layers.find((l) => l.id === id))
          .filter((l): l is Layer => !!l && !l.locked)
      : null

    let multiOrigins: ScaleAxisState['multiLayerOrigins']
    let pivotX: number | undefined
    let pivotY: number | undefined

    if (ids && ids.length >= 2) {
      let sumX = 0, sumY = 0
      for (const l of ids) {
        sumX += l.transform.x + l.transform.anchorX
        sumY += l.transform.y + l.transform.anchorY
      }
      pivotX = sumX / ids.length
      pivotY = sumY / ids.length
      multiOrigins = ids.map((l) => ({
        layerId: l.id,
        originalLayer: l,
        originalX: l.transform.x,
        originalY: l.transform.y,
        originalScaleX: l.transform.scaleX,
        originalScaleY: l.transform.scaleY,
      }))
    }

    editor.beginTransaction()
    dragRef.current = {
      kind: 'scaleAxis',
      layerId: primary.id,
      originalLayer: primary,
      axis,
      startClientX: e.clientX,
      startClientY: e.clientY,
      multiLayerOrigins: multiOrigins,
      pivotX, pivotY,
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [scene.layers, selectedLayerId, selectedLayerIds, editor, handlePointerMove, handlePointerUp])

  // Map of `layers.<id>.transform.x|y` → number. Merged into renderer
  // overrides so the dragged layer follows the cursor. Owned here because it's
  // shared by the move-drag path, the renderer, AND preview drag.
  const [dragOverrides, setDragOverrides] = useState<Map<string, number>>(new Map())

  // ── Preview-mode drag (fires dragStart/Move/End on draggable layers) ──────
  const { beginPreviewDrag } = usePreviewDrag({
    scene, onLayerDragInPreview, readScale, setDragOverrides,
  })

  // ── Rotation handle (corner-outer area) → rotate around anchor ──────────
  const beginRotate = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const primary = scene.layers.find((l) => l.id === selectedLayerId)
    if (!primary || primary.locked) return

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = compositionRef.current.width  / rect.width
    const sy = compositionRef.current.height / rect.height
    const wx = (e.clientX - rect.left) * sx
    const wy = (e.clientY - rect.top)  * sy

    // BL-03: Multi-select rotation. When 2+ unlocked layers are selected,
    // pivot becomes the centroid of their anchor positions and the drag
    // rotates EVERY selected layer around that shared pivot.
    const ids = selectedLayerIds && selectedLayerIds.size > 1
      ? Array.from(selectedLayerIds)
          .map((id) => scene.layers.find((l) => l.id === id))
          .filter((l): l is Layer => !!l && !l.locked)
      : null

    let anchorWorldX: number
    let anchorWorldY: number
    let multiOrigins: RotateState['multiLayerOrigins']

    if (ids && ids.length >= 2) {
      // Centroid of anchor positions
      let sumX = 0, sumY = 0
      for (const l of ids) {
        sumX += l.transform.x + l.transform.anchorX
        sumY += l.transform.y + l.transform.anchorY
      }
      anchorWorldX = sumX / ids.length
      anchorWorldY = sumY / ids.length
      multiOrigins = ids.map((l) => ({
        layerId: l.id,
        originalLayer: l,
        originalX: l.transform.x,
        originalY: l.transform.y,
        originalRotation: l.transform.rotationDeg,
      }))
    } else {
      anchorWorldX = primary.transform.x + primary.transform.anchorX
      anchorWorldY = primary.transform.y + primary.transform.anchorY
    }

    const startAngle = (Math.atan2(wy - anchorWorldY, wx - anchorWorldX) * 180) / Math.PI

    editor.beginTransaction()
    dragRef.current = {
      kind: 'rotate',
      layerId: primary.id,
      originalLayer: primary,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startAngle,
      originalRotation: primary.transform.rotationDeg,
      anchorWorldX,
      anchorWorldY,
      multiLayerOrigins: multiOrigins,
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [scene.layers, selectedLayerId, selectedLayerIds, editor, handlePointerMove, handlePointerUp])

  // ── Render canvas (scene + ghost / onion-skin overlay) ────────────────────
  useCanvasRenderer(canvasRef, {
    scene, timeMs, selectedLayerId, selectedLayerIds, assets,
    snapEnabled, snapToGridOn, gridSize,
    overrides, paramValues, dragOverrides,
    ghostSettings, selectedTimeline,
  })

  // ── Wheel zoom (Cmd/Ctrl held) ────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
    setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM))
  }, [])

  // ── Selection frame geometry (uses preview layer state) ──────────────────
  //
  // BL-59 Phase 3 — Instance layers carry no geometry; the gizmo needs the
  // source's size/path/shape to draw resize handles in the right spots.
  // We resolve the instance to its source HERE so all gizmo / bbox code
  // below sees a "proxy" layer with full visual fields. The instance's
  // own transform/opacity stay intact (resolveInstanceLayer keeps them).
  const rawSelectedLayer = scene.layers.find((l) => l.id === selectedLayerId) ?? null
  const selectedLayer = rawSelectedLayer?.instanceOf
    ? (resolveInstanceLayer(rawSelectedLayer, scene.layers) ?? rawSelectedLayer)
    : rawSelectedLayer

  // BL-66 — Compute the LIVE rendered transform (motionPath / followPath /
  // keyframe overrides applied) so the gizmo tracks the position the canvas
  // is actually drawing the layer at. Falls back to the static transform
  // when no overrides apply. `dragOverrides` ensures the frame moves
  // smoothly mid-drag (preview transactions don't update overrides).
  const selectedDisplayTransform = useMemo(() => {
    if (!selectedLayer) return null
    let ov: Map<string, number> = overrides ?? new Map()
    if (dragOverrides.size > 0) {
      const m = new Map<string, number>()
      ov.forEach((v, k) => m.set(k, v))
      dragOverrides.forEach((v, k) => m.set(k, v))
      ov = m
    }
    return resolveDisplayTransform(selectedLayer, scene, timeMs, ov)
  }, [selectedLayer, scene, timeMs, overrides, dragOverrides])
  // Selection frame anchor: prefer live display transform but keep the
  // static fallback so empty paths / unconfigured followPath layers still
  // get a sensible gizmo origin.
  const selDX = selectedDisplayTransform?.x ?? selectedLayer?.transform.x ?? 0
  const selDY = selectedDisplayTransform?.y ?? selectedLayer?.transform.y ?? 0
  const selDR = selectedDisplayTransform?.rotationDeg ?? selectedLayer?.transform.rotationDeg ?? 0

  // ── 3DS Max-style gizmo visibility per toolMode ──────────────────────────
  // Each mode shows only its own handle set so the user always sees the
  // gizmo they're using. `select` is the legacy "everything visible" mode.
  //   frame       — blue selection rectangle
  //   resize      — 8 corner/edge handles that mutate width/height
  //   cornerRot   — 4 tiny dots outside corners (Select-mode legacy)
  //   ring        — big orange circle around anchor (Rotate-mode gizmo)
  //   axisMove    — red/blue X/Y arrows for constrained move (Move-mode)
  //   axisScale   — red/blue X/Y arrows for scaleX/Y (Scale-mode gizmo)
  //   anchor      — orange crosshair at the pivot
  const gizmo = {
    frame:     toolMode !== 'anchor' && toolMode !== 'pan' && toolMode !== 'pen',
    resize:    toolMode === 'select' || toolMode === 'scale',
    cornerRot: toolMode === 'select',
    ring:      toolMode === 'rotate',
    axisMove:  toolMode === 'move',
    axisScale: toolMode === 'scale',
    anchor:    toolMode === 'select' || toolMode === 'anchor',
  }
  // BL-66 — Path layers carry geometry in `path.anchors`, not `size`. Derive
  // an AABB from the anchors so the selection frame (+ resize handles) can
  // wrap the path the same way it wraps a shape.
  const selectedPathBounds = useMemo(() => {
    if (!selectedLayer || selectedLayer.type !== 'path' || !selectedLayer.path) return null
    if (selectedLayer.path.anchors.length < 2) return null
    return bezierPathBounds(selectedLayer.path)
  }, [selectedLayer])
  // BL-73 — spline frame bounds from the granular geometry (handles centered-
  // at-origin primitives; local box may have negative x/y).
  const selectedSplineBounds = useMemo(() => {
    if (!selectedLayer || selectedLayer.type !== 'spline' || !selectedLayer.spline) return null
    const b = computeSplineBounds(selectedLayer.spline)
    if (b.width === 0 && b.height === 0) return null
    return b
  }, [selectedLayer])
  const hasFrameGeometry = !!selectedLayer && (!!selectedLayer.size || !!selectedPathBounds || !!selectedSplineBounds)
  const showFrame =
    !!selectedLayer && hasFrameGeometry && !selectedLayer.locked && !selectedLayer.hidden
    && gizmo.frame

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex items-center justify-center bg-neutral-800 overflow-hidden relative ${
        panDragRef.current ? 'cursor-grabbing' : panMode ? 'cursor-grab' : ''
      }`}
      onWheel={handleWheel}
      onPointerDown={(e) => {
        // If the click was on the <canvas>, its own handler manages pan +
        // selection. We only fire here when the user clicks the EMPTY leaf
        // area around the artboard — so pan still works outside the canvas
        // (matches Figma / SVGator behaviour).
        if (e.target === canvasRef.current) return
        if (e.button === 1 || (panMode && e.button === 0)) {
          e.preventDefault()
          beginPan(e)
        }
      }}
    >
      <div
        className="relative"
        style={{
          padding: PADDING,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          transition: panDragRef.current ? 'none' : 'transform 120ms ease-out',
        }}
      >
        <div
          className="absolute inset-6 ring-1 ring-gray-600 shadow-2xl shadow-black/80 rounded pointer-events-none"
        />

        {/* Canvas + selection overlay share the same scaled box */}
        <div
          className="relative"
          style={{
            width: `${width * zoom}px`, height: `${height * zoom}px`,
            outline: previewMode ? '2px solid #f59e0b' : undefined,
            outlineOffset: previewMode ? '-2px' : undefined,
          }}
        >
          {/* Preview-mode badge — corner indicator so user knows clicks fire
              events / drag follows cursor instead of editing. */}
          {previewMode && (
            <div className="absolute top-1 left-1 z-30 pointer-events-none
                            px-2 py-0.5 rounded bg-amber-600/90 text-white text-[10px]
                            font-bold tracking-wider uppercase shadow">
              ▶ Preview
            </div>
          )}

          {/* BL-67 — Path pick mode banner. Click a dashed path to assign it. */}
          {pathPickMode && (
            <div className="absolute top-1 left-1 right-1 z-30 pointer-events-none
                            px-3 py-1 rounded bg-blue-600/90 text-white text-[11px]
                            font-medium shadow flex items-center justify-center gap-2">
              <span>Click a dashed path to use it as a motion path.</span>
              <span className="opacity-80">Press <kbd className="px-1 bg-white/20 rounded">Esc</kbd> to cancel.</span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onPointerDown={handleCanvasPointerDown}
            onDoubleClick={(e) => {
              // BL-66 — Çift tık path layer'a girer ve pen tool'u açar.
              // Bu sayede kullanıcı menü/araç çubuğuna gitmeden ek anchor
              // ekleyip mevcut anchorları sürükleyebilir.
              if (previewMode) return
              const cv = canvasRef.current
              if (!cv) return
              const rect = cv.getBoundingClientRect()
              const sx = width  / rect.width
              const sy = height / rect.height
              const cx = (e.clientX - rect.left) * sx
              const cy = (e.clientY - rect.top)  * sy
              const hitId = hitTestLayer(scene, timeMs, cx, cy)
              const hitLayer = hitId ? scene.layers.find((l) => l.id === hitId) : null
              if (hitLayer?.type === 'path' && !hitLayer.locked) {
                onSelectLayer(hitId!)
                onToolModeChange?.('pen')
              }
            }}
            onContextMenu={(e) => {
              if (previewMode) return                  // preview mode = no editing menus
              const cv = canvasRef.current
              if (!cv) return
              const rect = cv.getBoundingClientRect()
              const sx = width  / rect.width
              const sy = height / rect.height
              const cx = (e.clientX - rect.left) * sx
              const cy = (e.clientY - rect.top)  * sy

              // BL-73 — right-click on the selected spline's element opens the
              // point / segment / contour editing menu.
              const selSpline = scene.layers.find((l) => l.id === selectedLayerId)
              if (selSpline?.type === 'spline' && selSpline.spline) {
                const lx = cx - selSpline.transform.x
                const ly = cy - selSpline.transform.y
                const hp = hitTestSplinePoint(selSpline.spline, lx, ly, 8 / zoom)
                const hs = hp ? null : hitTestSplineSegment(selSpline.spline, lx, ly, 6 / zoom)
                const hc = (hp || hs) ? null : hitTestSplineContour(selSpline.spline, lx, ly)
                if (hp || hs || hc) {
                  e.preventDefault()
                  if (hp)      { setSelectedSplinePointId(hp); splineCtxTargetRef.current = { kind: 'point', id: hp } }
                  else if (hs) { splineCtxTargetRef.current = { kind: 'segment', id: hs.segmentId, t: hs.t } }
                  else         { splineCtxTargetRef.current = { kind: 'contour', id: hc! } }
                  splineCtx.open(e)
                  return
                }
              }

              const hit = hitTestLayer(scene, timeMs, cx, cy)
              if (!hit) {
                e.preventDefault()
                emptyCanvasCtx.open(e)
                return
              }
              e.preventDefault()
              // Bring the right-clicked layer into selection so menu actions
              // operate on what the user pointed at — matches every other editor.
              if (hit !== selectedLayerId) onSelectLayer(hit)
              setCtxTargetLayerId(hit)
              ctxMenu.open(e)
            }}
            onPointerMove={(e) => {
              // Hover preview — rAF-throttled hit test. Skip while any drag
              // is active (avoids competing for state with move/resize/rotate
              // handlers).
              if (panMode || previewMode || dragRef.current || panDragRef.current) return
              if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current)
              const clientX = e.clientX, clientY = e.clientY
              hoverRafRef.current = requestAnimationFrame(() => {
                const cv = canvasRef.current
                if (!cv) return
                const rect = cv.getBoundingClientRect()
                const sx = width  / rect.width
                const sy = height / rect.height
                const cx = (clientX - rect.left) * sx
                const cy = (clientY - rect.top)  * sy
                const hit = hitTestLayer(scene, timeMs, cx, cy)
                setHoveredLayerId((cur) => (cur === hit ? cur : hit))

                // BL-73 — hover over the selected spline's points / handles /
                // segments (priority: handle → point → segment). Local coords;
                // tolerance scaled by zoom so it stays ~8 screen px.
                const sel = scene.layers.find((l) => l.id === selectedLayerId)
                if (sel?.type === 'spline' && sel.spline
                    && (toolMode === 'select' || toolMode === 'pen')) {
                  const lx = cx - sel.transform.x
                  const ly = cy - sel.transform.y
                  const tol = 8 / zoom
                  const hh = hitTestSplineHandle(sel.spline, lx, ly, tol)
                  if (hh) setSplineHover({ kind: 'handle', pointId: hh.pointId, handleKind: hh.kind })
                  else {
                    const hp = hitTestSplinePoint(sel.spline, lx, ly, tol)
                    if (hp) setSplineHover({ kind: 'point', id: hp })
                    else {
                      const hs = hitTestSplineSegment(sel.spline, lx, ly, tol)
                      setSplineHover(hs ? { kind: 'segment', id: hs.segmentId } : null)
                    }
                  }
                } else {
                  setSplineHover((cur) => (cur ? null : cur))
                }
              })
            }}
            onPointerLeave={() => {
              if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current)
              setHoveredLayerId(null)
              setSplineHover((cur) => (cur ? null : cur))
            }}
            className={`absolute inset-0 block ${
              previewMode ? 'cursor-pointer'
              : pathPickMode ? 'cursor-crosshair'
              : toolMode === 'spline-draw' ? 'cursor-crosshair'
              : splineHover ? 'cursor-pointer'
              : toolMode === 'pen' ? 'cursor-crosshair'
              : panMode ? 'cursor-grab'
              : dragRef.current?.kind === 'move' ? 'cursor-grabbing'
              // Default tool: 4-arrow move cursor when over a draggable
              // layer, plain pointer over empty canvas → so the cursor
              // tells the user whether a click would grab something.
              : hoveredLayerId ? 'cursor-move'
              : 'cursor-default'
            } ${panDragRef.current ? '!cursor-grabbing' : ''}`}
            style={{
              width:  `${width  * zoom}px`,
              height: `${height * zoom}px`,
              imageRendering: 'pixelated',
              touchAction: 'none',
            }}
          />

          {/* Hover preview — red outline showing which layer a click would select.
              Only rendered when a non-selected layer is under the cursor and no
              drag is in flight. Matches the layer's rotation so the rect lines
              up with the actual rendered geometry. */}
          {(() => {
            if (!hoveredLayerId || hoveredLayerId === selectedLayerId) return null
            const hl = scene.layers.find((l) => l.id === hoveredLayerId)
            if (!hl || hl.hidden) return null
            // BL-66 — Path layers have no `size`; derive the hover rect from
            // the path AABB so the red outline wraps the actual geometry
            // (instead of an unrelated 80×24 box stuck at the layer origin).
            // Empty paths (< 2 anchors) aren't hittable per renderer logic, so
            // we shouldn't be here — but guard defensively.
            if (hl.type === 'path') {
              if (!hl.path || hl.path.anchors.length < 2) return null
            }
            let hx = hl.transform.x, hy = hl.transform.y
            let hw: number, hh: number
            if (hl.type === 'path' && hl.path && hl.path.anchors.length >= 2) {
              const bb = bezierPathBounds(hl.path)
              hx += bb.x
              hy += bb.y
              hw = bb.width
              hh = bb.height
            } else {
              hw = hl.size?.width  ?? (hl.text?.fontSize ? 120 : 80)
              hh = hl.size?.height ?? (hl.text?.fontSize ?? 24)
            }
            return (
              <div
                key={hoveredLayerId}
                className="absolute pointer-events-none border-2 border-red-500/80 box-border
                           hover-preview-in transition-[border-color,border-width] duration-150"
                style={{
                  left: hx * zoom,
                  top:  hy * zoom,
                  width:  hw * zoom,
                  height: hh * zoom,
                  transform: `rotate(${hl.transform.rotationDeg}deg)`,
                  transformOrigin: `${hl.transform.anchorX * zoom}px ${hl.transform.anchorY * zoom}px`,
                }}
              />
            )
          })()}

          {/* Motion path — trajectory the selected layer follows over time,
              sampled from the position-keyframe interpolation. Drawn UNDER
              the selection frame so handles stay clickable. */}
          {selectedLayer && (
            <MotionPathOverlay
              layer={selectedLayer}
              scene={scene}
              zoom={zoom}
              currentTimeMs={timeMs}
              editor={editor}
              compositionWidth={width}
            />
          )}

          {/* BL-66 / BL-67 — Dashed editor overlay for motion-role path layers
              (hidden in CanvasRenderer) + clickable pick targets when the user
              triggered "Assign motion path" from the right-click menu. */}
          <PathGuideOverlay
            scene={scene}
            zoom={zoom}
            pathPickMode={pathPickMode}
            hoveredPickPathId={hoveredPickPathId}
            onHoverPickPath={setHoveredPickPathId}
            onAssignPath={(pathId) => {
              if (pathPickMode) {
                onAssignPath?.(pathPickMode.targetLayerId, pathId)
                setHoveredPickPathId(null)
              }
            }}
            showMotionGuides={!previewMode}
          />

          {/* BL-66 — Anchor + bezier handle visualization for the selected
              path layer. Shown whenever a path layer is selected (not just
              in pen mode) so users can see the structure they're editing. */}
          {selectedLayer && selectedLayer.type === 'path' && selectedLayer.path && !previewMode && (
            <PathEditOverlay layer={selectedLayer} zoom={zoom} />
          )}

          {/* BL-73 — Control points + bezier handles for the selected spline. */}
          {selectedLayer && selectedLayer.type === 'spline' && selectedLayer.spline && !previewMode && (
            <SplineEditOverlay layer={selectedLayer} zoom={zoom} hover={splineHover} selectedPointId={selectedSplinePointId} />
          )}

          {/* BL-60 Faz 3 — Live selection shape overlay (Box / Lasso /
              Circle / Paint). zoom multiplier maps composition pixels to
              the displayed canvas size. pointer-events:none so it never
              eats the drag stream. */}
          {selectionOverlay && (
            <svg
              className="absolute top-0 left-0 pointer-events-none"
              width={width * zoom}
              height={height * zoom}
              style={{ overflow: 'visible' }}
            >
              {selectionOverlay.kind === 'box' && (
                <rect
                  x={selectionOverlay.x * zoom} y={selectionOverlay.y * zoom}
                  width={selectionOverlay.w * zoom} height={selectionOverlay.h * zoom}
                  fill="rgba(59, 130, 246, 0.15)" stroke="#60a5fa" strokeWidth={1}
                  strokeDasharray="4 3"
                />
              )}
              {selectionOverlay.kind === 'circle' && (
                <circle
                  cx={selectionOverlay.cx * zoom} cy={selectionOverlay.cy * zoom}
                  r={selectionOverlay.r * zoom}
                  fill="rgba(59, 130, 246, 0.15)" stroke="#60a5fa" strokeWidth={1}
                  strokeDasharray="4 3"
                />
              )}
              {selectionOverlay.kind === 'lasso' && selectionOverlay.points.length >= 2 && (
                <polygon
                  points={selectionOverlay.points.map((p) => `${p.x * zoom},${p.y * zoom}`).join(' ')}
                  fill="rgba(59, 130, 246, 0.15)" stroke="#60a5fa" strokeWidth={1}
                  strokeDasharray="4 3" strokeLinejoin="round"
                />
              )}
              {selectionOverlay.kind === 'paint' && (
                <circle
                  cx={selectionOverlay.cx * zoom} cy={selectionOverlay.cy * zoom}
                  r={selectionOverlay.r * zoom}
                  fill="rgba(59, 130, 246, 0.10)" stroke="#60a5fa" strokeWidth={1.5}
                  strokeOpacity={0.7}
                />
              )}
            </svg>
          )}

          {/* BL-73 — Live spline draw preview (box drag / multi-click line).
              Path is in composition coords; scaled by zoom to screen px. */}
          {splinePreview && (
            <svg
              className="absolute top-0 left-0 pointer-events-none"
              width={width * zoom}
              height={height * zoom}
              style={{ overflow: 'visible' }}
            >
              <g transform={`scale(${zoom})`}>
                <path
                  d={splinePreview.d}
                  fill={splinePreview.fill ? 'rgba(59, 130, 246, 0.15)' : 'none'}
                  stroke="#60a5fa"
                  strokeWidth={1 / zoom}
                  strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                  strokeLinejoin="round"
                />
              </g>
            </svg>
          )}

          {showFrame && selectedLayer.size && (
            <SelectionFrame
              x={selDX * zoom}
              y={selDY * zoom}
              w={selectedLayer.size.width  * zoom}
              h={selectedLayer.size.height * zoom}
              anchorOffsetX={selectedLayer.transform.anchorX * zoom}
              anchorOffsetY={selectedLayer.transform.anchorY * zoom}
              rotationDeg={selDR}
              onHandlePointerDown={gizmo.resize ? beginResize : undefined}
              onRotatePointerDown={gizmo.cornerRot ? beginRotate : undefined}
            />
          )}

          {/* BL-66 — Path bounding-box frame. Pathlerin size'ı yok; AABB'yi
              anchors'tan türetiyoruz. Resize handles devre dışı (pathler scale
              değil pen tool ile düzenlenir), sadece rotate dotları aktif. */}
          {showFrame && !selectedLayer.size && selectedPathBounds && (
            <SelectionFrame
              x={(selDX + selectedPathBounds.x) * zoom}
              y={(selDY + selectedPathBounds.y) * zoom}
              w={selectedPathBounds.width  * zoom}
              h={selectedPathBounds.height * zoom}
              anchorOffsetX={selectedLayer.transform.anchorX * zoom}
              anchorOffsetY={selectedLayer.transform.anchorY * zoom}
              rotationDeg={selDR}
              onRotatePointerDown={gizmo.cornerRot ? beginRotate : undefined}
            />
          )}

          {/* BL-73 — Spline selection frame from granular bounds. */}
          {showFrame && !selectedLayer.size && selectedSplineBounds && (
            <SelectionFrame
              x={(selDX + selectedSplineBounds.x) * zoom}
              y={(selDY + selectedSplineBounds.y) * zoom}
              w={selectedSplineBounds.width  * zoom}
              h={selectedSplineBounds.height * zoom}
              anchorOffsetX={selectedLayer.transform.anchorX * zoom}
              anchorOffsetY={selectedLayer.transform.anchorY * zoom}
              rotationDeg={selDR}
              onRotatePointerDown={gizmo.cornerRot ? beginRotate : undefined}
            />
          )}

          {/* Move-mode axis arrows — X (red) / Y (blue) / center square.
              Anchored at the layer's pivot in world space, screen-aligned so
              they don't rotate with the layer (matches 3DS Max behaviour). */}
          {gizmo.axisMove && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <MoveAxisGizmo
              x={(selDX + selectedLayer.transform.anchorX) * zoom}
              y={(selDY + selectedLayer.transform.anchorY) * zoom}
              onAxisPointerDown={beginAxisMove}
            />
          )}

          {/* Scale-mode axis gizmo — X/Y arrows with SQUARE caps + centre
              uniform handle. Drives transform.scaleX/Y (matrix), distinct
              from frame resize which mutates width/height (geometry). */}
          {gizmo.axisScale && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <ScaleAxisGizmo
              x={(selDX + selectedLayer.transform.anchorX) * zoom}
              y={(selDY + selectedLayer.transform.anchorY) * zoom}
              onAxisPointerDown={beginScaleAxis}
            />
          )}

          {/* Rotate-mode ring — big orange circle around anchor.
              Radius scales with the layer size (min 60 CSS px) so the ring
              stays clearly outside the frame even for big shapes. */}
          {gizmo.ring && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <RotateRing
              x={(selDX + selectedLayer.transform.anchorX) * zoom}
              y={(selDY + selectedLayer.transform.anchorY) * zoom}
              radius={Math.max(
                60,
                ((selectedLayer.size?.width ?? 120) * 0.6) * zoom,
                ((selectedLayer.size?.height ?? 80) * 0.6) * zoom,
              )}
              isDragging={dragRef.current?.kind === 'rotate'}
              onPointerDown={beginRotate}
            />
          )}

          {/* Anchor handle — visible in Select + Anchor modes */}
          {gizmo.anchor && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <AnchorHandle
              x={(selDX + selectedLayer.transform.anchorX) * zoom}
              y={(selDY + selectedLayer.transform.anchorY) * zoom}
              isDragging={dragRef.current?.kind === 'anchor'}
              onPointerDown={beginAnchorDrag}
            />
          )}

          {/* Drag-time numeric readout (position / rotation / size) */}
          {dragHud && <TransformHUD {...dragHud} />}

          {/* Alignment guide overlay — pink lines while snapping */}
          {activeGuides.length > 0 && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ width: `${width * zoom}px`, height: `${height * zoom}px` }}
            >
              {activeGuides.map((g, i) => {
                const isCenter = g.source === 'canvas-center' || g.source === 'layer-center'
                const color = isCenter ? '#ec4899' : '#f59e0b'   // pink for centers, amber for edges
                if (g.axis === 'v') {
                  return (
                    <div
                      key={`g-${i}`}
                      style={{
                        position: 'absolute',
                        top: 0, bottom: 0,
                        left: `${g.position * zoom}px`,
                        width: '1px',
                        background: color,
                        boxShadow: `0 0 4px ${color}`,
                      }}
                    />
                  )
                }
                return (
                  <div
                    key={`g-${i}`}
                    style={{
                      position: 'absolute',
                      left: 0, right: 0,
                      top: `${g.position * zoom}px`,
                      height: '1px',
                      background: color,
                      boxShadow: `0 0 4px ${color}`,
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>

        <div className="absolute bottom-1 right-1 text-[10px] text-gray-600 font-mono pointer-events-none">
          {width}×{height}
        </div>
      </div>

      {/* Rulers — top + left edges of the leaf, tick-aligned with the artboard.
          Pass the selected layer's AABB (in composition px) so the rulers
          can render the blue band + dashed alignment guides. Rotated layers
          report their unrotated bbox for now (matches "object's local
          extents" — most tools' default behaviour). */}
      {showRulers && containerRef.current && (
        <Rulers
          composition={{ width, height }}
          zoom={zoom}
          pan={pan}
          containerEl={containerRef.current}
          selectedRect={
            selectedLayer && !selectedLayer.hidden
              ? {
                  x: selectedLayer.transform.x,
                  y: selectedLayer.transform.y,
                  width:  selectedLayer.size?.width
                          ?? (selectedLayer.text?.fontSize ? 120 : 80),
                  height: selectedLayer.size?.height
                          ?? (selectedLayer.text?.fontSize ?? 24),
                }
              : undefined
          }
        />
      )}

      {/* Top-right controls: View + Snap dropdowns (SVGator-style) */}
      <div className="absolute top-3 right-3 flex items-center gap-2 select-none z-30">
        <ViewMenu
          showRulers={showRulers}     onToggleRulers={() => setShowRulers((v) => !v)}
          gridInFront={gridInFront}   onToggleGridFront={() => setGridInFront((v) => !v)}
          showGuides={showGuides}     onToggleGuides={() => setShowGuides((v) => !v)}
        />
        <SnapMenu
          enabled={snapEnabled}     onToggleEnabled={() => snap.setEnabled(!snapEnabled)}
          toObjects={snapToObjects} onToggleObjects={() => snap.setTarget('objects', !snapToObjects)}
          toPoints={snapToPoints}   onTogglePoints={()  => snap.setTarget('points',  !snapToPoints)}
          toGuides={snapToGuides}   onToggleGuides={()  => snap.setTarget('guides',  !snapToGuides)}
          toGrid={snapToGridOn}     onToggleGrid={()    => snap.setTarget('grid',    !snapToGridOn)}
          toPixel={snapToPixel}     onTogglePixel={()   => snap.setTarget('pixel',   !snapToPixel)}
          gridSize={gridSize}       onGridSizeChange={snap.setGridSize}
        />
      </div>

      {/* Bottom-right controls: zoom pill */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 select-none">
        {/* Zoom + pan pill */}
        <div className="flex items-center gap-1 bg-gray-900/90 border border-gray-700
                        rounded px-2 py-1 text-xs font-mono text-gray-300">
          <button
            onClick={() => setPanMode((p) => !p)}
            title="Pan mode — drag the view instead of objects (middle-mouse always pans)"
            className={`px-1.5 py-0.5 rounded transition-colors
              ${panMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'text-gray-400 hover:bg-gray-700'}`}
          >
            ✋
          </button>
          <span className="w-px h-3 bg-gray-700 mx-0.5" />
          <button onClick={() => setZoom((z) => clamp(z / ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
            className="px-1.5 py-0.5 rounded hover:bg-gray-700" title="Zoom out (Cmd+scroll)">−</button>
          <button onClick={actualSize}
            className="min-w-[42px] text-center px-1.5 py-0.5 rounded hover:bg-gray-700" title="Reset to 100% + recentre">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoom((z) => clamp(z * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
            className="px-1.5 py-0.5 rounded hover:bg-gray-700" title="Zoom in (Cmd+scroll)">+</button>
          <span className="w-px h-3 bg-gray-700 mx-0.5" />

          {/* Fit dropdown — opens upward */}
          <div ref={fitMenuRef} className="relative">
            <button
              onClick={() => setFitMenuOpen((o) => !o)}
              className="px-1.5 py-0.5 rounded hover:bg-gray-700 flex items-center gap-0.5"
              title="View / fit options"
            >
              Fit <span className="text-[8px]">▾</span>
            </button>
            {fitMenuOpen && (
              <FitMenu
                hasSelection={!!selectedLayer && !selectedLayer.hidden}
                fullscreen={!!fullscreen}
                onPick={(action) => { setFitMenuOpen(false); action() }}
                actions={{
                  fitAll, fitWidth, fitHeight, actualSize,
                  fitSelection, centreSelection,
                  zoom50:  () => zoomTo(0.5),
                  zoom200: () => zoomTo(2),
                  zoom400: () => zoomTo(4),
                  toggleFullscreen: onToggleFullscreen,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Hint banner — context-aware to which mode is active */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-500 pointer-events-none
                      bg-gray-900/70 px-2 py-0.5 rounded whitespace-nowrap">
        {panMode
          ? '✋ Pan mode · drag ANYWHERE on the leaf to pan (click ✋ again to turn off)'
          : 'Drag = move · Shift = axis-lock · Handles to resize · ⌘ = aspect-lock · ⌘+scroll = zoom · Mid-mouse = pan'}
      </div>

      {/* ── Right-click context menu ─────────────────────────────────────────
          Built each render from the latest layer state so toggled flags
          (lock/hide) and selection size update the menu in real time. */}
      {ctxMenu.isOpen && ctxTargetLayerId && (() => {
        const target = scene.layers.find((l) => l.id === ctxTargetLayerId)
        if (!target) { ctxMenu.close(); return null }
        const handlers: CanvasMenuHandlers = {
          // ── Page-injected handlers (clipboard, group, animate, align) ───
          cut:        menuHandlers?.cut,
          copy:       menuHandlers?.copy,
          paste:      menuHandlers?.paste,
          duplicate:  menuHandlers?.duplicate,
          group:      menuHandlers?.group,
          ungroup:    menuHandlers?.ungroup,
          deleteLayer: menuHandlers?.deleteLayer,
          animateProperty: menuHandlers?.animateProperty,
          alignLeft:   menuHandlers?.alignLeft,
          alignCenter: menuHandlers?.alignCenter,
          alignRight:  menuHandlers?.alignRight,
          alignTop:    menuHandlers?.alignTop,
          alignMiddle: menuHandlers?.alignMiddle,
          alignBottom: menuHandlers?.alignBottom,
          distributeHorizontally: menuHandlers?.distributeHorizontally,
          distributeVertically:   menuHandlers?.distributeVertically,
          // BL-17 Faz 1 — wired only for shape layers with a size; non-shape
          // selections leave it undefined, which the menu renders disabled.
          convertToPath:
            target.type === 'text' && menuHandlers?.convertTextToSpline
              ? menuHandlers.convertTextToSpline
              : menuHandlers?.convertToSpline && target.type === 'shape' && target.size
                ? menuHandlers.convertToSpline
                : undefined,

          // BL-59 — Clone & Array entries
          cloneQuick:    menuHandlers?.cloneQuick,
          cloneSettings: menuHandlers?.cloneSettings,
          arraySettings: menuHandlers?.arraySettings,
          selectAllInArray: menuHandlers?.selectAllInArray
            ? () => menuHandlers!.selectAllInArray!(target.id)
            : undefined,
          isArrayMember: menuHandlers?.isLayerInArray?.(target.id) ?? false,
          cloneAlignToSelected: menuHandlers?.cloneAlignToSelected
            ? () => menuHandlers!.cloneAlignToSelected!(target.id)
            : undefined,
          bakeRepeater: menuHandlers?.bakeRepeater && target.type === 'repeater'
            ? () => menuHandlers!.bakeRepeater!(target.id)
            : undefined,
          isRepeater: target.type === 'repeater',

          // BL-67 — Motion path assignment. Page lifts pick-mode state so the
          // overlay can render the dashed pickable paths across the canvas.
          assignMotionPath: menuHandlers?.assignMotionPath,

          // ── Locally implemented (no page state needed) ──────────────────
          centerOrigin: () => editor.dispatchCommand(
            makeUpdateLayerCmd(target.id, centerOrigin(target), target),
          ),
          rotate90CW:  () => editor.dispatchCommand(
            makeUpdateLayerCmd(target.id, rotate90CW(target),  target),
          ),
          rotate90CCW: () => editor.dispatchCommand(
            makeUpdateLayerCmd(target.id, rotate90CCW(target), target),
          ),
          flipHorizontal: () => editor.dispatchCommand(
            makeUpdateLayerCmd(target.id, flipHorizontal(target), target),
          ),
          flipVertical:   () => editor.dispatchCommand(
            makeUpdateLayerCmd(target.id, flipVertical(target),   target),
          ),
          toggleLock: () => editor.dispatchCommand(
            makeUpdateLayerCmd(target.id, { ...target, locked: !target.locked }, target),
          ),

          // ── Z-order (in-place layer array reorder) ──────────────────────
          bringForward: () => moveLayerZ(scene, editor, target.id, +1),
          bringToFront: () => moveLayerZ(scene, editor, target.id, +999),
          sendBackward: () => moveLayerZ(scene, editor, target.id, -1),
          sendToBack:   () => moveLayerZ(scene, editor, target.id, -999),
        }
        const multiCount = selectedLayerIds?.size ?? (selectedLayerId ? 1 : 0)
        const items = buildCanvasMenu({
          layer:      target,
          multiCount,
          canUngroup: menuHandlers?.canUngroup ?? false,
          canPaste:   menuHandlers?.canPaste   ?? false,
          handlers,
        })
        return (
          <ContextMenu
            x={ctxMenu.state!.x}
            y={ctxMenu.state!.y}
            items={items}
            onClose={() => { ctxMenu.close(); setCtxTargetLayerId(null) }}
          />
        )
      })()}

      {/* ── Empty-canvas right-click → fit / zoom shortcuts ─────────────── */}
      {emptyCanvasCtx.isOpen && (() => {
        const hasSel = !!selectedLayerId
        const close  = emptyCanvasCtx.close
        const items: import('./ui/ContextMenu').MenuItem[] = [
          { kind: 'action', label: 'Fit to View',   shortcut: 'F',   onSelect: () => { fitAll();         close() } },
          { kind: 'action', label: 'Fit Width',                       onSelect: () => { fitWidth();       close() } },
          { kind: 'action', label: 'Fit Height',                      onSelect: () => { fitHeight();      close() } },
          { kind: 'action', label: 'Actual Size',   shortcut: '1',   onSelect: () => { actualSize();     close() } },
          { kind: 'separator' },
          { kind: 'submenu', label: 'Zoom', items: [
            { kind: 'action', label: '25%',  onSelect: () => { zoomTo(0.25); close() } },
            { kind: 'action', label: '50%',  onSelect: () => { zoomTo(0.50); close() } },
            { kind: 'action', label: '75%',  onSelect: () => { zoomTo(0.75); close() } },
            { kind: 'action', label: '100%', onSelect: () => { zoomTo(1.00); close() } },
            { kind: 'action', label: '150%', onSelect: () => { zoomTo(1.50); close() } },
            { kind: 'action', label: '200%', onSelect: () => { zoomTo(2.00); close() } },
          ]},
          { kind: 'separator' },
          { kind: 'action', label: 'Fit Selection',    shortcut: '⇧2', disabled: !hasSel, onSelect: () => { fitSelection();    close() } },
          { kind: 'action', label: 'Centre Selection',                  disabled: !hasSel, onSelect: () => { centreSelection(); close() } },
        ]
        return (
          <ContextMenu
            x={emptyCanvasCtx.state!.x}
            y={emptyCanvasCtx.state!.y}
            items={items}
            onClose={close}
          />
        )
      })()}

      {/* ── BL-73 — Spline point / segment / contour editing menu ─────────── */}
      {splineCtx.isOpen && (() => {
        const target = splineCtxTargetRef.current
        const layer = scene.layers.find((l) => l.id === selectedLayerId)
        if (!target || layer?.type !== 'spline' || !layer.spline) return null
        const close = () => { splineCtx.close(); splineCtxTargetRef.current = null }
        const baseSpline = layer.spline
        const mutate = (fn: (s: import('@/lib/types/spline').SplinePathData) => import('@/lib/types/spline').SplinePathData) => {
          const next = fn(baseSpline)
          if (next && next !== baseSpline) {
            editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { spline: next }, layer))
          }
          close()
        }
        let items: import('./ui/ContextMenu').MenuItem[]
        if (target.kind === 'point') {
          items = [
            { kind: 'action', label: 'Corner',          onSelect: () => mutate(s => setSplinePointType(s, target.id, 'corner')) },
            { kind: 'action', label: 'Smooth',          onSelect: () => mutate(s => setSplinePointType(s, target.id, 'smooth')) },
            { kind: 'action', label: 'Bezier (Mirror)', onSelect: () => mutate(s => setSplinePointType(s, target.id, 'bezier')) },
            { kind: 'action', label: 'Bezier Corner',   onSelect: () => mutate(s => setSplinePointType(s, target.id, 'bezierCorner')) },
            { kind: 'separator' },
            { kind: 'action', label: 'Delete Point',    onSelect: () => mutate(s => deleteSplinePoint(s, target.id)) },
          ]
        } else if (target.kind === 'segment') {
          items = [
            { kind: 'action', label: 'Insert Point',      onSelect: () => mutate(s => insertPointOnSegment(s, target.id, target.t)) },
            { kind: 'action', label: 'Convert to Line',   onSelect: () => mutate(s => setSegmentType(s, target.id, 'line')) },
            { kind: 'action', label: 'Convert to Bezier', onSelect: () => mutate(s => setSegmentType(s, target.id, 'cubic')) },
          ]
        } else {
          const contour = layer.spline.contours[target.id]
          items = [
            { kind: 'action', label: contour?.closed ? 'Open Path' : 'Close Path', onSelect: () => mutate(s => setContourClosed(s, target.id, !contour?.closed)) },
            { kind: 'action', label: 'Reverse Direction', onSelect: () => mutate(s => reverseContour(s, target.id)) },
          ]
        }
        return (
          <ContextMenu
            x={splineCtx.state!.x}
            y={splineCtx.state!.y}
            items={items}
            onClose={close}
          />
        )
      })()}
    </div>
  )
}

// ── Z-order helper ────────────────────────────────────────────────────────
// Single source of truth for "bring forward / send to back" so the four menu
// items share the same clamp + command construction. delta of ±999 is the
// idiomatic way to ask for the end of the array without exposing the length
// to the caller.
function moveLayerZ(
  scene:   ChronoScene,
  editor:  EditorStateReturn,
  layerId: string,
  delta:   number,
) {
  const from = scene.layers.findIndex((l) => l.id === layerId)
  if (from < 0) return
  const to = Math.max(0, Math.min(scene.layers.length - 1, from + delta))
  if (to === from) return
  // Re-use the existing reorder command from the layer-list path so the
  // undo/redo entry is consistent regardless of how the user triggered it.
  import('@/lib/editor/commands-layer').then(({ makeMoveLayerCmd }) => {
    editor.dispatchCommand(makeMoveLayerCmd(layerId, from, to))
  })
}
