'use client'
import {
  useRef, useEffect, useCallback, useState, useLayoutEffect, useMemo,
} from 'react'
import type { ChronoScene, Layer, BezierPath, Timeline } from '@/lib/types'
import type { TimelineGhostSettings } from '@/lib/types/editor'
import { hitTestLayer, hitTestLayersAt, bezierPathBounds, type AssetElementMap } from '@/lib/renderer'
import { resolveInstanceLayer } from '@/lib/clone/InstanceResolver'
import { resolveDisplayTransform } from '@/lib/render/resolveDisplayTransform'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'
import { getMultiLayerGhostFrames } from '@/lib/animation/ghostFrames'
import { updateLayerProperty } from '@/lib/editor/autoKeyframe'
import { makeUpdateLayerCmd, makeAddLayerCmd } from '@/lib/editor/commands-layer'
import { makeCloneCmd, type CloneArrayCommand } from '@/lib/editor/commands-clone'
import type { CloneMode } from '@/lib/clone/CloneTypes'
// BL-73 — Spline drawing tools
import type { SplinePrimitiveKind } from '@/lib/types/spline'
import {
  splineParamsFromBox, isBoxDragKind, createPolylineSpline,
  createSplinePrimitive, splineToPathDefinition, translateSplineData, mergeSplineData,
} from '@/lib/spline'
import { newSplineLayerFromPrimitive, newSplineLayerFromData } from '@/lib/defaults'
import { pathToSvgString } from '@/lib/geometry'
import {
  hitTestPath, hitTestSegment, insertAnchorOnSegment, togglePathClosed,
  moveAnchor, moveInHandle, moveOutHandle,
} from '@/lib/path/pathOps'
import {
  layersInRect, layersInCircle, layersInPolygon, layersUnderPaintBrush,
} from '@/lib/selection/canvasShapes'
import type { Guide } from '@/lib/snap/AlignmentGuides'
import { SnapEngine, type SnapEngineSettings } from '@/lib/snap/SnapEngine'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { SnapSettingsHook } from '@/app/hooks/useSnapSettings'
import MotionPathOverlay from './MotionPathOverlay'
import PathGuideOverlay from './PathGuideOverlay'
import PathEditOverlay from './PathEditOverlay'
import ContextMenu, { useContextMenu } from './ui/ContextMenu'
import { buildCanvasMenu, type CanvasMenuHandlers } from './canvas/buildCanvasMenu'
import {
  rotate90CW, rotate90CCW, flipHorizontal, flipVertical, centerOrigin,
} from '@/lib/editor/layerTransforms'

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

type Handle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

interface MoveState {
  kind: 'move'
  /** Primary (the layer actually clicked). Used for snapshot + selection focus. */
  layerId: string
  originalLayer: Layer
  /** All layers being moved together — primary + multi-selection peers. */
  movingLayers: { id: string; originalLayer: Layer }[]
  startClientX: number
  startClientY: number
  width:  number
  height: number
  /** Forced single-axis constraint (Move-mode axis arrows). Null = free.
   *  Distinct from Shift-while-dragging which dynamically picks the
   *  dominant axis — this is a hard lock set by the user clicking an arrow. */
  axisLock?: 'x' | 'y' | null
  /** Clone-drag (Cmd/Ctrl held at drag start). When set, the move is treated
   *  as a clone gesture: the original is dragged for live feedback, then on
   *  release a clone is created at the drop offset and the original snaps back
   *  to its start position — all in ONE undo step. Undefined = normal move. */
  cloneMode?: CloneMode
}

interface ResizeState {
  kind: 'resize'
  layerId: string
  originalLayer: Layer
  handle: Handle
  startClientX: number
  startClientY: number
}

interface AnchorState {
  kind: 'anchor'
  layerId: string
  originalLayer: Layer
  startClientX: number
  startClientY: number
}

/** Rotation drag — rotates the layer (or multi-select group) around a pivot. */
interface RotateState {
  kind: 'rotate'
  layerId: string
  originalLayer: Layer
  /** Pointer position at drag start (shared with other drag kinds). */
  startClientX: number
  startClientY: number
  /** Initial angle (degrees) from anchor to pointer at drag start. */
  startAngle: number
  /** Original rotation (degrees) so we can add the delta on top. */
  originalRotation: number
  /** World coords of the layer's anchor (rotation pivot). */
  anchorWorldX: number
  anchorWorldY: number
  /** BL-03: When set, the drag rotates EVERY layer here around the common
   *  pivot (anchorWorldX/Y, which is the selection center). Each layer's
   *  origin is stored so the rotated position is computed from a stable
   *  snapshot, not the live (intermediate-render) value. */
  multiLayerOrigins?: Array<{
    layerId: string
    originalLayer: Layer
    originalX: number
    originalY: number
    originalRotation: number
  }>
}

interface PathPointDrag {
  kind: 'pathPoint'
  layerId: string
  originalLayer: Layer
  startClientX: number
  startClientY: number
  /** Index of the anchor being moved in layer.path.anchors */
  anchorIndex: number
  /** Which part of the anchor is being moved */
  part: 'anchor' | 'inHandle' | 'outHandle'
}

/**
 * BL-66 — Pen Tool: placing a new anchor.
 *
 * On mousedown in pen mode (no hit), we begin a transaction and append a
 * provisional corner anchor at the click point. As the user drags, we
 * upgrade it to a smooth anchor with bezier handles (outHandle at the
 * cursor, inHandle mirrored). On mouseup with drag distance ≤ 5px we
 * commit a corner; otherwise we commit the smooth anchor.
 */
interface NewAnchorDrawDrag {
  kind: 'newAnchorDraw'
  layerId: string
  originalLayer: Layer
  /** Layer-local anchor position (where the user clicked). */
  anchorX: number
  anchorY: number
  /** Client-space mousedown position to compute drag distance. */
  startClientX: number
  startClientY: number
  /** Index of the anchor that was provisionally appended. */
  anchorIndex: number
}

/** Scale-mode axis gizmo drag — modifies transform.scaleX / scaleY
 *  rather than the layer's width/height (which is what ResizeState does). */
interface ScaleAxisState {
  kind: 'scaleAxis'
  layerId: string
  originalLayer: Layer
  /** Which axis the user grabbed: x / y / both (centre uniform). */
  axis: 'x' | 'y' | 'both'
  startClientX: number
  startClientY: number
  /** BL-03: When set, the drag scales EVERY layer here around (pivotX, pivotY).
   *  Each layer's origin snapshot is captured at drag start so positions are
   *  recomputed from a stable baseline. */
  multiLayerOrigins?: Array<{
    layerId: string
    originalLayer: Layer
    originalX: number
    originalY: number
    originalScaleX: number
    originalScaleY: number
  }>
  pivotX?: number
  pivotY?: number
}

type ActiveDrag = MoveState | ResizeState | AnchorState | PathPointDrag | NewAnchorDrawDrag | RotateState | ScaleAxisState

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function snapToGrid(v: number, step: number): number {
  if (step <= 0) return v
  return Math.round(v / step) * step
}

const HANDLE_CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  n:  'ns-resize',   s:  'ns-resize',
  e:  'ew-resize',   w:  'ew-resize',
}

