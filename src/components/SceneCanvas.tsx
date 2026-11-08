'use client'
import {
  useRef, useEffect, useCallback, useState, useMemo,
} from 'react'
import type { ChronoScene, Layer, BezierPath, Timeline } from '@/lib/types'
import type { TimelineGhostSettings } from '@/lib/types/editor'
import { projectFrameFonts, projectFrameFontOverrides } from '@/lib/render/media/projectFrameFonts'
import { hitTestLayer, hitTestLayersAt, type AssetElementMap } from '@/lib/renderer'
import { resolveInstanceLayer } from '@/lib/clone/InstanceResolver'
import { resolveDisplayTransform } from '@/lib/render/resolveDisplayTransform'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import type { CloneMode } from '@/lib/clone/CloneTypes'
// BL-73 — Spline drawing tools
import type { SplinePrimitiveKind } from '@/lib/types/spline'
import {
  hitTestSplinePoint, hitTestSplineHandle, hitTestSplineSegment, hitTestSplineContour,
  insertPointOnSegment, deleteSplinePoint,
  setSplinePointType, setSegmentType, setContourClosed, reverseContour,
} from '@/lib/spline'
import type { Guide } from '@/lib/snap/AlignmentGuides'
import { SnapEngine, type SnapEngineSettings } from '@/lib/snap/SnapEngine'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { ViewportLayerChange } from '@/lib/editor/viewportKeyframes'
import type { SnapSettingsHook } from '@/app/hooks/useSnapSettings'
import MotionPathOverlay from './MotionPathOverlay'
import { evaluateTrajectoryFrame, prepareTrajectoryContext } from '@/lib/timeline/trajectory'
import ViewportPerformanceOverlay from './resources/ViewportPerformanceOverlay'
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
  Handle,
} from './canvas/types/canvasDragTypes'
import { SelectionFrame } from './canvas/overlays/SelectionFrame'
import { AffineSelectionFrame } from './canvas/overlays/AffineSelectionFrame'
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
import { useZoomAndPan } from './canvas/hooks/useZoomAndPan'
import { useCanvasDrag } from './canvas/hooks/useCanvasDrag'
import { resolveCloneDragMode } from '@/lib/shortcuts/cloneDragGesture'
import { usePathEdit } from './canvas/hooks/usePathEdit'
import { resolveSplineEditGeometry } from './canvas/splineEditGeometry'
import { createLayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'
import { beginRotationGesture, resolveParentWorldMatrix } from '@/lib/canvas/math/rotationGesture'
import { prepareTransformTargets } from '@/lib/canvas/math/preparedTransforms'
import { canvasPickTarget } from '@/lib/selection/pickTarget'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { unionBounds } from '@/lib/geometry/boundsMath'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { selectionResize } from '@/lib/canvas/math/selectionResize'
import { evaluateTimelines, type OverrideMap } from '@/lib/evaluator'
import { canvasOwnsPointDeletion } from '@/lib/editor/keyboardContext'
import type { ShortcutContext } from '@/lib/shortcuts'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
  getShortcutContext?: () => ShortcutContext
  timeMs: number
  selectedLayerId: string | null
  /** Multi-selection set — when set has >1 entries, drag operations move
   *  ALL of them together (group-style transform). */
  selectedLayerIds?: Set<string>
  assets: AssetElementMap
  onSelectLayer: (id: string | null, shiftHeld?: boolean) => void
  /** Replace selection atomically with every new forest root after drag-copy. */
  onSelectLayers?: (ids: readonly string[]) => void
  /** Optional pre-computed override map from the interactive runtime hook
   *  (already merges timeline + param + binding overrides). */
  overrides?:    OverrideMap
  /** Runtime parameter values for text placeholder + colour resolution. */
  paramValues?:  Map<string, string | number | boolean>
  /** When true, canvas clicks on layers with tappable:true fire a runtime
   *  'click' event INSTEAD of changing selection. Used by RuntimePreviewPanel
   *  to exercise event bindings without leaving the builder. */
  previewMode?:  boolean
  /** BL-66 — true while the timeline is actively playing. Hides editor chrome
   *  (selection, gizmos, grid, motion-path overlay) so playback is clean. */
  isPlaying?:    boolean
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
  /** Optional key commands composed with the gesture into one history entry. */
  buildLayerCommitCommands?: (changes: readonly ViewportLayerChange[]) => EditorCommand[]
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
  /** Timeline/viewport key selection shares these stable IDs and local playhead. */
  selectedKeyframeIds?: ReadonlySet<string>
  onSelectKeyframes?: (ids: Set<string>) => void
  onSeekKeyframe?: (localTimeMs: number) => void
  onMotionEditingChange?: (editing: boolean) => void
  onEditMotionTiming?: (layerId: string) => void
}

const PADDING   = 24
const NO_MOTION_KEYS: ReadonlySet<string> = new Set()