export default function SceneCanvas({
  scene, editor, timeMs, selectedLayerId, selectedLayerIds, assets, onSelectLayer,
  overrides, paramValues, previewMode, onLayerClickInPreview, onLayerDragInPreview,
  panMode: controlledPanMode, onPanModeChange, toolMode, onToolModeChange, snap,
  onSelectByGeometry, selectionContainMode = 'touching',
  fullscreen, onToggleFullscreen,
  menuHandlers, onAfterLayerCommit,
  ghostSettings, selectedTimeline,
  pathPickMode = null, onAssignPath, onExitPathPickMode,
  splineDrawKind = null, splineAppendTargetId = null, onSplineDrawCommit,
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

  const dragRef = useRef<ActiveDrag | null>(null)

  // BL-03: Pen-tool close-path double-click detection. First click on the
  // path's first anchor stores the timestamp; a second click within 350ms
  // on the same anchor triggers togglePathClosed instead of starting a drag.
  const closePathClickRef = useRef<{ layerId: string; timeMs: number } | null>(null)

  // BL-60 Faz 3 — Canvas selection-tool drag state. ref stores the live
  // shape (mutated continuously without re-render) and the modifier mode;
  // a separate React state mirrors enough of it to drive the SVG overlay
  // render.
  const selectionDragRef = useRef<{
    tool: 'box' | 'lasso' | 'circle' | 'paint'
    mode: 'replace' | 'add' | 'subtract'
    startX: number; startY: number
    /** For lasso/paint — every point the cursor visited. */
    points: Array<{ x: number; y: number }>
    /** Accumulated paint-mode selection (built across pointermove). */
    paintAcc: Set<string>
  } | null>(null)
  const [selectionOverlay, setSelectionOverlay] = useState<
    | { kind: 'box',    x: number; y: number; w: number; h: number }
    | { kind: 'circle', cx: number; cy: number; r: number }
    | { kind: 'lasso',  points: Array<{ x: number; y: number }> }
    | { kind: 'paint',  cx: number; cy: number; r: number }
    | null
  >(null)
  const PAINT_BRUSH_RADIUS = 24  // composition px

  // ── BL-73 Spline drawing state ───────────────────────────────────────────
  // Box-drag (rect/circle/ellipse/star/ngon/donut/arc): start corner held in
  // a ref; the live preview svg path is mirrored to React state. Line draw:
  // accumulated click points persist across discrete clicks.
  const splineBoxRef  = useRef<{ startX: number; startY: number } | null>(null)
  const splineLineRef = useRef<{ points: Array<{ x: number; y: number }> } | null>(null)
  /** Preview path in composition coords (scaled by zoom at render). */
  const [splinePreview, setSplinePreview] = useState<{ d: string; fill: boolean } | null>(null)
  // Mirror props into refs so window-listener closures read fresh values.
  const splineDrawKindRef = useRef(splineDrawKind)
  useEffect(() => { splineDrawKindRef.current = splineDrawKind }, [splineDrawKind])
  const splineAppendTargetIdRef = useRef(splineAppendTargetId)
  useEffect(() => { splineAppendTargetIdRef.current = splineAppendTargetId }, [splineAppendTargetId])
  const onSplineDrawCommitRef = useRef(onSplineDrawCommit)
  useEffect(() => { onSplineDrawCommitRef.current = onSplineDrawCommit }, [onSplineDrawCommit])

  // ── Drag-time numeric HUD (position / rotation / size readout) ───────────
  // Mirrors AE / Figma — appears next to the cursor while transforming.
  const [dragHud, setDragHud] = useState<{ x: number; y: number; label: string } | null>(null)

  // ── Pointer handlers shared by move + resize (window-level) ──────────────
  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const { sx, sy } = pxScale.current
    const dx = (e.clientX - drag.startClientX) * sx
    const dy = (e.clientY - drag.startClientY) * sy
    const { width: cw, height: ch } = compositionRef.current

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
      let dxLocked = dx, dyLocked = dy
      // Hard axis lock from Move-mode arrows beats Shift's dominant-axis logic.
      if (drag.axisLock === 'x')      dyLocked = 0
      else if (drag.axisLock === 'y') dxLocked = 0
      else if (e.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dyLocked = 0
        else                              dxLocked = 0
      }
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
      // uniform regardless of which arrow was grabbed.
      const SENS = 100
      const fx = 1 + dx / SENS
      const fy = 1 + dy / SENS
      const axis = e.shiftKey ? 'both' : drag.axis
      let factorX = 1, factorY = 1
      if (axis === 'x')    factorX = fx
      if (axis === 'y')    factorY = fy
      if (axis === 'both') {
        // Uniform: prefer the dominant axis direction so the drag feels
        // natural whether the user moves diagonally or mostly one way.
        const f = Math.abs(dx) >= Math.abs(dy) ? fx : fy
        factorX = f
        factorY = f
      }
      // Clamp to prevent flipping past zero (Min 0.05 keeps tiny shapes
      // still selectable). Applied to the FINAL scale below.

      if (drag.multiLayerOrigins && drag.multiLayerOrigins.length > 0
          && drag.pivotX != null && drag.pivotY != null) {
        // BL-03: multi-select scale around common pivot. Each layer's
        // position-offset from pivot is multiplied by the factor so layers
        // both grow AND spread out (or shrink and pull in).
        let scene = sceneRef.current
        for (const o of drag.multiLayerOrigins) {
          const ax = o.originalX + o.originalLayer.transform.anchorX
          const ay = o.originalY + o.originalLayer.transform.anchorY
          const ox = (ax - drag.pivotX) * factorX
          const oy = (ay - drag.pivotY) * factorY
          const nx = (drag.pivotX + ox) - o.originalLayer.transform.anchorX
          const ny = (drag.pivotY + oy) - o.originalLayer.transform.anchorY
          const nsx = Math.max(0.05, o.originalScaleX * factorX)
          const nsy = Math.max(0.05, o.originalScaleY * factorY)
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
        const nsx = Math.max(0.05, o.scaleX * factorX)
        const nsy = Math.max(0.05, o.scaleY * factorY)
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
      const dxA = wx - drag.anchorWorldX
      const dyA = wy - drag.anchorWorldY
      const curAngle = (Math.atan2(dyA, dxA) * 180) / Math.PI
      let delta = curAngle - drag.startAngle
      if (e.shiftKey) delta = Math.round(delta / 15) * 15

      if (drag.multiLayerOrigins && drag.multiLayerOrigins.length > 0) {
        // BL-03: multi-select rotation around common pivot.
        const rad = (delta * Math.PI) / 180
        const cos = Math.cos(rad), sin = Math.sin(rad)
        let scene = sceneRef.current
        for (const o of drag.multiLayerOrigins) {
          // Anchor of this layer at drag start (its rotation pivot for translation)
          const ax = o.originalX + o.originalLayer.transform.anchorX
          const ay = o.originalY + o.originalLayer.transform.anchorY
          const ox = ax - drag.anchorWorldX
          const oy = ay - drag.anchorWorldY
          const nx = drag.anchorWorldX + ox * cos - oy * sin
          const ny = drag.anchorWorldY + ox * sin + oy * cos
          // Apply rotated translation + cumulative rotation
          let rot = o.originalRotation + delta
          while (rot > 180)  rot -= 360
          while (rot < -180) rot += 360
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
        let nextRot = drag.originalRotation + delta
        while (nextRot > 180)  nextRot -= 360
        while (nextRot < -180) nextRot += 360
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
      // local axis (so the grid you see on canvas still aligns 1:1).
      const orig = drag.originalLayer.transform
      const origAX = orig.anchorX
      const origAY = orig.anchorY
      let nAX = origAX + dx
      let nAY = origAY + dy
      if (snap.grid) {
        // Snap the WORLD position of the anchor to the grid, then translate
        // back to local coords. That way the visible anchor handle lands
        // exactly on a grid line.
        const wx = orig.x + nAX
        const wy = orig.y + nAY
        nAX = snapToGrid(wx, snap.size) - orig.x
        nAY = snapToGrid(wy, snap.size) - orig.y
      }
      if (snap.pixel) {
        nAX = Math.round(nAX)
        nAY = Math.round(nAY)
      }

      // Visual-preserving compensation — when the layer is rotated/scaled,
      // changing the anchor moves the rendered pivot which shifts every
      // pixel. Counter that by translating transform.x/y so the layer
      // stays visually pinned. (Derived from: screenP = T + A + R·S·(P − A);
      // solving for new T that keeps screenP fixed for any P.)
      const r  = (orig.rotationDeg * Math.PI) / 180
      const cR = Math.cos(r), sR = Math.sin(r)
      const sx = orig.scaleX, sy = orig.scaleY
      const dAX = nAX - origAX
      const dAY = nAY - origAY
      const compX = dAX * (sx * cR - 1) - sy * sR * dAY
      const compY = sx * sR * dAX + dAY * (sy * cR - 1)
      const nX = orig.x + compX
      const nY = orig.y + compY

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
    const layer = drag.originalLayer
    if (!layer.size) return
    const proportional = e.metaKey || e.ctrlKey  // Cmd/Ctrl → aspect-lock

    const ox = layer.transform.x, oy = layer.transform.y
    const ow = layer.size.width,   oh = layer.size.height
    const h  = drag.handle

    let nx = ox, ny = oy, nw = ow, nh = oh
    // Per-handle raw deltas
    if (h === 'e' || h === 'ne' || h === 'se') nw = ow + dx
    if (h === 'w' || h === 'nw' || h === 'sw') { nw = ow - dx; nx = ox + dx }
    if (h === 's' || h === 'sw' || h === 'se') nh = oh + dy
    if (h === 'n' || h === 'nw' || h === 'ne') { nh = oh - dy; ny = oy + dy }

    // Aspect-lock when Cmd/Ctrl held — use the dominant fractional change
    if (proportional && ow > 0 && oh > 0) {
      const aspect = ow / oh
      const wRatio = nw / ow
      const hRatio = nh / oh
      const useWidth = Math.abs(wRatio - 1) >= Math.abs(hRatio - 1)
      if (useWidth) nh = Math.max(MIN_SIZE, nw / aspect)
      else          nw = Math.max(MIN_SIZE, nh * aspect)
      // Re-anchor x/y on handles that pull from top/left
      if (h === 'nw' || h === 'sw' || h === 'w') nx = ox + (ow - nw)
      if (h === 'nw' || h === 'ne' || h === 'n') ny = oy + (oh - nh)
    }

    // Minimum size + composition-bounds clamp
    nw = Math.max(MIN_SIZE, nw)
    nh = Math.max(MIN_SIZE, nh)

    // ── Snap to Pixel during resize → integer position + integer dim ──────
    // Grid/Object snap is intentionally NOT applied to resize (the moving
    // EDGE has no canonical "rect" to snap relative to and grid-snapping
    // each axis independently produces jarring jumps). Pixel is fine.
    if (snap.pixel) {
      nx = Math.round(nx); ny = Math.round(ny)
      nw = Math.round(nw); nh = Math.round(nh)
    }

    nx = clamp(nx, 0, Math.max(0, cw - nw))
    ny = clamp(ny, 0, Math.max(0, ch - nh))
    nw = Math.min(nw, cw - nx)
    nh = Math.min(nh, ch - ny)

    // ── Preserve anchor's PROPORTIONAL position across resize ──────────
    // If the user placed the anchor visually (e.g. at the centre at 50/100),
    // resizing 100→200 should keep it at 50% width (= new 100, not stuck
    // at the original 50). Without this, scaling shifts the rotation pivot
    // and breaks the user's mental model.
    const oax = layer.transform.anchorX
    const oay = layer.transform.anchorY
    const fx  = ow > 0 ? oax / ow : 0.5
    const fy  = oh > 0 ? oay / oh : 0.5
    const nax = fx * nw
    const nay = fy * nh

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
  }, [])

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

  // ── BL-60 Faz 3 — Canvas selection-tool drag handlers (move + up) ───────
  // Defined before handleCanvasPointerDown so the callback dep array can
  // reference them. Mutates selectionDragRef live; mirrors a slice to React
  // state every move so the SVG overlay re-renders.
  const handleSelectionDragMove = useCallback((e: PointerEvent) => {
    const drag = selectionDragRef.current
    if (!drag) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = width  / rect.width
    const sy = height / rect.height
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy

    switch (drag.tool) {
      case 'box': {
        const x = Math.min(drag.startX, cx)
        const y = Math.min(drag.startY, cy)
        const w = Math.abs(cx - drag.startX)
        const h = Math.abs(cy - drag.startY)
        setSelectionOverlay({ kind: 'box', x, y, w, h })
        break
      }
      case 'circle': {
        const r = Math.hypot(cx - drag.startX, cy - drag.startY)
        setSelectionOverlay({ kind: 'circle', cx: drag.startX, cy: drag.startY, r })
        break
      }
      case 'lasso': {
        // Skip if too close to last point (prevents thousands of useless verts)
        const last = drag.points[drag.points.length - 1]
        if (Math.hypot(cx - last.x, cy - last.y) >= 3) {
          drag.points.push({ x: cx, y: cy })
          setSelectionOverlay({ kind: 'lasso', points: drag.points.slice() })
        }
        break
      }
      case 'paint': {
        const hits = layersUnderPaintBrush(sceneRef.current, { x: cx, y: cy }, PAINT_BRUSH_RADIUS)
        hits.forEach((id) => drag.paintAcc.add(id))
        setSelectionOverlay({ kind: 'paint', cx, cy, r: PAINT_BRUSH_RADIUS })
        break
      }
    }
  }, [width, height])

  const handleSelectionDragUp = useCallback((e: PointerEvent) => {
    const drag = selectionDragRef.current
    if (!drag) return
    const canvas = canvasRef.current
    canvas?.releasePointerCapture(e.pointerId)
    window.removeEventListener('pointermove', handleSelectionDragMove)
    window.removeEventListener('pointerup',   handleSelectionDragUp)

    const containMode = selectionContainMode
    let hits: Set<string> = new Set()
    switch (drag.tool) {
      case 'box': {
        const last = drag.points[0]
        const rect2 = canvasRef.current?.getBoundingClientRect()
        if (!rect2) break
        const sx = width  / rect2.width
        const sy = height / rect2.height
        const cx = (e.clientX - rect2.left) * sx
        const cy = (e.clientY - rect2.top)  * sy
        const x = Math.min(last.x, cx), y = Math.min(last.y, cy)
        const w = Math.abs(cx - last.x), h = Math.abs(cy - last.y)
        hits = layersInRect(sceneRef.current, { x, y, w, h }, containMode)
        break
      }
      case 'circle': {
        const rect2 = canvasRef.current?.getBoundingClientRect()
        if (!rect2) break
        const sx = width  / rect2.width
        const sy = height / rect2.height
        const cx = (e.clientX - rect2.left) * sx
        const cy = (e.clientY - rect2.top)  * sy
        const r = Math.hypot(cx - drag.startX, cy - drag.startY)
        hits = layersInCircle(sceneRef.current, { x: drag.startX, y: drag.startY, r }, containMode)
        break
      }
      case 'lasso': {
        if (drag.points.length >= 3) {
          hits = layersInPolygon(sceneRef.current, drag.points, containMode)
        }
        break
      }
      case 'paint': {
        // Paint is always 'touching' semantics — accumulates as user sweeps.
        hits = drag.paintAcc
        break
      }
    }

    onSelectByGeometry?.(hits, drag.mode)
    selectionDragRef.current = null
    setSelectionOverlay(null)
  }, [width, height, onSelectByGeometry, handleSelectionDragMove, selectionContainMode])

  // ── BL-73 Spline drawing handlers ────────────────────────────────────────
  // Composition-pixel coords from a pointer event.
  const clientToComp = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const { width: cw, height: ch } = compositionRef.current
    return {
      x: (e.clientX - rect.left) * (cw / rect.width),
      y: (e.clientY - rect.top)  * (ch / rect.height),
    }
  }, [])

  /** Tears down any in-progress spline draw and notifies the page. */
  const cancelSplineDraw = useCallback(() => {
    splineBoxRef.current  = null
    splineLineRef.current = null
    setSplinePreview(null)
    setDragHud(null)
    window.removeEventListener('pointermove', handleSplineBoxMove)
    window.removeEventListener('pointerup',   handleSplineBoxUp)
    window.removeEventListener('pointermove', handleSplineLineMove)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Commits a freshly-built layer, or appends geometry to the target layer. */
  const commitDrawnSpline = useCallback((
    kind: SplinePrimitiveKind,
    params: import('@/lib/types/spline').SplineGeneratorParams,
    centerX: number,
    centerY: number,
  ) => {
    const targetId = splineAppendTargetIdRef.current
    const target = targetId ? sceneRef.current.layers.find(l => l.id === targetId) : null

    if (target?.type === 'spline' && target.spline) {
      // Append into the selected spline, offset so it lands where drawn.
      const gen = createSplinePrimitive({ kind, params })
      if (gen) {
        const placed = translateSplineData(gen, centerX - target.transform.x, centerY - target.transform.y)
        const merged = mergeSplineData(target.spline, placed)
        editorRef.current.dispatchCommand(makeUpdateLayerCmd(target.id, { spline: merged }, target))
      }
    } else {
      const base = newSplineLayerFromPrimitive(kind, params)
      if (base) {
        base.transform.x = centerX
        base.transform.y = centerY
        editorRef.current.dispatchCommand(makeAddLayerCmd(base))
        onSelectLayer(base.id)
      }
    }
    onSplineDrawCommitRef.current?.()
  }, [onSelectLayer])

  const handleSplineBoxMove = useCallback((e: PointerEvent) => {
    const box = splineBoxRef.current
    const kind = splineDrawKindRef.current
    if (!box || !kind) return
    const p = clientToComp(e)
    if (!p) return
    const spec = splineParamsFromBox(kind, { x1: box.startX, y1: box.startY, x2: p.x, y2: p.y })
    if (!spec) return
    const gen = createSplinePrimitive({ kind, params: spec.params })
    if (!gen) return
    const placed = translateSplineData(gen, spec.centerX, spec.centerY)
    const d = pathToSvgString(splineToPathDefinition(placed))
    setSplinePreview({ d, fill: kind !== 'arc' })
    setDragHud({
      x: e.clientX, y: e.clientY,
      label: `${Math.round(Math.abs(p.x - box.startX))} × ${Math.round(Math.abs(p.y - box.startY))}`,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientToComp])

  const handleSplineBoxUp = useCallback((e: PointerEvent) => {
    const box = splineBoxRef.current
    const kind = splineDrawKindRef.current
    window.removeEventListener('pointermove', handleSplineBoxMove)
    window.removeEventListener('pointerup',   handleSplineBoxUp)
    splineBoxRef.current = null
    setSplinePreview(null)
    setDragHud(null)
    if (!box || !kind) { onSplineDrawCommitRef.current?.(); return }
    const p = clientToComp(e)
    if (!p) { onSplineDrawCommitRef.current?.(); return }
    let x2 = p.x, y2 = p.y
    // A click (no real drag) → default-sized shape centered on the click.
    if (Math.abs(x2 - box.startX) < 3 && Math.abs(y2 - box.startY) < 3) {
      x2 = box.startX + 120; y2 = box.startY + 80
    }
    const spec = splineParamsFromBox(kind, { x1: box.startX, y1: box.startY, x2, y2 })
    if (!spec) { onSplineDrawCommitRef.current?.(); return }
    commitDrawnSpline(kind, spec.params, spec.centerX, spec.centerY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientToComp, commitDrawnSpline, handleSplineBoxMove])

  const handleSplineLineMove = useCallback((e: PointerEvent) => {
    const line = splineLineRef.current
    if (!line || line.points.length === 0) return
    const p = clientToComp(e)
    if (!p) return
    const pts = [...line.points, p]
    const d = 'M ' + pts.map(pt => `${pt.x} ${pt.y}`).join(' L ')
    setSplinePreview({ d, fill: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientToComp])

  const finishSplineLine = useCallback((closed: boolean) => {
    const line = splineLineRef.current
    window.removeEventListener('pointermove', handleSplineLineMove)
    splineLineRef.current = null
    setSplinePreview(null)
    setDragHud(null)
    if (!line || line.points.length < 2) { onSplineDrawCommitRef.current?.(); return }
    // Center geometry on the points' bounding box; transform sits at that center.
    const xs = line.points.map(p => p.x), ys = line.points.map(p => p.y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const local = line.points.map(p => ({ x: p.x - cx, y: p.y - cy }))
    const spline = createPolylineSpline(local, closed)
    const layer = newSplineLayerFromData(spline, { name: 'Line Spline', openPath: !closed, x: cx, y: cy })
    editorRef.current.dispatchCommand(makeAddLayerCmd(layer))
    onSelectLayer(layer.id)
    onSplineDrawCommitRef.current?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSplineLineMove, onSelectLayer])

  // Keyboard: Enter finishes an open line, Esc cancels, Backspace removes the
  // last placed point. Active only while in spline-draw mode.
  useEffect(() => {
    if (toolMode !== 'spline-draw') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelSplineDraw()
        onSplineDrawCommitRef.current?.()
      } else if (e.key === 'Enter') {
        if (splineLineRef.current) { e.preventDefault(); finishSplineLine(false) }
      } else if (e.key === 'Backspace') {
        const line = splineLineRef.current
        if (line && line.points.length > 0) {
          e.preventDefault()
          line.points.pop()
          if (line.points.length === 0) { cancelSplineDraw(); onSplineDrawCommitRef.current?.() }
          else setSplinePreview({ d: 'M ' + line.points.map(p => `${p.x} ${p.y}`).join(' L '), fill: false })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toolMode, cancelSplineDraw, finishSplineLine])

  // Leaving draw mode mid-draw tears everything down.
  useEffect(() => {
    if (toolMode !== 'spline-draw') cancelSplineDraw()
  }, [toolMode, cancelSplineDraw])

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
      if (splineDrawKind === 'line') {
        // Multi-click polyline. First click starts; later clicks add points;
        // clicking near the first point (≥2 pts) closes the path.
        const line = splineLineRef.current
        if (!line) {
          splineLineRef.current = { points: [{ x: cx, y: cy }] }
          window.addEventListener('pointermove', handleSplineLineMove)
        } else {
          const first = line.points[0]
          if (line.points.length >= 2 && Math.hypot(cx - first.x, cy - first.y) <= 8) {
            finishSplineLine(true)
          } else {
            line.points.push({ x: cx, y: cy })
          }
        }
        return
      }
      // Box-drag primitives.
      if (isBoxDragKind(splineDrawKind)) {
        canvas.setPointerCapture(e.pointerId)
        splineBoxRef.current = { startX: cx, startY: cy }
        window.addEventListener('pointermove', handleSplineBoxMove)
        window.addEventListener('pointerup',   handleSplineBoxUp)
      }
      return
    }

    // ── BL-60 Faz 3: Canvas selection tools (box / lasso / circle / paint) ──
    if ((toolMode === 'selection-box' || toolMode === 'selection-lasso' ||
         toolMode === 'selection-circle' || toolMode === 'selection-paint')
        && onSelectByGeometry) {
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      const mode: 'replace' | 'add' | 'subtract' =
        e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace'
      const tool =
        toolMode === 'selection-box'    ? 'box' :
        toolMode === 'selection-lasso'  ? 'lasso' :
        toolMode === 'selection-circle' ? 'circle' : 'paint'
      selectionDragRef.current = {
        tool, mode,
        startX: cx, startY: cy,
        points: [{ x: cx, y: cy }],
        paintAcc: new Set<string>(),
      }
      // Initial overlay so the user sees something even on a zero-distance drag.
      if (tool === 'box') {
        setSelectionOverlay({ kind: 'box', x: cx, y: cy, w: 0, h: 0 })
      } else if (tool === 'circle') {
        setSelectionOverlay({ kind: 'circle', cx, cy, r: 0 })
      } else if (tool === 'lasso') {
        setSelectionOverlay({ kind: 'lasso', points: [{ x: cx, y: cy }] })
      } else {
        // paint
        setSelectionOverlay({ kind: 'paint', cx, cy, r: PAINT_BRUSH_RADIUS })
        // Seed with what's under the cursor at click-down
        const drag = selectionDragRef.current!
        const hits = layersUnderPaintBrush(sceneRef.current, { x: cx, y: cy }, PAINT_BRUSH_RADIUS)
        hits.forEach((id) => drag.paintAcc.add(id))
      }
      window.addEventListener('pointermove', handleSelectionDragMove)
      window.addEventListener('pointerup',   handleSelectionDragUp)
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
  }, [scene, timeMs, width, height, onSelectLayer, editor, handlePointerMove, handlePointerUp, panMode, beginPan, selectedLayerId, previewMode, onLayerClickInPreview, toolMode, onSelectByGeometry, handleSelectionDragMove, handleSelectionDragUp, pathPickMode, onExitPathPickMode, splineDrawKind, handleSplineLineMove, finishSplineLine, handleSplineBoxMove, handleSplineBoxUp])

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

  // ── Preview-mode drag: fires dragStart/Move/End on draggable layers ────
  // Also writes a TEMPORARY override map entry so the dragged layer visibly
  // follows the cursor (no scene mutation — pure render-time override).
  const previewDragRef = useRef<{
    layerId: string
    startClientX: number; startClientY: number
    range: number
    axis: 'x' | 'y' | 'both'
    originalX: number
    originalY: number
    /** When true, drag scrubs a timeline — the layer's position is driven by
     *  its own keyframes (NOT the cursor). We skip the visual cursor-follow
     *  override so the authored animation can play through. */
    scrubMode: boolean
  } | null>(null)
  // Map of `layers.<id>.transform.x|y` → number. Merged into renderer
  // overrides so the dragged layer follows the cursor in preview.
  const [dragOverrides, setDragOverrides] = useState<Map<string, number>>(new Map())

  const handlePreviewDragMove = useCallback((e: PointerEvent) => {
    const d = previewDragRef.current
    if (!d) return
    const { sx, sy } = pxScale.current
    const rawDx = (e.clientX - d.startClientX) * sx
    const rawDy = (e.clientY - d.startClientY) * sy
    // Apply axis filter
    const dx = d.axis === 'y' ? 0 : rawDx
    const dy = d.axis === 'x' ? 0 : rawDy

    // 👉 Visual feedback:
    //    – Free-drag mode:  override transform with cursor position
    //    – Scrub mode:      let the layer's KEYFRAMES drive the position
    //                       (the timeline scrub upstream moves the cursor,
    //                       so the layer's authored animation plays through)
    if (!d.scrubMode) {
      setDragOverrides(new Map([
        [`layers.${d.layerId}.transform.x`, d.originalX + dx],
        [`layers.${d.layerId}.transform.y`, d.originalY + dy],
      ]))
    }

    if (onLayerDragInPreview) {
      const dist     = d.axis === 'both' ? Math.hypot(dx, dy) : Math.abs(d.axis === 'x' ? dx : dy)
      const progress = Math.max(0, Math.min(1, dist / Math.max(1, d.range)))
      onLayerDragInPreview(d.layerId, 'move', dx, dy, progress)
    }
  }, [onLayerDragInPreview])

  const handlePreviewDragUp = useCallback((e: PointerEvent) => {
    const d = previewDragRef.current
    if (!d) return
    previewDragRef.current = null
    window.removeEventListener('pointermove', handlePreviewDragMove)
    window.removeEventListener('pointerup',   handlePreviewDragUp)
    // Clear the visual override — when preview exits / re-enters, layer
    // returns to its authored position.
    setDragOverrides(new Map())
    if (onLayerDragInPreview) {
      const { sx, sy } = pxScale.current
      const rawDx = (e.clientX - d.startClientX) * sx
      const rawDy = (e.clientY - d.startClientY) * sy
      const dx = d.axis === 'y' ? 0 : rawDx
      const dy = d.axis === 'x' ? 0 : rawDy
      const dist     = d.axis === 'both' ? Math.hypot(dx, dy) : Math.abs(d.axis === 'x' ? dx : dy)
      const progress = Math.max(0, Math.min(1, dist / Math.max(1, d.range)))
      onLayerDragInPreview(d.layerId, 'end', dx, dy, progress)
    }
  }, [handlePreviewDragMove, onLayerDragInPreview])

  const beginPreviewDrag = useCallback((
    layer: Layer, startClientX: number, startClientY: number, _cx: number, _cy: number,
  ) => {
    const cfg = layer.dragConfig ?? {}

    // ── Auto-detect scrub setup from the layer's OWN animation tracks ────
    // When the layer is keyframed on a timeline AND has a scrubsTimeline
    // pointing at that timeline, we infer:
    //   • axis     = whichever of transform.x / transform.y is animated
    //   • range    = absolute value delta across the animation (e.g. 0→200 → 200)
    //   • scrubMode = true (layer position will be driven by keyframes,
    //                       not by cursor follow)
    let axis:  'x' | 'y' | 'both' = cfg.axis ?? 'both'
    let range: number             = cfg.range ?? 200
    let scrubMode                 = false

    if (cfg.scrubsTimeline) {
      const tl = scene.timelines.find(t => t.id === cfg.scrubsTimeline)
      if (tl) {
        scrubMode = true
        const xTrack = tl.tracks.find(t => t.target === `layers.${layer.id}.transform.x`)
        const yTrack = tl.tracks.find(t => t.target === `layers.${layer.id}.transform.y`)
        const xValues = xTrack?.keyframes.map(k => Number(k.value)) ?? []
        const yValues = yTrack?.keyframes.map(k => Number(k.value)) ?? []
        const xRange  = xValues.length > 1 ? Math.max(...xValues) - Math.min(...xValues) : 0
        const yRange  = yValues.length > 1 ? Math.max(...yValues) - Math.min(...yValues) : 0
        if (xRange > 0 && yRange > 0) { axis = 'both'; range = Math.hypot(xRange, yRange) }
        else if (xRange > 0)          { axis = 'x';    range = xRange }
        else if (yRange > 0)          { axis = 'y';    range = yRange }
        // If layer has no keyframes on this timeline, keep explicit cfg values.
      }
    }

    previewDragRef.current = {
      layerId: layer.id,
      startClientX, startClientY,
      range, axis,
      originalX: layer.transform.x,
      originalY: layer.transform.y,
      scrubMode,
    }
    if (onLayerDragInPreview) onLayerDragInPreview(layer.id, 'start', 0, 0, 0)
    window.addEventListener('pointermove', handlePreviewDragMove)
    window.addEventListener('pointerup',   handlePreviewDragUp)
  }, [scene, onLayerDragInPreview, handlePreviewDragMove, handlePreviewDragUp])

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

  // ── Render canvas ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Merge timeline/runtime overrides with the temporary drag override so
    // the dragged layer visibly follows the cursor.
    let mergedOverrides = overrides
    if (dragOverrides.size > 0) {
      const m = new Map<string, number>()
      overrides?.forEach((v, k) => m.set(k, v))
      dragOverrides.forEach((v, k) => m.set(k, v))
      mergedOverrides = m
    }
    canvasRenderer.render(
      ctx, scene, timeMs, selectedLayerId, assets,
      {
        // Grid drawn only when both the master snap is on AND the "Snap to
        // grid" type is enabled — matches the visual / behaviour contract
        // ("grid açıksa snap olur, kapalıysa olmaz").
        grid:        (snapEnabled && snapToGridOn) ? { size: gridSize } : undefined,
        overrides:   mergedOverrides,
        paramValues,
        selectedLayerIds,
      },
    )

    // ── BL-56 — Ghost / Onion-Skin overlay ───────────────────────────────
    // Render interpolated layer states at ±N frames around the playhead at
    // reduced opacity. Drawn ON TOP of the live scene so the main frame
    // remains the visual anchor; ghosts act as motion-path context.
    if (ghostSettings?.enabled && selectedTimeline) {
      const ghostFrames = getMultiLayerGhostFrames(
        scene.layers,
        selectedTimeline,
        timeMs,
        ghostSettings.beforeFrames,
        ghostSettings.afterFrames,
        ghostSettings.scope,
        ghostSettings.scope === 'selected' ? selectedLayerIds : undefined,
        ghostSettings.fps ?? 30,
      )

      const opacityFactor = ghostSettings.opacity / 100
      for (const gf of ghostFrames) {
        const layer = scene.layers.find((l) => l.id === gf.layerId)
        if (!layer) continue

        // Build an override map that pins this layer's transform/opacity to
        // the interpolated ghost values. Other layers inherit base overrides.
        const ghostOverrides = new Map<string, number>()
        mergedOverrides?.forEach((v, k) => ghostOverrides.set(k, v))
        if (gf.transform) {
          ghostOverrides.set(`layers.${layer.id}.transform.x`,           gf.transform.x)
          ghostOverrides.set(`layers.${layer.id}.transform.y`,           gf.transform.y)
          ghostOverrides.set(`layers.${layer.id}.transform.scaleX`,      gf.transform.scaleX)
          ghostOverrides.set(`layers.${layer.id}.transform.scaleY`,      gf.transform.scaleY)
          ghostOverrides.set(`layers.${layer.id}.transform.rotationDeg`, gf.transform.rotationDeg)
        }
        if (gf.opacity !== undefined) {
          ghostOverrides.set(`layers.${layer.id}.opacity`, gf.opacity)
        }

        ctx.save()
        ctx.globalAlpha = opacityFactor
        canvasRenderer.renderSingleLayer(ctx, layer, scene, assets, {
          overrides:   ghostOverrides,
          paramValues,
          timeMs:      gf.timeMs,
        })
        ctx.restore()
      }
    }
  }, [scene, timeMs, selectedLayerId, selectedLayerIds, assets, snapEnabled, snapToGridOn, gridSize, overrides, paramValues, dragOverrides, ghostSettings, selectedTimeline])

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
  const hasFrameGeometry = !!selectedLayer && (!!selectedLayer.size || !!selectedPathBounds)
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
              })
            }}
            onPointerLeave={() => {
              if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current)
              setHoveredLayerId(null)
            }}
            className={`absolute inset-0 block ${
              previewMode ? 'cursor-pointer'
              : pathPickMode ? 'cursor-crosshair'
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
            menuHandlers?.convertToSpline && target.type === 'shape' && target.size
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

// ── Selection frame with 8 resize handles ────────────────────────────────────

interface FrameProps {
  x: number; y: number; w: number; h: number
  /** Anchor position in screen px RELATIVE to the frame's top-left.
   *  Used as the CSS transform-origin so the frame rotates around the
   *  same pivot as the rendered layer. */
  anchorOffsetX: number
  anchorOffsetY: number
  rotationDeg: number
  /** Resize handles render only when provided (Scale + Select modes). */
  onHandlePointerDown?: (h: Handle) => (e: React.PointerEvent) => void
  /** Rotate handles render only when provided (Rotate + Select modes). */
  onRotatePointerDown?: (e: React.PointerEvent) => void
}

// ── Fit / View menu (opens upward from the zoom pill) ───────────────────────

interface FitMenuActions {
  fitAll:          () => void
  fitWidth:        () => void
  fitHeight:       () => void
  actualSize:      () => void
  fitSelection:    () => void
  centreSelection: () => void
  zoom50:          () => void
  zoom200:         () => void
  zoom400:         () => void
  toggleFullscreen?: () => void
}

interface FitMenuProps {
  hasSelection: boolean
  fullscreen:   boolean
  actions: FitMenuActions
  onPick: (action: () => void) => void
}

function FitMenu({ hasSelection, fullscreen, actions, onPick }: FitMenuProps) {
  type Item =
    | { kind: 'item'; label: string; kbd?: string; action: () => void; disabled?: boolean }
    | { kind: 'separator' }
    | { kind: 'heading'; label: string }

  const items: Item[] = [
    { kind: 'heading', label: 'Fit composition' },
    { kind: 'item', label: 'Fit to view',     kbd: 'F',  action: actions.fitAll },
    { kind: 'item', label: 'Fit width',                  action: actions.fitWidth },
    { kind: 'item', label: 'Fit height',                 action: actions.fitHeight },
    { kind: 'separator' },
    { kind: 'heading', label: 'Selection' },
    { kind: 'item', label: 'Fit selection',  kbd: '⇧2', action: actions.fitSelection,    disabled: !hasSelection },
    { kind: 'item', label: 'Centre selection',          action: actions.centreSelection, disabled: !hasSelection },
    { kind: 'separator' },
    { kind: 'heading', label: 'Zoom presets' },
    { kind: 'item', label: 'Actual size (100%)', kbd: '0', action: actions.actualSize },
    { kind: 'item', label: '50%',                          action: actions.zoom50 },
    { kind: 'item', label: '200%',                         action: actions.zoom200 },
    { kind: 'item', label: '400%',                         action: actions.zoom400 },
    ...(actions.toggleFullscreen ? [
      { kind: 'separator' as const },
      { kind: 'item' as const,
        label: fullscreen ? '⛶ Exit fullscreen' : '⛶ Fullscreen canvas',
        kbd: 'Esc / F11',
        action: actions.toggleFullscreen },
    ] : []),
  ]

  return (
    <div className="absolute bottom-full right-0 mb-1 min-w-[200px]
                    bg-gray-900 border border-gray-700 rounded shadow-xl
                    py-1 z-50 select-none">
      {items.map((it, i) => {
        if (it.kind === 'separator') return <div key={i} className="h-px bg-gray-800 my-1" />
        if (it.kind === 'heading') return (
          <div key={i} className="px-3 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-gray-500 font-semibold">
            {it.label}
          </div>
        )
        return (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => !it.disabled && onPick(it.action)}
            className={`w-full flex items-center justify-between gap-6 px-3 py-1.5 text-xs
              ${it.disabled
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-200 hover:bg-gray-800 cursor-pointer'}`}
          >
            <span>{it.label}</span>
            {it.kbd && <span className="text-[10px] text-gray-500 font-mono">{it.kbd}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── Snap menu (top-right dropdown — SVGator-style) ───────────────────────────

interface SnapMenuProps {
  enabled: boolean;     onToggleEnabled: () => void
  toObjects: boolean;   onToggleObjects: () => void
  toPoints:  boolean;   onTogglePoints:  () => void
  toGuides:  boolean;   onToggleGuides:  () => void
  toGrid:    boolean;   onToggleGrid:    () => void
  toPixel:   boolean;   onTogglePixel:   () => void
  gridSize:  number;    onGridSizeChange: (n: number) => void
}

function SnapMenu(p: SnapMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const items: Array<{ label: string; value: boolean; onToggle: () => void; disabled?: boolean }> = [
    { label: 'Snap to Objects', value: p.toObjects, onToggle: p.onToggleObjects, disabled: !p.enabled },
    { label: 'Snap to Points',  value: p.toPoints,  onToggle: p.onTogglePoints,  disabled: !p.enabled },
    { label: 'Snap to Guides',  value: p.toGuides,  onToggle: p.onToggleGuides,  disabled: !p.enabled },
    { label: 'Snap to Grid',    value: p.toGrid,    onToggle: p.onToggleGrid,    disabled: !p.enabled },
    { label: 'Snap to Pixel',   value: p.toPixel,   onToggle: p.onTogglePixel,   disabled: !p.enabled },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Snap settings"
        className={`px-2 py-1 text-xs font-mono rounded border flex items-center gap-1
          ${p.enabled
            ? 'bg-blue-600/90 border-blue-500 text-white hover:bg-blue-500'
            : 'bg-gray-900/90 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
      >
        🧲 Snap <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 min-w-[220px] bg-gray-900 border border-gray-700
                        rounded shadow-xl py-1 z-50 dock-overlay-in">
          {items.map((it) => (
            <button
              key={it.label}
              disabled={it.disabled}
              onClick={() => !it.disabled && it.onToggle()}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs
                ${it.disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-200 hover:bg-gray-800 cursor-pointer'}`}
            >
              <span className="w-3 inline-block">{it.value ? '✓' : ''}</span>
              <span className="flex-1 text-left">{it.label}</span>
            </button>
          ))}
          {/* Inline grid-size slider when Snap to Grid is on */}
          {p.toGrid && p.enabled && (
            <div className="px-3 py-1.5 flex items-center gap-2 border-t border-gray-800 mt-1 pt-2">
              <span className="text-[10px] text-gray-400">Grid</span>
              <input
                type="range" min={2} max={100} step={1}
                value={p.gridSize}
                onChange={(e) => p.onGridSizeChange(Number(e.target.value))}
                className="flex-1 accent-blue-500"
              />
              <span className="text-[10px] font-mono text-gray-300 w-10 text-right">{p.gridSize}px</span>
            </div>
          )}
          <div className="h-px bg-gray-800 my-1" />
          <button
            onClick={p.onToggleEnabled}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs
                       text-gray-200 hover:bg-gray-800 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span className="w-3 inline-block">{p.enabled ? '✓' : ''}</span>
              Enable Snapping
            </span>
            <span className="text-[10px] font-mono text-gray-500">Alt + S</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── View menu (rulers / grid front-back / guides) ───────────────────────────

interface ViewMenuProps {
  showRulers:    boolean; onToggleRulers:    () => void
  gridInFront:   boolean; onToggleGridFront: () => void
  showGuides:    boolean; onToggleGuides:    () => void
}

function ViewMenu(p: ViewMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const rows: Array<{ label: string; value: boolean; onToggle: () => void; kbd?: string }> = [
    { label: 'Show ruler',           value: p.showRulers,  onToggle: p.onToggleRulers,    kbd: 'Alt + R' },
    { label: 'Show guides',          value: p.showGuides,  onToggle: p.onToggleGuides,    kbd: 'Alt + L' },
    { label: 'Grid on top of layers',value: p.gridInFront, onToggle: p.onToggleGridFront },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="View options"
        className="px-2 py-1 text-xs font-mono rounded border bg-gray-900/90 border-gray-700
                   text-gray-300 hover:bg-gray-800 flex items-center gap-1"
      >
        ⊞ View <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 min-w-[220px] bg-gray-900 border border-gray-700
                        rounded shadow-xl py-1 z-50 dock-overlay-in">
          {rows.map((r) => (
            <button
              key={r.label}
              onClick={r.onToggle}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs
                         text-gray-200 hover:bg-gray-800 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="w-3 inline-block">{r.value ? '✓' : ''}</span>
                {r.label}
              </span>
              {r.kbd && <span className="text-[10px] font-mono text-gray-500">{r.kbd}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Rulers (px scales on top + left edges of the canvas leaf) ────────────────

interface RulersProps {
  composition: { width: number; height: number }
  zoom: number
  pan: { x: number; y: number }
  containerEl: HTMLDivElement
  /** Selected layer's axis-aligned bounding rect in composition px. When
   *  provided the rulers highlight the rect's extents with a coloured
   *  band + dashed guide line tying the band to the artboard (Figma /
   *  Photoshop pattern). */
  selectedRect?: { x: number; y: number; width: number; height: number }
}

const RULER_THICK = 18  // px — strip height/width

/**
 * Picks a "nice" tick interval (composition px) so that major ticks fall
 * roughly every 80 screen px regardless of zoom.
 */
function pickRulerStep(zoom: number): number {
  const TARGET_PX = 80
  const compPx = TARGET_PX / Math.max(0.001, zoom)
  const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
  for (const s of niceSteps) if (s >= compPx) return s
  return niceSteps[niceSteps.length - 1]
}

function Rulers({ composition, zoom, pan, containerEl, selectedRect }: RulersProps) {
  // Re-render when the container resizes so ruler ticks stay aligned with
  // the leaf's current bounds.
  const [, setTick] = useState(0)
  useEffect(() => {
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(containerEl)
    return () => ro.disconnect()
  }, [containerEl])

  const rect = containerEl.getBoundingClientRect()
  const cw = rect.width, ch = rect.height
  // Canvas top-left in container-relative coords:
  // flex centres the (canvas + 2×PADDING) wrapper, plus the pan translate.
  const originX = cw / 2 - (composition.width  * zoom) / 2 + pan.x
  const originY = ch / 2 - (composition.height * zoom) / 2 + pan.y

  const step = pickRulerStep(zoom)
  // X ticks (composition x = 0, step, 2·step, …, width)
  const xTicks: number[] = []
  for (let x = 0; x <= composition.width;  x += step) xTicks.push(x)
  const yTicks: number[] = []
  for (let y = 0; y <= composition.height; y += step) yTicks.push(y)

  // Common style for tick labels
  const label = 'absolute text-[9px] font-mono text-gray-500 pointer-events-none select-none'
  const tickStroke = 'rgba(160,160,160,0.55)'

  // Selected-layer extents in screen-px (clamped to the ruler track)
  const sel = selectedRect
  const selSX1 = sel ? originX + sel.x * zoom                : 0
  const selSX2 = sel ? originX + (sel.x + sel.width) * zoom  : 0
  const selSY1 = sel ? originY + sel.y * zoom                : 0
  const selSY2 = sel ? originY + (sel.y + sel.height) * zoom : 0

  return (
    <>
      {/* TOP RULER — horizontal strip pinned to the leaf's top edge */}
      <div
        className="absolute top-0 left-0 right-0 bg-gray-900/95 border-b border-gray-700 pointer-events-none z-20"
        style={{ height: RULER_THICK }}
      >
        {/* Corner spacer (overlaps the left ruler's gutter) */}
        <div className="absolute top-0 left-0 bg-gray-900/95 border-r border-gray-700"
             style={{ width: RULER_THICK, height: RULER_THICK }} />

        {/* Selected-layer X extent — blue band on the ruler track */}
        {sel && (() => {
          const left  = Math.max(RULER_THICK, selSX1)
          const right = Math.min(cw, selSX2)
          if (right <= left) return null
          return (
            <>
              <div
                className="absolute bottom-0 bg-blue-500/40 border-t border-blue-400"
                style={{ left, width: right - left, height: 6 }}
              />
              {/* Position labels at the band edges (only when inside view) */}
              {selSX1 >= RULER_THICK && (
                <span className="absolute top-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ left: selSX1 + 2 }}>
                  {Math.round(sel.x)}
                </span>
              )}
              {selSX2 <= cw && (
                <span className="absolute top-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ left: selSX2 - 26 }}>
                  {Math.round(sel.x + sel.width)}
                </span>
              )}
            </>
          )
        })()}

        {xTicks.map((cx) => {
          const sx = originX + cx * zoom
          if (sx < RULER_THICK || sx > cw) return null
          return (
            <div key={cx} className="absolute top-0 h-full" style={{ left: sx }}>
              <div style={{ position: 'absolute', bottom: 0, width: 1, height: 6, background: tickStroke }} />
              <span className={label} style={{ top: 2, left: 3 }}>{cx}</span>
            </div>
          )
        })}
      </div>

      {/* LEFT RULER — vertical strip pinned to the leaf's left edge */}
      <div
        className="absolute top-0 left-0 bottom-0 bg-gray-900/95 border-r border-gray-700 pointer-events-none z-20"
        style={{ width: RULER_THICK }}
      >
        {/* Selected-layer Y extent — blue band on the ruler track */}
        {sel && (() => {
          const top    = Math.max(RULER_THICK, selSY1)
          const bottom = Math.min(ch, selSY2)
          if (bottom <= top) return null
          return (
            <>
              <div
                className="absolute right-0 bg-blue-500/40 border-l border-blue-400"
                style={{ top, height: bottom - top, width: 6 }}
              />
              {selSY1 >= RULER_THICK && (
                <span className="absolute left-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ top: selSY1 + 1 }}>
                  {Math.round(sel.y)}
                </span>
              )}
              {selSY2 <= ch && (
                <span className="absolute left-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ top: selSY2 - 12 }}>
                  {Math.round(sel.y + sel.height)}
                </span>
              )}
            </>
          )
        })()}

        {yTicks.map((cy) => {
          const sy = originY + cy * zoom
          if (sy < RULER_THICK || sy > ch) return null
          return (
            <div key={cy} className="absolute left-0 w-full" style={{ top: sy }}>
              <div style={{ position: 'absolute', right: 0, height: 1, width: 6, background: tickStroke }} />
              <span className={label}
                style={{
                  top: 0, left: 2,
                  transform: 'rotate(-90deg) translate(-100%, 100%)',
                  transformOrigin: '0 0',
                  whiteSpace: 'nowrap',
                }}>{cy}</span>
            </div>
          )
        })}
      </div>

      {/* Dashed guide lines tying the selected layer's edges to the rulers.
          Span from the ruler edge across the leaf so the user can eyeball
          alignment with anything in the work area, not just the artboard. */}
      {sel && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {[selSX1, selSX2].map((x, i) =>
            x >= RULER_THICK && x <= cw ? (
              <div
                key={`v${i}`}
                className="absolute top-0 bottom-0 border-l border-dashed border-blue-400/40"
                style={{ left: x }}
              />
            ) : null
          )}
          {[selSY1, selSY2].map((y, i) =>
            y >= RULER_THICK && y <= ch ? (
              <div
                key={`h${i}`}
                className="absolute left-0 right-0 border-t border-dashed border-blue-400/40"
                style={{ top: y }}
              />
            ) : null
          )}
        </div>
      )}
    </>
  )
}

// ── Anchor point handle (pivot for rotation / scale) ─────────────────────────

interface AnchorProps {
  x: number; y: number
  isDragging?: boolean
  onPointerDown: (e: React.PointerEvent) => void
}

/**
 * Crosshair-in-a-ring handle marking the layer's anchor point. Draggable —
 * moves transform.anchorX/Y. Sits above the selection frame so it's always
 * reachable, but uses pointer-events:auto only on the inner hit area so it
 * doesn't block other interactions.
 */
function AnchorHandle({ x, y, isDragging, onPointerDown }: AnchorProps) {
  return (
    <div
      onPointerDown={onPointerDown}
      title="Anchor point (rotation / scale pivot) — drag to reposition"
      className="absolute z-50 pointer-events-auto cursor-move select-none"
      style={{ left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)' }}
    >
      <div className={`relative w-4 h-4 rounded-full border-2 transition-transform
        ${isDragging
          ? 'border-orange-400 bg-orange-400/40 scale-125'
          : 'border-orange-500 bg-white/30 hover:scale-110'}`}>
        {/* crosshair */}
        <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-orange-500" />
        <span className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-orange-500" />
      </div>
    </div>
  )
}

function SelectionFrame({
  x, y, w, h, anchorOffsetX, anchorOffsetY, rotationDeg,
  onHandlePointerDown, onRotatePointerDown,
}: FrameProps) {
  // 8 resize handles on the frame perimeter (corners + edge midpoints)
  const handles: Array<{ key: Handle; cx: number; cy: number }> = [
    { key: 'nw', cx: 0,     cy: 0     },
    { key: 'n',  cx: w / 2, cy: 0     },
    { key: 'ne', cx: w,     cy: 0     },
    { key: 'w',  cx: 0,     cy: h / 2 },
    { key: 'e',  cx: w,     cy: h / 2 },
    { key: 'sw', cx: 0,     cy: h     },
    { key: 's',  cx: w / 2, cy: h     },
    { key: 'se', cx: w,     cy: h     },
  ]
  // Rotation handles: 4 smaller dots 10px diagonally OUTSIDE each corner.
  const ROT_OFFSET = 10
  const rotHandles: Array<{ key: string; cx: number; cy: number }> = [
    { key: 'rot-nw', cx: -ROT_OFFSET,     cy: -ROT_OFFSET     },
    { key: 'rot-ne', cx: w + ROT_OFFSET,  cy: -ROT_OFFSET     },
    { key: 'rot-sw', cx: -ROT_OFFSET,     cy: h + ROT_OFFSET  },
    { key: 'rot-se', cx: w + ROT_OFFSET,  cy: h + ROT_OFFSET  },
  ]

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x, top: y, width: w, height: h,
        transform: `rotate(${rotationDeg}deg)`,
        transformOrigin: `${anchorOffsetX}px ${anchorOffsetY}px`,
      }}
    >
      {/* Frame border */}
      <div className="absolute inset-0 border border-blue-400/90 box-border" />

      {/* Rotation handles — small white circles, drawn diagonally outside corners */}
      {onRotatePointerDown && rotHandles.map((r) => (
        <div
          key={r.key}
          onPointerDown={onRotatePointerDown}
          title="Drag to rotate (Shift = snap 15°)"
          className="absolute w-2 h-2 -translate-x-1/2 -translate-y-1/2
                     bg-white border border-blue-400 rounded-full shadow-sm pointer-events-auto
                     hover:scale-125 hover:border-blue-300 transition-transform"
          style={{ left: `${r.cx}px`, top: `${r.cy}px`, cursor: 'alias' }}
        />
      ))}

      {/* Resize handles — circles (Figma / SVGator style), drawn on top so
          a click on the corner resizes, not rotates. */}
      {onHandlePointerDown && handles.map((h) => (
        <div
          key={h.key}
          onPointerDown={onHandlePointerDown(h.key)}
          className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2
                     bg-white border border-blue-500 rounded-full shadow pointer-events-auto"
          style={{ left: `${h.cx}px`, top: `${h.cy}px`, cursor: HANDLE_CURSORS[h.key] }}
        />
      ))}
    </div>
  )
}

// ── Move-mode axis gizmo ──────────────────────────────────────────────────
// X arrow (red), Y arrow (blue), centre square. Pure DIV — no SVG so we
// avoid viewBox / translate positioning ambiguity. Anchored at the layer's
// pivot in world space; screen-aligned (does NOT rotate with the layer)
// so the user always knows which direction "X" actually goes.
interface MoveAxisGizmoProps {
  x: number; y: number
  onAxisPointerDown: (axis: 'x' | 'y' | null) => (e: React.PointerEvent) => void
}
function MoveAxisGizmo({ x, y, onAxisPointerDown }: MoveAxisGizmoProps) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${x}px`, top: `${y}px`, zIndex: 49 }}
    >
      <AxisArrow direction="x" color="#ef4444" cap="triangle" onPointerDown={onAxisPointerDown('x')}
        title="Drag — locks to X axis" cursor="ew-resize" />
      <AxisArrow direction="y" color="#3b82f6" cap="triangle" onPointerDown={onAxisPointerDown('y')}
        title="Drag — locks to Y axis" cursor="ns-resize" />
      <CenterHandle color="#facc15" border="#ca8a04"
        title="Drag — free move (X + Y together)" cursor="move"
        onPointerDown={onAxisPointerDown(null)} />
    </div>
  )
}

// ── Scale-mode axis gizmo ──────────────────────────────────────────────────
// Same shape as Move gizmo but with SQUARE caps (3DS Max convention) and
// drives transform.scaleX / scaleY instead of position. Centre square does
// uniform scale (both axes by the same factor).
interface ScaleAxisGizmoProps {
  x: number; y: number
  onAxisPointerDown: (axis: 'x' | 'y' | 'both') => (e: React.PointerEvent) => void
}
function ScaleAxisGizmo({ x, y, onAxisPointerDown }: ScaleAxisGizmoProps) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${x}px`, top: `${y}px`, zIndex: 49 }}
    >
      <AxisArrow direction="x" color="#ef4444" cap="square" onPointerDown={onAxisPointerDown('x')}
        title="Drag — scale X axis" cursor="ew-resize" />
      <AxisArrow direction="y" color="#3b82f6" cap="square" onPointerDown={onAxisPointerDown('y')}
        title="Drag — scale Y axis" cursor="ns-resize" />
      <CenterHandle color="#facc15" border="#ca8a04"
        title="Drag — uniform scale (X + Y together)" cursor="nwse-resize"
        onPointerDown={onAxisPointerDown('both')} />
    </div>
  )
}

// ── Shared sub-components for the axis gizmos ──────────────────────────────
const ARROW_LEN = 56  // axis line length in CSS px
const ARROW_THICK = 2 // line thickness
const ARROW_CAP = 8   // triangle / square cap size

interface AxisArrowProps {
  direction: 'x' | 'y'
  color: string
  cap: 'triangle' | 'square'
  cursor: 'ew-resize' | 'ns-resize'
  title: string
  onPointerDown: (e: React.PointerEvent) => void
}
function AxisArrow({ direction, color, cap, cursor, title, onPointerDown }: AxisArrowProps) {
  const isX = direction === 'x'
  const hitW = isX ? ARROW_LEN + ARROW_CAP : 14
  const hitH = isX ? 14 : ARROW_LEN + ARROW_CAP
  const hitLeft = isX ? 0 : -7
  const hitTop  = isX ? -7 : 0
  return (
    <div
      onPointerDown={onPointerDown}
      title={title}
      className="absolute pointer-events-auto"
      style={{ left: hitLeft, top: hitTop, width: hitW, height: hitH, cursor }}
    >
      {/* Line */}
      <div
        className="absolute"
        style={
          isX
            ? { left: 0, top: '50%', width: ARROW_LEN, height: ARROW_THICK, marginTop: -ARROW_THICK / 2, background: color }
            : { left: '50%', top: 0, width: ARROW_THICK, height: ARROW_LEN, marginLeft: -ARROW_THICK / 2, background: color }
        }
      />
      {/* Cap */}
      {cap === 'triangle' ? (
        <div
          className="absolute"
          style={
            isX
              ? {
                  right: 0, top: '50%', width: 0, height: 0, marginTop: -ARROW_CAP,
                  borderTop:    `${ARROW_CAP}px solid transparent`,
                  borderBottom: `${ARROW_CAP}px solid transparent`,
                  borderLeft:   `${ARROW_CAP + 2}px solid ${color}`,
                }
              : {
                  left: '50%', bottom: 0, width: 0, height: 0, marginLeft: -ARROW_CAP,
                  borderLeft:  `${ARROW_CAP}px solid transparent`,
                  borderRight: `${ARROW_CAP}px solid transparent`,
                  borderTop:   `${ARROW_CAP + 2}px solid ${color}`,
                }
          }
        />
      ) : (
        <div
          className="absolute"
          style={
            isX
              ? {
                  right: 0, top: '50%', width: ARROW_CAP, height: ARROW_CAP,
                  marginTop: -ARROW_CAP / 2, background: color,
                }
              : {
                  left: '50%', bottom: 0, width: ARROW_CAP, height: ARROW_CAP,
                  marginLeft: -ARROW_CAP / 2, background: color,
                }
          }
        />
      )}
    </div>
  )
}

interface CenterHandleProps {
  color: string
  border: string
  title: string
  cursor: string
  onPointerDown: (e: React.PointerEvent) => void
}
function CenterHandle({ color, border, title, cursor, onPointerDown }: CenterHandleProps) {
  return (
    <div
      onPointerDown={onPointerDown}
      title={title}
      className="absolute pointer-events-auto"
      style={{
        left: -6, top: -6, width: 12, height: 12,
        background: color, border: `1px solid ${border}`, cursor,
      }}
    />
  )
}

// ── Rotate-mode visible ring ──────────────────────────────────────────────
// Big orange ring around the anchor — pointer down anywhere on the ring's
// 16px-wide click band starts a rotation. Replaces the corner dots in
// Rotate mode (those become invisible in this mode). Radius adapts to
// the layer's size so the ring stays outside the frame even on big shapes.
interface RotateRingProps {
  x: number; y: number
  radius: number
  isDragging: boolean
  onPointerDown: (e: React.PointerEvent) => void
}
function RotateRing({ x, y, radius, isDragging, onPointerDown }: RotateRingProps) {
  const BAND = 8                // click-band width on each side
  const outer = radius + BAND
  const dim = outer * 2
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${x}px`, top: `${y}px`, zIndex: 48 }}
    >
      {/* Visible ring (dashed when idle, solid when dragging) */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          left: -radius, top: -radius, width: radius * 2, height: radius * 2,
          border: `2px ${isDragging ? 'solid' : 'dashed'} ${isDragging ? '#fb923c' : '#fb923c99'}`,
          boxShadow: isDragging ? '0 0 8px #fb923c66' : undefined,
        }}
      />
      {/* Wider transparent click band — use SVG circle stroke since
          CSS-only ring hit-testing would also cover the disc interior. */}
      <svg
        width={dim} height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        className="absolute"
        style={{ left: -outer, top: -outer, overflow: 'visible' }}
      >
        <circle
          cx={outer} cy={outer} r={radius}
          fill="none"
          stroke="transparent"
          strokeWidth={BAND * 2}
          style={{ pointerEvents: 'stroke', cursor: 'grab' }}
          onPointerDown={onPointerDown}
        />
      </svg>
    </div>
  )
}

// ── Transform HUD ─────────────────────────────────────────────────────────
// Floats near the cursor during a drag, showing the live numeric value
// (X/Y for move, angle for rotate, W/H for resize, anchor coords for anchor).
// Pinned to the viewport (position: fixed) so it stays visible regardless
// of canvas scroll/pan.
interface TransformHUDProps {
  x: number; y: number
  label: string
}
function TransformHUD({ x, y, label }: TransformHUDProps) {
  return (
    <div
      className="fixed pointer-events-none z-[100] px-2 py-1 rounded text-[11px] font-mono
                 bg-gray-900/90 text-white border border-gray-700 shadow-lg whitespace-nowrap"
      style={{ left: x + 16, top: y + 16 }}
    >
      {label}
    </div>
  )
}