export default function SceneCanvas({
  scene, editor, getShortcutContext, timeMs, selectedLayerId, selectedLayerIds, assets, onSelectLayer, onSelectLayers,
  overrides: runtimeOverrides, paramValues, previewMode, isPlaying, onLayerClickInPreview, onLayerDragInPreview,
  panMode: controlledPanMode, onPanModeChange, toolMode, onToolModeChange, snap,
  onSelectByGeometry, selectionContainMode = 'touching',
  fullscreen, onToggleFullscreen,
  menuHandlers, onAfterLayerCommit, buildLayerCommitCommands,
  ghostSettings, selectedTimeline,
  selectedKeyframeIds, onSelectKeyframes, onSeekKeyframe, onMotionEditingChange, onEditMotionTiming,
  pathPickMode = null, onAssignPath, onExitPathPickMode,
  splineDrawKind = null, splineAppendTargetId = null, onSplineDrawCommit, onSplinePointSelected,
}: Props) {
  const [hoveredPickPathId, setHoveredPickPathId] = useState<string | null>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // BL-66 — hide all editor chrome (selection, gizmos, grid, overlays) during
  // playback or preview so the viewport shows clean animation content. This is
  // the editor-side mirror of CanvasRenderer's renderMode='preview'.
  const hideEditorUI = !!previewMode || !!isPlaying
  const [transformWarning, setTransformWarning] = useState<string | null>(null)
  const [pivotMode, setPivotMode] = useState<'selectionCenter' | 'active'>('selectionCenter')
  const [motionMode, setMotionMode] = useState<'off' | 'select' | 'add' | 'draw'>('off')
  const motionEditing = motionMode !== 'off'
  const motionTime = selectedTimeline ? Math.max(0, Math.min(selectedTimeline.durationMs, timeMs)) : timeMs
  const motionContext = useMemo(() => motionEditing && selectedTimeline && selectedLayerId
    ? prepareTrajectoryContext(scene, selectedTimeline.id, selectedLayerId) : null,
  [motionEditing, scene, selectedTimeline?.id, selectedLayerId])
  const overrides = useMemo(() => {
    if (!motionEditing || hideEditorUI || !selectedTimeline || !motionContext?.ok || !motionContext.context.capability.editable) return runtimeOverrides
    const frame = evaluateTrajectoryFrame(scene, selectedTimeline.id, motionTime)
    const baseline = evaluateTimelines(scene.timelines, timeMs)
    // Runtime-only values (parameters/bindings) remain visible. Timeline values
    // use the exact local authoring clock, including the loop's final key.
    runtimeOverrides?.forEach((value, key) => {
      if (!baseline.has(key) || baseline.get(key) !== value) frame.set(key, value)
    })
    return frame
  }, [motionEditing, selectedTimeline?.id, motionContext, runtimeOverrides, scene, motionTime, timeMs, hideEditorUI])
  const motionDocumentSignal = editor.getDocumentSignal()
  useEffect(() => { setMotionMode(previous => previous === 'off' ? 'off' : 'select') },
    [selectedLayerId, selectedTimeline?.id])
  useEffect(() => { setMotionMode('off') }, [hideEditorUI, motionDocumentSignal])
  useEffect(() => { onMotionEditingChange?.(motionEditing); return () => onMotionEditingChange?.(false) },
    [motionEditing, onMotionEditingChange])

  // Borrow aliases only for geometry queries. Editor commands continue using
  // the authored scene/ref, keeping runtime names out of history and save data.
  const geometryScene = useMemo(() => projectFrameFonts(scene, assets.fonts), [scene, assets])
  const geometryOverrides = useMemo(() => overrides && projectFrameFontOverrides(scene, overrides, assets.fonts), [scene, overrides, assets])
  const geometrySceneRef = useRef(geometryScene)
  useEffect(() => { geometrySceneRef.current = geometryScene }, [geometryScene])
  const { width, height } = scene.composition
  const layerIndex = useMemo(() => new LayerIndex(scene.layers), [scene.layers])

  // ── Viewport: zoom / pan / fit presets / wheel zoom / pan drag ────────────
  const {
    zoom, pan, panDragRef,
    fitAll, fitWidth, fitHeight, actualSize, zoomTo, fitSelection, centreSelection,
    zoomIn, zoomOut, beginPan, handleWheel,
  } = useZoomAndPan({ width, height, padding: PADDING, containerRef, scene: geometryScene, selectedLayerId, timeMs, overrides: geometryOverrides })

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


  // BL-60 Faz 3 — Canvas marquee selection tools (box / lasso / circle / paint).
  const { selectionOverlay, beginSelectionDrag } = useSelectionTools({
    canvasRef, sceneRef: geometrySceneRef, width, height,
    frame: { timeMs, overrides: geometryOverrides },
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

  // Map of `layers.<id>.transform.x|y` → number. Merged into renderer
  // overrides so the dragged layer follows the cursor. Owned here because it's
  // shared by the move-drag path, the renderer, AND preview drag.
  const [dragOverrides, setDragOverrides] = useState<Map<string, number>>(new Map())

  // ── Core transform/drag engine (move/resize/rotate/scale/anchor/path/spline) ─
  const { dragRef, startDrag } = useCanvasDrag({
    canvasRef, compositionRef, sceneRef, editorRef, snapRef, engineRef, guidesRef,
    readScale, setGuides, setDragHud, setDragOverrides,
    onAfterLayerCommit, onSelectLayer, onSelectLayers, buildLayerCommitCommands,
    timeMs, overrides, contextKey: `${selectedTimeline?.id ?? ''}:${timeMs}:${hideEditorUI}:${pivotMode}:${motionEditing}`,
    onWarning: setTransformWarning,
  })

  // ── Pen tool / path editing (anchors, handles, segment insert, close) ─────
  const { tryStartPathEdit } = usePathEdit({ editorRef, sceneRef, dragRef, startDrag, toolMode,
    timeMs, overrides, zoom })


  // ── BL-73 Spline drawing tools (box-drag primitives + multi-click line) ──
  const { splinePreview, onSplineDrawPointerDown } = useSplineDrawing({
    canvasRef, compositionRef, sceneRef, editorRef,
    toolMode, splineDrawKind, splineAppendTargetId, onSplineDrawCommit,
    onSelectLayer, setDragHud, timeMs, overrides,
  })

  // BL-73 Sprint 4 — clear point selection when the layer selection changes.
  useEffect(() => { setSelectedSplinePointId(null) }, [selectedLayerId, motionEditing])

  // BL-73 Sprint 4 — Delete / Backspace removes the selected spline point.
  // Capture phase so it pre-empts the page's layer-delete shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
          || target?.isContentEditable) return
      if (previewMode || isPlaying || motionEditing) return
      if (!canvasOwnsPointDeletion(getShortcutContext?.() ?? 'canvas', editorRef.current.isTransactionActive())) return
      const pid = selectedSplinePointIdRef.current
      if (!pid) return
      const layer = sceneRef.current.layers.find(l => l.id === selectedLayerId)
      if (layer?.type !== 'spline' || !layer.spline || !layer.spline.points[pid]) return
      // A selected point owns Delete even when the contour cannot lose another
      // point. Falling through would delete the entire layer instead.
      e.preventDefault()
      e.stopPropagation()
      if (layer.locked || layer.frozen || layer.hidden) return
      const next = deleteSplinePoint(layer.spline, pid)
      if (next === layer.spline) return
      editorRef.current.dispatchCommand(makeUpdateLayerCmd(layer.id, { spline: next }, layer))
      setSelectedSplinePointId(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selectedLayerId, previewMode, isPlaying, getShortcutContext, motionEditing])

  /** Prepare independent selected roots once. Body and axis dragging share
   * the same evaluated baseline and parent-space conversion contract. */
  const beginMoveForSelection = useCallback((ids: readonly string[], activeId: string,
    event: React.PointerEvent, axisLock: 'x' | 'y' | null = null, cloneMode?: CloneMode) => {
    if (dragRef.current || editor.isTransactionActive() || motionEditing) return
    const prepared = prepareTransformTargets(scene, ids, timeMs, overrides, { activeId, pivotMode })
    if (!prepared.ok) { setTransformWarning(prepared.reason); return }
    const primary = prepared.targets.find(target => target.id === activeId) ?? prepared.targets[0]
    if (!primary) return
    setTransformWarning(null)
    editor.beginTransaction()
    dragRef.current = {
      kind: 'move', layerId: primary.id, originalLayer: primary.originalLayer,
      targets: prepared.targets,
      movingLayers: prepared.targets.map(target => ({ id: target.id,
        originalLayer: target.originalLayer, baseX: target.transform.x, baseY: target.transform.y })),
      startClientX: event.clientX, startClientY: event.clientY,
      width: primary.originalLayer.size?.width ?? 80,
      height: primary.originalLayer.size?.height ?? 24,
      axisLock, cloneMode: cloneMode ?? resolveCloneDragMode(event),
    }
    startDrag(event)
  }, [scene, timeMs, overrides, editor, dragRef, startDrag, pivotMode, motionEditing])

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current || editor.isTransactionActive() || motionEditing) return
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
      const stack = hitTestLayersAt(geometryScene, timeMs, cx, cy, geometryOverrides)
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
    const splineEdit = selectedLayer && !selectedLayer.locked && !selectedLayer.frozen && !selectedLayer.hidden
      ? resolveSplineEditGeometry(selectedLayer, scene, timeMs, overrides)
      : null
    if (selectedLayer?.spline && splineEdit
        && (toolMode === 'select' || toolMode === 'pen')) {
      const tol = 8 / zoom

      const hh = hitTestSplineHandle(splineEdit.worldSpline, cx, cy, tol)
      if (hh) {
        const handle = Object.values(selectedLayer.spline.handles)
          .find(h => h.pointId === hh.pointId && h.kind === hh.kind)
        if (handle) {
          editor.beginTransaction()
          dragRef.current = {
            kind: 'splineHandle', layerId: selectedLayer.id, originalLayer: selectedLayer,
            pointId: hh.pointId, handleKind: hh.kind,
            startClientX: e.clientX, startClientY: e.clientY, startX: handle.x, startY: handle.y,
            worldToLocal: splineEdit.worldToLocal,
          }
          startDrag(e)
          return
        }
      }

      const hp = hitTestSplinePoint(splineEdit.worldSpline, cx, cy, tol)
      if (hp) {
        const p = selectedLayer.spline.points[hp]
        setSelectedSplinePointId(hp)
        editor.beginTransaction()
        dragRef.current = {
          kind: 'splinePoint', layerId: selectedLayer.id, originalLayer: selectedLayer,
          pointId: hp, startClientX: e.clientX, startClientY: e.clientY, startX: p.x, startY: p.y,
          worldToLocal: splineEdit.worldToLocal,
        }
        startDrag(e)
        return
      }

      // Pen mode: click on a segment inserts a point (De Casteljau split).
      if (toolMode === 'pen') {
        const hs = hitTestSplineSegment(splineEdit.worldSpline, cx, cy, 6 / zoom)
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
      if (tryStartPathEdit(selectedLayer, cx, cy, e)) return
    }

    // Alt/Option-click cycles through stacked layers under the cursor — useful
    // when a top layer (e.g. a full-canvas background) is blocking selection
    // of layers underneath. Plain click takes the topmost hit.
    //
    // Group semantics (Figma-style): clicking a grouped child SELECTS the
    // topmost ancestor group instead, so the group can be dragged. Alt-click
    // bypasses this and lets you pick the literal child.
    const requestedCloneMode = resolveCloneDragMode(e)
    let hit: string | null
    if (e.altKey && !requestedCloneMode) {
      const stack = hitTestLayersAt(geometryScene, timeMs, cx, cy, geometryOverrides)
      if (stack.length === 0) hit = null
      else {
        const cur = selectedLayerId ?? ''
        const idx = stack.indexOf(cur)
        hit = idx === -1 ? stack[0] : stack[(idx + 1) % stack.length]
      }
    } else {
      hit = hitTestLayer(geometryScene, timeMs, cx, cy, geometryOverrides)
      hit = canvasPickTarget(hit, layerIndex)
    }
    // Shift+click: toggle layer in/out of the multi-selection set and stop —
    // no drag is started, the user can re-click to drag their selection.
    // Skip when Cmd/Ctrl is held so Cmd+Shift+drag stays free for instance-clone.
    if (e.shiftKey && !e.altKey && !requestedCloneMode) {
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

    const ids = inMultiSet && selectedLayerIds?.size
      ? Array.from(selectedLayerIds) : [layer.id]
    beginMoveForSelection(ids, layer.id, e, null, requestedCloneMode)
  }, [scene, geometryScene, geometryOverrides, timeMs, width, height, overrides, onSelectLayer,
    editor, startDrag, panMode, beginPan, selectedLayerId, selectedLayerIds, previewMode,
    onLayerClickInPreview, toolMode, onSelectByGeometry, beginSelectionDrag, tryStartPathEdit,
    pathPickMode, onExitPathPickMode, splineDrawKind, onSplineDrawPointerDown, zoom,
    beginMoveForSelection, layerIndex, motionEditing])

  // ── Handle pointerdown → start resize ────────────────────────────────────
  const beginResize = useCallback((handle: Handle) => (e: React.PointerEvent) => {
    if (dragRef.current || editor.isTransactionActive()) return
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer || !layer.size) return
    const prepared = prepareTransformTargets(scene, [layer.id], timeMs, overrides)
    if (!prepared.ok) { setTransformWarning(prepared.reason); return }
    const target = prepared.targets[0]
    if (scene.timelines.some(tl => tl.tracks.some(track => track.target.startsWith(`layers.${layer.id}.size.`)))) {
      setTransformWarning('Edit animated size channels on the timeline before resizing the source geometry.')
      return
    }
    if (Math.abs(target.worldMatrix.determinant()) < 1e-9) {
      setTransformWarning('This layer is scaled to zero. Restore its scale before resizing.')
      return
    }
    const worldToLocal = target.worldMatrix.invert()
    setTransformWarning(null)
    editor.beginTransaction()
    dragRef.current = {
      kind: 'resize',
      layerId: layer.id,
      originalLayer: layer,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      worldToLocal, displayTransform: target.transform,
    }
    startDrag(e)
  }, [scene, timeMs, overrides, selectedLayerId, editor, startDrag])

  // ── Anchor handle pointerdown → start anchor drag ────────────────────────
  const beginAnchorDrag = useCallback((e: React.PointerEvent) => {
    if (dragRef.current || editor.isTransactionActive()) return
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer) return
    const prepared = prepareTransformTargets(scene, [layer.id], timeMs, overrides)
    if (!prepared.ok) { setTransformWarning(prepared.reason); return }
    if (scene.timelines.some(tl => tl.tracks.some(track =>
      track.target.startsWith(`layers.${layer.id}.transform.`) && track.keyframes.length > 0))) {
      setTransformWarning('Moving this pivot would change other animated poses. Keep its pivot or bake the transform first.')
      return
    }
    setTransformWarning(null)
    const frame = overrides ?? evaluateTimelines(scene.timelines, timeMs)
    const parentWorld = resolveParentWorldMatrix(layer, scene, timeMs, frame)
    if (Math.abs(parentWorld.determinant()) < 1e-9) return
    const displayTransform = { ...layer.transform, ...resolveDisplayTransform(layer, scene, timeMs, frame) }
    editor.beginTransaction()
    dragRef.current = {
      kind: 'anchor',
      layerId: layer.id,
      originalLayer: layer,
      startClientX: e.clientX,
      startClientY: e.clientY,
      parentWorld, displayTransform,
    }
    startDrag(e)
  }, [scene, timeMs, overrides, selectedLayerId, editor, startDrag])

  // ── Move-mode axis arrow pointerdown → constrained move drag ─────────────
  // Click X arrow → drag locked to horizontal. Click Y arrow → vertical.
  // Click center square → free (no lock). Mirrors 3DS Max move gizmo.
  const beginAxisMove = useCallback((axis: 'x' | 'y' | null) => (e: React.PointerEvent) => {
    if (e.button !== 0 || !selectedLayerId) return
    e.stopPropagation()
    e.preventDefault()
    const ids = selectedLayerIds?.size ? Array.from(selectedLayerIds) : [selectedLayerId]
    beginMoveForSelection(ids, selectedLayerId, e, axis)
  }, [selectedLayerId, selectedLayerIds, beginMoveForSelection])

  // ── Scale-mode axis gizmo pointerdown → scaleX/scaleY drag ──────────────
  // X arrow → modifies transform.scaleX. Y → scaleY. Centre → uniform.
  // Distinct from frame-resize (which mutates width/height) — this drives
  // the scale MATRIX, which is what keyframe animations interpolate.
  const beginScaleAxis = useCallback((axis: 'x' | 'y' | 'both') => (e: React.PointerEvent) => {
    if (dragRef.current || editor.isTransactionActive()) return
    if (e.button !== 0 || !selectedLayerId) return
    e.stopPropagation()
    e.preventDefault()
    const ids = selectedLayerIds?.size ? Array.from(selectedLayerIds) : [selectedLayerId]
    const prepared = prepareTransformTargets(scene, ids, timeMs, overrides, { activeId: selectedLayerId, pivotMode })
    if (!prepared.ok) { setTransformWarning(prepared.reason); return }
    const primary = prepared.targets.find(target => target.id === selectedLayerId) ?? prepared.targets[0]
    if (!primary) return
    setTransformWarning(null)
    editor.beginTransaction()
    dragRef.current = {
      kind: 'scaleAxis', layerId: primary.id, originalLayer: primary.originalLayer,
      axis, startClientX: e.clientX, startClientY: e.clientY,
      targets: prepared.targets, pivotX: prepared.pivot.x, pivotY: prepared.pivot.y,
    }
    startDrag(e)
  }, [scene, timeMs, overrides, selectedLayerId, selectedLayerIds, editor, dragRef, startDrag, pivotMode])

  /** Common bounding handles scale the whole selection about the opposite
   * handle, while retaining each root's source geometry and custom anchor. */
  const beginSelectionResize = useCallback((handle: Handle) => (event: React.PointerEvent) => {
    if (event.button !== 0 || dragRef.current || editor.isTransactionActive() || !selectedLayerId) return
    event.stopPropagation()
    event.preventDefault()
    const ids = selectedLayerIds?.size ? Array.from(selectedLayerIds) : [selectedLayerId]
    const prepared = prepareTransformTargets(scene, ids, timeMs, overrides, { activeId: selectedLayerId, pivotMode })
    if (!prepared.ok) { setTransformWarning(prepared.reason); return }
    const resolveBounds = createLayerWorldBoundsResolver(geometryScene, timeMs, geometryOverrides)
    const bounds = prepared.targets.reduce<PathBounds | null>((value, target) => {
      const layer = geometryScene.layers.find(item => item.id === target.id)
      const item = layer && resolveBounds(layer)
      return item ? unionBounds(value, item) : value
    }, null)
    const resize = bounds && selectionResize(bounds, handle, { x: 0, y: 0 }, false)
    if (!bounds || !resize) { setTransformWarning('This selection has no resizable bounds.'); return }
    const primary = prepared.targets.find(target => target.id === selectedLayerId) ?? prepared.targets[0]
    if (!primary) return
    setTransformWarning(null)
    editor.beginTransaction()
    dragRef.current = { kind: 'scaleAxis', layerId: primary.id, originalLayer: primary.originalLayer,
      axis: 'both', startClientX: event.clientX, startClientY: event.clientY,
      targets: prepared.targets, pivotX: resize.pivot.x, pivotY: resize.pivot.y,
      selectionResize: { bounds, handle } }
    startDrag(event)
  }, [scene, geometryScene, geometryOverrides, timeMs, overrides, selectedLayerId, selectedLayerIds,
    pivotMode, editor, dragRef, startDrag])

  // ── Preview-mode drag (fires dragStart/Move/End on draggable layers) ──────
  const { beginPreviewDrag } = usePreviewDrag({
    scene, onLayerDragInPreview, readScale, setDragOverrides,
  })

  // ── Rotation handle (corner-outer area) → rotate around anchor ──────────
  const beginRotate = useCallback((e: React.PointerEvent) => {
    if (dragRef.current || editor.isTransactionActive()) return
    if (e.button !== 0 || !selectedLayerId) return
    e.stopPropagation()
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const pointer = { x: (e.clientX - rect.left) * width / rect.width,
      y: (e.clientY - rect.top) * height / rect.height }
    const ids = selectedLayerIds?.size ? Array.from(selectedLayerIds) : [selectedLayerId]
    const prepared = prepareTransformTargets(scene, ids, timeMs, overrides, { activeId: selectedLayerId, pivotMode })
    if (!prepared.ok) { setTransformWarning(prepared.reason); return }
    const primary = prepared.targets.find(target => target.id === selectedLayerId) ?? prepared.targets[0]
    if (!primary) return
    const gesture = prepared.targets.length === 1
      ? beginRotationGesture(primary.originalLayer, scene, timeMs, pointer, overrides) ?? undefined
      : undefined
    if (prepared.targets.length === 1 && !gesture) return
    setTransformWarning(null)
    editor.beginTransaction()
    dragRef.current = {
      kind: 'rotate', layerId: primary.id, originalLayer: primary.originalLayer,
      startClientX: e.clientX, startClientY: e.clientY,
      startAngle: gesture?.startAngle ?? Math.atan2(pointer.y - prepared.pivot.y,
        pointer.x - prepared.pivot.x) * 180 / Math.PI,
      originalRotation: primary.transform.rotationDeg,
      anchorWorldX: prepared.pivot.x, anchorWorldY: prepared.pivot.y,
      gesture, targets: prepared.targets,
    }
    startDrag(e)
  }, [scene, timeMs, overrides, selectedLayerId, selectedLayerIds, editor, dragRef, startDrag, width, height, pivotMode])

  // ── Render canvas (scene + ghost / onion-skin overlay) ────────────────────
  useCanvasRenderer(canvasRef, {
    viewportRef: containerRef, viewportScale: zoom, viewportKey: `${zoom}:${pan.x}:${pan.y}`,
    scene, timeMs, selectedLayerId, selectedLayerIds, assets,
    snapEnabled, snapToGridOn, gridSize,
    overrides, paramValues, dragOverrides,
    ghostSettings, selectedTimeline, hideEditorUI,
  })


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
  const displayOverrides = useMemo(() => {
    const frame = overrides ?? evaluateTimelines(scene.timelines, timeMs)
    if (dragOverrides.size === 0) return frame
    const merged: OverrideMap = new Map()
    frame.forEach((v, k) => merged.set(k, v))
    dragOverrides.forEach((v, k) => merged.set(k, v))
    return merged
  }, [overrides, scene.timelines, timeMs, dragOverrides])
  // Selection frame anchor: prefer live display transform but keep the
  // static fallback so empty paths / unconfigured followPath layers still
  // get a sensible gizmo origin.
  const selectedWorldMatrix = useMemo(() => {
    if (!selectedLayer || hideEditorUI) return null
    return resolveLayerWorldMatrix(selectedLayer, scene, timeMs, displayOverrides)
  }, [selectedLayer, scene, timeMs, displayOverrides, hideEditorUI])
  // Most playback frames have no selection/hover bounds consumer. Keep this
  // scope lazy instead of materializing/indexing every layer just to discard
  // the resolver. Visible rulers still need their selected extents in playback.
  const boundsForFrame = useMemo(() => createLayerWorldBoundsResolver(geometryScene, timeMs,
    projectFrameFontOverrides(scene, displayOverrides, assets.fonts), { deferPreparation: true }), [scene, geometryScene, timeMs, displayOverrides, assets])
  const selectedWorldBounds = useMemo(() => rawSelectedLayer && (!hideEditorUI || showRulers)
    ? boundsForFrame(rawSelectedLayer)
    : null, [rawSelectedLayer, boundsForFrame, hideEditorUI, showRulers])

  const multiSelectionBounds = useMemo(() => !hideEditorUI && selectedLayerIds && selectedLayerIds.size > 1
    ? Array.from(selectedLayerIds).reduce<PathBounds | null>((value, id) => {
      const layer = scene.layers.find(item => item.id === id)
      const bounds = layer && boundsForFrame(layer)
      return bounds ? unionBounds(value, bounds) : value
    }, null) : null, [scene.layers, selectedLayerIds, boundsForFrame, hideEditorUI])

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
  // BL-66 — during playback / preview ALL gizmos are suppressed (editor chrome).
  // Gating the whole object here means showFrame (depends on gizmo.frame) and
  // every axis/ring/anchor handle below collapse to false in one place.
  const gizmo = hideEditorUI || motionEditing ? {
    frame: false, resize: false, cornerRot: false, ring: false,
    axisMove: false, axisScale: false, anchor: false,
  } : {
    frame:     toolMode !== 'anchor' && toolMode !== 'pan' && toolMode !== 'pen',
    resize:    toolMode === 'select' || toolMode === 'scale',
    cornerRot: toolMode === 'select',
    ring:      toolMode === 'rotate',
    axisMove:  toolMode === 'move',
    axisScale: toolMode === 'scale',
    anchor:    toolMode === 'anchor',
  }
  const actualWorldPivot = selectedWorldMatrix && selectedLayer
    ? selectedWorldMatrix.applyToPoint({ x: selectedLayer.transform.anchorX, y: selectedLayer.transform.anchorY })
    : { x: 0, y: 0 }
  const multiPreparation = useMemo(() => !hideEditorUI && selectedLayerIds && selectedLayerIds.size > 1
    ? prepareTransformTargets(scene, selectedLayerIds, timeMs, displayOverrides,
      { activeId: selectedLayerId ?? undefined, pivotMode }) : null,
  [scene, selectedLayerIds, selectedLayerId, timeMs, displayOverrides, hideEditorUI, pivotMode])
  // A running gesture displays the same fixed pivot used by its calculation.
  const activeDrag = dragRef.current
  const gesturePivot = activeDrag?.kind === 'rotate'
    ? { x: activeDrag.anchorWorldX, y: activeDrag.anchorWorldY }
    : activeDrag?.kind === 'scaleAxis' && activeDrag.pivotX !== undefined && activeDrag.pivotY !== undefined
      ? { x: activeDrag.pivotX, y: activeDrag.pivotY } : null
  const selectedWorldPivot = toolMode === 'anchor' ? actualWorldPivot
    : gesturePivot ?? (multiPreparation?.ok ? multiPreparation.pivot : actualWorldPivot)
  const transformWorldBounds = multiSelectionBounds ?? selectedWorldBounds
  // Vector geometry wins over retained size metadata; groups use the union
  // of visible children. Regular sized objects keep their resize frame.
  const usesWorldFrame = selectedLayer?.type === 'path' || selectedLayer?.type === 'spline' || selectedLayer?.type === 'group'
  const hasFrameGeometry = !!selectedLayer && (usesWorldFrame ? !!selectedWorldBounds : !!selectedLayer.size)
  const showFrame =
    !!selectedLayer && hasFrameGeometry && !selectedLayer.locked && !selectedLayer.frozen && !selectedLayer.hidden
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
              if (motionEditing || previewMode) return
              const cv = canvasRef.current
              if (!cv) return
              const rect = cv.getBoundingClientRect()
              const sx = width  / rect.width
              const sy = height / rect.height
              const cx = (e.clientX - rect.left) * sx
              const cy = (e.clientY - rect.top)  * sy
              const hitId = hitTestLayer(geometryScene, timeMs, cx, cy, geometryOverrides)
              const hitLayer = hitId ? scene.layers.find((l) => l.id === hitId) : null
              if (hitLayer?.type === 'path' && !hitLayer.locked) {
                onSelectLayer(hitId!)
                onToolModeChange?.('pen')
              }
            }}
            onContextMenu={(e) => {
              if (motionEditing || previewMode) return // Motion keys own canvas editing while active.
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
              const splineEdit = selSpline && !selSpline.locked && !selSpline.frozen && !selSpline.hidden
                ? resolveSplineEditGeometry(selSpline, scene, timeMs, overrides)
                : null
              if (selSpline?.spline && splineEdit) {
                const hp = hitTestSplinePoint(splineEdit.worldSpline, cx, cy, 8 / zoom)
                const hs = hp ? null : hitTestSplineSegment(splineEdit.worldSpline, cx, cy, 6 / zoom)
                const hc = (hp || hs) ? null : hitTestSplineContour(splineEdit.worldSpline, cx, cy)
                if (hp || hs || hc) {
                  e.preventDefault()
                  if (hp)      { setSelectedSplinePointId(hp); splineCtxTargetRef.current = { kind: 'point', id: hp } }
                  else if (hs) { splineCtxTargetRef.current = { kind: 'segment', id: hs.segmentId, t: hs.t } }
                  else         { splineCtxTargetRef.current = { kind: 'contour', id: hc! } }
                  splineCtx.open(e)
                  return
                }
              }

              const hit = hitTestLayer(geometryScene, timeMs, cx, cy, geometryOverrides)
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
              if (motionEditing || panMode || previewMode || dragRef.current || panDragRef.current) return
              if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current)
              const clientX = e.clientX, clientY = e.clientY, deepPick = e.altKey
              hoverRafRef.current = requestAnimationFrame(() => {
                const cv = canvasRef.current
                if (!cv) return
                const rect = cv.getBoundingClientRect()
                const sx = width  / rect.width
                const sy = height / rect.height
                const cx = (clientX - rect.left) * sx
                const cy = (clientY - rect.top)  * sy
                const hit = hitTestLayer(geometryScene, timeMs, cx, cy, geometryOverrides)
                const target = canvasPickTarget(hit, layerIndex, deepPick)
                setHoveredLayerId((cur) => (cur === target ? cur : target))

                // BL-73 — hover over the selected spline's points / handles /
                // segments (priority: handle → point → segment). Local coords;
                // tolerance scaled by zoom so it stays ~8 screen px.
                const sel = scene.layers.find((l) => l.id === selectedLayerId)
                const splineEdit = sel && !sel.locked && !sel.frozen && !sel.hidden
                  ? resolveSplineEditGeometry(sel, scene, timeMs, overrides)
                  : null
                if (splineEdit
                    && (toolMode === 'select' || toolMode === 'pen')) {
                  const tol = 8 / zoom
                  const hh = hitTestSplineHandle(splineEdit.worldSpline, cx, cy, tol)
                  if (hh) setSplineHover({ kind: 'handle', pointId: hh.pointId, handleKind: hh.kind })
                  else {
                    const hp = hitTestSplinePoint(splineEdit.worldSpline, cx, cy, tol)
                    if (hp) setSplineHover({ kind: 'point', id: hp })
                    else {
                      const hs = hitTestSplineSegment(splineEdit.worldSpline, cx, cy, tol)
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
            const bounds = boundsForFrame(hl)
            if (!bounds) return null
            return (
              <div
                key={hoveredLayerId}
                className="absolute pointer-events-none border-2 border-red-500/80 box-border
                           hover-preview-in transition-[border-color,border-width] duration-150"
                style={{
                  left: bounds.x * zoom,
                  top: bounds.y * zoom,
                  width: bounds.width * zoom,
                  height: bounds.height * zoom,
                }}
              />
            )
          })()}

          {/* Motion path — trajectory the selected layer follows over time,
              sampled from the position-keyframe interpolation. Drawn UNDER
              the selection frame so handles stay clickable. */}
          {selectedLayer && !hideEditorUI && (
            <MotionPathOverlay
              layer={selectedLayer}
              scene={scene}
              zoom={zoom}
              currentTimeMs={motionTime}
              editor={editor}
              compositionWidth={width}
              timelineId={selectedTimeline?.id}
              selectedKeyframeIds={selectedKeyframeIds ?? NO_MOTION_KEYS}
              onSelectKeyframes={onSelectKeyframes ?? (() => {})}
              onSeek={onSeekKeyframe ?? (() => {})}
              canvasRef={canvasRef}
              controlsHostRef={containerRef}
              mode={motionMode}
              onModeChange={setMotionMode}
              snapWorldPoint={point => engineRef.current?.snapPoint(point) ?? point}
              onEditPathSource={sourceId => {
                setMotionMode('off'); onSelectLayer(sourceId); onToolModeChange?.('pen')
              }}
              onEditProgressTiming={layerId => { setMotionMode('off'); onEditMotionTiming?.(layerId) }}
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
            showMotionGuides={!hideEditorUI}
          />

          {/* BL-66 — Anchor + bezier handle visualization for the selected
              path layer. Shown whenever a path layer is selected (not just
              in pen mode) so users can see the structure they're editing. */}
          {selectedLayer && selectedWorldMatrix && selectedLayer.type === 'path' && selectedLayer.path && !hideEditorUI && !motionEditing && (
            <PathEditOverlay layer={selectedLayer} zoom={zoom} worldMatrix={selectedWorldMatrix} />
          )}

          {/* BL-73 — Control points + bezier handles for the selected spline. */}
          {selectedLayer && selectedWorldMatrix && selectedLayer.spline && !hideEditorUI && !motionEditing
            && !selectedLayer.hidden && !selectedLayer.locked && !selectedLayer.frozen && (
            <SplineEditOverlay layer={selectedLayer} zoom={zoom} worldMatrix={selectedWorldMatrix}
              hover={splineHover} selectedPointId={selectedSplinePointId} />
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

          {/* Keep secondary selections visible without adding competing handles. */}
          {!hideEditorUI && selectedLayerIds && Array.from(selectedLayerIds).map(id => {
            if (id === selectedLayerId) return null
            const layer = scene.layers.find(l => l.id === id)
            if (!layer || layer.hidden) return null
            const bounds = boundsForFrame(layer)
            if (!bounds) return null
            return <div key={id} className="absolute pointer-events-none border border-blue-400/90 box-border"
              style={{ left: bounds.x * zoom, top: bounds.y * zoom, width: bounds.width * zoom, height: bounds.height * zoom }} />
          })}

          {showFrame && !usesWorldFrame && selectedLayer.size && selectedWorldMatrix && (
            <AffineSelectionFrame
              width={selectedLayer.size.width}
              height={selectedLayer.size.height}
              zoom={zoom}
              worldMatrix={selectedWorldMatrix}
              onHandlePointerDown={gizmo.resize && rawSelectedLayer?.size && !multiSelectionBounds ? beginResize : undefined}
              onRotatePointerDown={gizmo.cornerRot && !multiSelectionBounds ? beginRotate : undefined}
            />
          )}

          {/* One geometry-driven frame for vectors, groups and their instances. */}
          {showFrame && usesWorldFrame && selectedWorldBounds && !multiSelectionBounds && (
            <SelectionFrame
              x={selectedWorldBounds.x * zoom}
              y={selectedWorldBounds.y * zoom}
              w={selectedWorldBounds.width * zoom}
              h={selectedWorldBounds.height * zoom}
              anchorOffsetX={(selectedWorldPivot.x - selectedWorldBounds.x) * zoom}
              anchorOffsetY={(selectedWorldPivot.y - selectedWorldBounds.y) * zoom}
              rotationDeg={0}
              onRotatePointerDown={gizmo.cornerRot ? beginRotate : undefined}
            />
          )}

          {showFrame && multiSelectionBounds && <SelectionFrame selectionKind="multiple"
            x={multiSelectionBounds.x * zoom} y={multiSelectionBounds.y * zoom}
            w={multiSelectionBounds.width * zoom} h={multiSelectionBounds.height * zoom}
            anchorOffsetX={(selectedWorldPivot.x - multiSelectionBounds.x) * zoom}
            anchorOffsetY={(selectedWorldPivot.y - multiSelectionBounds.y) * zoom}
            rotationDeg={0} onHandlePointerDown={gizmo.resize ? beginSelectionResize : undefined}
            onRotatePointerDown={gizmo.cornerRot ? beginRotate : undefined} />}

          {/* Move-mode axis arrows — X (red) / Y (blue) / center square.
              Anchored at the layer's pivot in world space, screen-aligned so
              they don't rotate with the layer (matches 3DS Max behaviour). */}
          {gizmo.axisMove && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <MoveAxisGizmo
              x={selectedWorldPivot.x * zoom}
              y={selectedWorldPivot.y * zoom}
              onAxisPointerDown={beginAxisMove}
            />
          )}

          {/* Scale-mode axis gizmo — X/Y arrows with SQUARE caps + centre
              uniform handle. Drives transform.scaleX/Y (matrix), distinct
              from frame resize which mutates width/height (geometry). */}
          {gizmo.axisScale && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <ScaleAxisGizmo
              x={selectedWorldPivot.x * zoom}
              y={selectedWorldPivot.y * zoom}
              onAxisPointerDown={beginScaleAxis}
            />
          )}

          {/* Rotate-mode ring — big orange circle around anchor.
              Radius scales with the layer size (min 60 CSS px) so the ring
              stays clearly outside the frame even for big shapes. */}
          {gizmo.ring && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <RotateRing
              x={selectedWorldPivot.x * zoom}
              y={selectedWorldPivot.y * zoom}
              radius={transformWorldBounds ? Math.max(
                60,
                Math.abs(transformWorldBounds.x - selectedWorldPivot.x) * zoom + 16,
                Math.abs(transformWorldBounds.x + transformWorldBounds.width - selectedWorldPivot.x) * zoom + 16,
                Math.abs(transformWorldBounds.y - selectedWorldPivot.y) * zoom + 16,
                Math.abs(transformWorldBounds.y + transformWorldBounds.height - selectedWorldPivot.y) * zoom + 16,
              ) : 60}
              isDragging={dragRef.current?.kind === 'rotate'}
              onPointerDown={beginRotate}
            />
          )}

          {/* Rotate shows the actual center; only Anchor mode can drag it. */}
          {(gizmo.anchor || gizmo.ring) && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <AnchorHandle
              x={selectedWorldPivot.x * zoom}
              y={selectedWorldPivot.y * zoom}
              isDragging={dragRef.current?.kind === 'anchor'}
              onPointerDown={gizmo.anchor ? beginAnchorDrag : undefined}
            />
          )}

          {/* Drag-time numeric readout (position / rotation / size) */}
          {dragHud && <TransformHUD {...dragHud} />}
          {!hideEditorUI && selectedLayer && <div data-testid="canvas-selection-summary"
            className="absolute bottom-2 left-2 rounded bg-slate-950/90 px-2 py-1 text-[11px] text-blue-100 border border-blue-400/50 z-40">
            {(selectedLayerIds?.size ?? 0) > 1 ? `${selectedLayerIds!.size} selected` : selectedLayer.name}
            {' · '}{toolMode ?? 'select'}
            {(selectedLayerIds?.size ?? 0) > 1 && <label className="ml-2">Pivot <select
              aria-label="Selection pivot" value={pivotMode} onPointerDown={event => event.stopPropagation()}
              onChange={event => setPivotMode(event.target.value as 'selectionCenter' | 'active')}
              className="rounded bg-slate-800 px-1 py-0.5 text-blue-100">
              <option value="selectionCenter">Selection center</option><option value="active">Active object</option>
            </select></label>}

          </div>}
          {!hideEditorUI && transformWarning && <div role="status"
            className="absolute top-10 left-2 right-2 rounded border border-amber-500/60 bg-slate-950/95 p-2 text-xs text-amber-100 z-50">
            {transformWarning}
          </div>}


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

      {/* Rulers share the displayed geometry bounds used by selection/hover. */}
      {showRulers && containerRef.current && (
        <Rulers
          composition={{ width, height }}
          zoom={zoom}
          pan={pan}
          containerEl={containerRef.current}
          selectedRect={
            selectedLayer && !selectedLayer.hidden
              ? selectedWorldBounds ?? undefined
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

      <ViewportPerformanceOverlay />

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
          <button onClick={zoomOut}
            className="px-1.5 py-0.5 rounded hover:bg-gray-700" title="Zoom out (Cmd+scroll)">−</button>
          <button onClick={actualSize}
            className="min-w-[42px] text-center px-1.5 py-0.5 rounded hover:bg-gray-700" title="Reset to 100% + recentre">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={zoomIn}
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
          : 'Drag = move · Arrows = 1px · Shift+Arrows = 10px · Shift = axis-lock · Handles to resize · ⌘ = aspect-lock · ⌘+scroll = zoom · Mid-mouse = pan'}
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
