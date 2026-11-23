'use client'
import { transformAxisFrame, type TransformSpace } from '@/lib/canvas/math/transformAxes'
import { booleanOwner } from '@/lib/editor/boolean/operationPlan'
import { projectBooleanOperations } from '@/lib/booleanOperations/projectOperations'
import { useEditorDisplayAvailable } from '@/components/editorDisplay/useEditorDisplay'
import { useModelCamera } from './canvas/model3d/useModelCamera'
import { detailUnavailableReason, hasItemDetailEntry } from '@/lib/editor/detail'
import { ModelCameraToolbar } from './canvas/model3d/ModelCameraToolbar'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import {
  useRef, useEffect, useCallback, useState, useMemo,
} from 'react'
import type { ChronoScene, Layer, BezierPath, Timeline } from '@/lib/types'
import type { TimelineGhostSettings } from '@/lib/types/editor'
import { projectFrameFonts, projectFrameFontOverrides } from '@/lib/render/media/projectFrameFonts'
import { hitTestLayer, hitTestLayersAt, type AssetElementMap } from '@/lib/renderer'
import { resolveInstanceLayer } from '@/lib/clone/InstanceResolver'
import { resolveDisplayTransform } from '@/lib/render/resolveDisplayTransform'
import { selectionGeometry, usesGeometryDrivenSelectionFrame } from './canvas/overlays/selectionGeometry'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import { drivenChannelReason } from '@/lib/timeline/authoring/keyableChannels'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { makeUpdateLayerCmd, makeBulkToggleFlagCmd } from '@/lib/editor/commands-layer'
import type { CloneMode } from '@/lib/clone/CloneTypes'
// BL-73 — Spline drawing tools
import type { SplinePrimitiveKind } from '@/lib/types/spline'
import type { Guide } from '@/lib/snap/AlignmentGuides'
import { SnapEngine, type SnapEngineSettings } from '@/lib/snap/SnapEngine'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { SelectionToolMode } from './TopToolbar/ToolGroup'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { ViewportLayerChange } from '@/lib/editor/viewportKeyframes'
import type { SnapSettingsHook } from '@/app/hooks/useSnapSettings'
import MotionPathOverlay from './MotionPathOverlay'
import { ArrayViewportOverlay } from './array/ArrayViewportOverlay'
import type { ArrayAuthoringController } from './array/useArrayAuthoring'
import { useSelectionMeasurements } from './canvas/layout/useSelectionMeasurements'
import { SelectionMeasurementsOverlay, SelectionGapControls } from './canvas/layout/SelectionMeasurementsOverlay'
import { evaluateTrajectoryFrame, prepareTrajectoryContext } from '@/lib/timeline/trajectory'
import ViewportPerformanceOverlay from './resources/ViewportPerformanceOverlay'
import PathGuideOverlay from './PathGuideOverlay'
import PathEditOverlay from './PathEditOverlay'
import type { SplineDrawResult } from './splineEdit/drawing/drawingCommand'
import SplineEditOverlay from './SplineEditOverlay'
import { BooleanEditOverlay } from './booleanPreview/BooleanEditOverlay'
import { useSplineEditSelection, type SplineEditController } from './splineEdit/useSplineEditSelection'
import { useSplineViewportEditing } from './splineEdit/useSplineViewportEditing'
import { SplineEditMenu } from './splineEdit/SplineEditMenu'
import { BooleanPreviewOverlay } from './booleanPreview/BooleanPreviewOverlay'
import { SplineOutlineOverlay } from './splineEdit/outline/SplineOutlineOverlay'
import { SplineCornerOverlay } from './splineEdit/preview/SplineCornerOverlay'
import ContextMenu, { useContextMenu } from './ui/ContextMenu'
import { buildAddLayerMenu } from '@/components/layers/add/buildAddLayerMenu'
import { agentHandoffMenu } from './agentHandoff/menu'
import type { AgentHandoffRequest } from '@/lib/agentHandoff/prompt'
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
import { GeometryEditGhost } from './canvas/overlays/GeometryEditGhost'
import { useGeometryEditKeyboard } from './canvas/mesh2d/useGeometryEditKeyboard'
import { useMeshViewportEditing } from './canvas/mesh2d/useMeshViewportEditing'
import { MeshComponentOverlay } from './canvas/mesh2d/MeshComponentOverlay'
import { useMeshEditSession } from './canvas/mesh2d/useMeshEditSession'
import { OffArtboardOverlay } from './canvas/overlays/OffArtboardOverlay'
import { isOffArtboardBounds } from '@/lib/canvas/math/offArtboardOutlines'
import { AnchorHandle } from './canvas/overlays/AnchorHandle'
import { SelectionOriginsOverlay } from './canvas/overlays/SelectionOriginsOverlay'
import { SoloModeOverlay } from './canvas/overlays/SoloModeOverlay'
import { MoveAxisGizmo, ScaleAxisGizmo } from './canvas/overlays/AxisGizmos'
import { RotateRing } from './canvas/overlays/RotateRing'
import { SnapPointOverlay } from './canvas/overlays/SnapPointOverlay'
import { TransformHUD } from './canvas/overlays/TransformHUD'
import { CanvasGuideWorkspace } from './canvas/guides/CanvasGuideWorkspace'
import { FitMenu } from './canvas/controls/FitMenu'
import { ZoomScaleMenu } from './canvas/controls/ZoomScaleMenu'
import { SnapSettingsMenu } from './canvas/controls/SnapSettingsMenu'
import { gridSnappingEnabled } from '@/lib/snap/gridSettings'
import { ViewMenu } from './canvas/controls/ViewMenu'
import { prepareSceneSnapContext } from '@/lib/snap/prepareSceneSnapContext'
import { ViewportStatusBar } from './canvas/controls/ViewportStatusBar'
import { useCanvasRenderer } from './canvas/hooks/useCanvasRenderer'
import { usePreviewDrag } from './canvas/hooks/usePreviewDrag'
import { useSelectionTools } from './canvas/hooks/useSelectionTools'
import { selectionRegionForTool, selectionModeForModifiers, type SelectionRegionStyle } from '@/lib/selection/selectionGesture'
import { CanvasSelectionEligibility } from '@/lib/selection/CanvasSelectionEligibility'
import { useSplineDrawing } from './canvas/hooks/useSplineDrawing'
import { splineContinuation } from '@/lib/spline'
import { useZoomAndPan } from './canvas/hooks/useZoomAndPan'
import { useCanvasDrag } from './canvas/hooks/useCanvasDrag'
import { interactionTrace } from './canvas/interactions/diagnostics'
import { useShapePlacement } from './canvas/placement/useShapePlacement'
import { ShapePlacementOutline } from './canvas/placement/ShapePlacementOutline'
import { resolveCloneDragMode } from '@/lib/shortcuts/cloneDragGesture'
import { usePathEdit } from './canvas/hooks/usePathEdit'
import { TextEditOverlay } from './canvas/TextEditOverlay'
import { syncTextLayerSize } from '@/lib/text/measureText'
import { resolveSplineEditGeometry } from './canvas/splineEditGeometry'
import { createLayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'
import { beginRotationGesture, resolveParentWorldMatrix } from '@/lib/canvas/math/rotationGesture'
import { prepareTransformTargets } from '@/lib/canvas/math/preparedTransforms'
import { canvasSelectionPickTarget } from '@/lib/selection/pickTarget'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { unionBounds } from '@/lib/geometry/boundsMath'
import type { PathBounds } from '@/lib/geometry/computePathBounds'
import { selectionResize } from '@/lib/canvas/math/selectionResize'
import { makeTransformMeshGeometryCmd } from '@/lib/editor/modifiers/commands'
import { evaluateTimelines, type OverrideMap } from '@/lib/evaluator'
import { canvasOwnsPointDeletion } from '@/lib/editor/keyboardContext'
import type { ShortcutContext } from '@/lib/shortcuts'
import { Mesh2DTextureOverlay } from './canvas/mesh2d/Mesh2DTextureOverlay'
import { PhysicsViewportOverlay } from './physics/PhysicsViewportOverlay'
import type { PhysicsViewportOverlaySettings } from './physics/PhysicsViewportOverlayState'

interface Props {
  /** Content host owns source controls: retain pan/zoom and model camera, but
   * hide/disable outer guides, motion-key authoring and layer context commands. */
  contentInspection?: boolean
  /** Optional content host; existing path double-click still enters Pen. */
  onEditContent?: (id: string) => void
  onIsolateContent?: (ids: readonly string[]) => void
  scene: ChronoScene
  /** Display/hit-test-only projection; commands always borrow scene as source. */
  displayScene?: ChronoScene
  editor: EditorStateReturn
  getShortcutContext?: () => ShortcutContext
  timeMs: number
  selectedLayerId: string | null
  /** Multi-selection set — when set has >1 entries, drag operations move
   *  ALL of them together (group-style transform). */
  selectedLayerIds?: Set<string>
  /** Persistent marquee type; blank-canvas drags use it while Select remains active. */
  selectionToolMode?: SelectionToolMode
  /** Copy a focused MCP task prompt from a canvas right-click. */
  onAgentHandoff?: (request: AgentHandoffRequest) => void
  assets: AssetElementMap
  onSelectLayer: (id: string | null, shiftHeld?: boolean) => void
  /** One-shot request to edit a freshly inserted text layer in the viewport. */
  textEditRequestId?: string | null
  onTextEditRequestDone?: () => void
  /** Replace selection atomically with every new forest root after drag-copy. */
  onSelectLayers?: (ids: readonly string[]) => void
  /** Remembers the last Cmd/Ctrl clone-drag offset for repeated Duplicate. */
  onAfterCloneDrag?: (offset: { x: number; y: number }) => void
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
    | 'texture'
    | 'selection-box' | 'selection-lasso' | 'selection-circle' | 'selection-paint'
    | 'spline-draw' | 'shape-draw'
  /** BL-66 — Push a tool-mode change up to the page (e.g. double-clicking a
   *  path enters pen mode so the user can immediately edit it; cancelling
   *  path pick mode returns to 'select'). */
  onToolModeChange?: (next: 'select' | 'pan' | 'pen' | 'move' | 'rotate' | 'scale' | 'anchor' | 'texture') => void
  /** BL-73 — Active spline primitive being drawn (null = not in draw mode). */
  splineDrawKind?: SplinePrimitiveKind | null
  /** BL-73 — When set, drawn splines append into this layer instead of a new one. */
  splineAppendTargetId?: string | null
  /** BL-73 — Called after a spline draw commits (page resets draw mode). */
  onSplineDrawCommit?: (result?: SplineDrawResult) => void
  splineContinuationPointId?: string | null
  splineAutoClose?: boolean
  /** Enter line drawing into this spline, or null for a new layer. */
  onDrawSplineLine?: (layerId: string | null, endpointId?: string) => void
  /** BL-73 Sprint 5 — mirrors the selected spline point id up to the page so
   *  the properties panel can show a point editor. */
  onSplinePointSelected?: (pointId: string | null) => void
  /** Shared transient sub-object and preview owners; previews use composition pixels and never enter exports. */
  splineEdit?: SplineEditController
  /** Panel-owned mesh/generated-geometry settings session; hides layer gizmos. */
  geometryEditMode?: 'point' | 'edge' | 'object'
  geometryEditActive?: boolean
  onExitGeometryEdit?: () => void
  onOpenSplineTools?: () => void
  booleanPreview?: import('@/lib/geometry/boolean').BooleanResult | null
  splineTangentClipboard?: import('./splineEdit/useSplineTangentClipboard').SplineTangentClipboard
  splineToolActions?: readonly import('./splineEdit/tools/splineEditTools').SplineToolAction[]
  outlinePreview?: import('@/lib/spline/outline').OutlineResult | null
  chamferPreview?: import('@/lib/spline/chamfer').ChamferResult | null
  filletPreview?: import('@/lib/spline/fillet').FilletResult | null
  onEditOperation?: (layerId: string) => void
  onBooleanPreview?: () => void
  /** BL-60 Faz 3 — Replace / add / subtract layers from the current selection
   *  after a canvas selection-tool drag completes. Mode is 'replace' (plain
   *  drag), 'add' (Shift+drag), or 'subtract' (Alt+drag). */
  onSelectByGeometry?: (layerIds: Set<string>, mode: 'replace' | 'add' | 'subtract') => void
  /** BL-60 Faz 3 — Hit-test mode for selection tools:
   *  'touching' (default) = any layer whose bounds overlap the drawn shape
   *  'inside'             = only layers whose bounds fit fully within the shape */
  selectionContainMode?: 'inside' | 'touching'
  /** Shared toolbox basis for interactive Move/Scale and Edit constraints. */
  transformSpace?: TransformSpace
  /** Persistent region preference for empty-space drags, independent of tool. */
  selectionStyle?: SelectionRegionStyle
  /** Precision settings owned by the page and edited through the main Snap menu. */
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
    addLayer?: (kind: string) => void
    fitParent?: () => void
    cut?:       () => void
    copy?:      () => void
    paste?:     () => void
    canPaste?:  boolean
    duplicate?: () => void
    group?:     () => void
    ungroup?:   (id?: string) => void
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
    convertToMesh2D?: () => void
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
  /** Dock host for trajectory controls; null means its tab is hidden. */
  motionControlsHost?: HTMLElement | null
  /** Open the Motion Keys tab without changing scene/history. */
  onOpenMotionControls?: () => void
  onEditMotionTiming?: (layerId: string) => void
  /** Transient bounded Array plan; source/history stays owned by the editor. */
  arrayAuthoring?: ArrayAuthoringController
  /** Registry-created native shape template, held outside persistent source
   * until a canvas placement commits. Repeat drawing supplies a fresh template
   * after each commit; paths/splines keep their dedicated tools. */
  shapePlacementLayer?: Layer | null
  shapePlacementHint?: { x: number; y: number }
  /** A committed ID selects the new shape and may rearm a fresh template;
   * no ID means cancelled placement. Never reuse an already committed ID. */
  onShapePlacementComplete?: (id?: string) => void
  /** Local editor-only fracture diagnostics; never part of scene/export. */
  physicsOverlay?: PhysicsViewportOverlaySettings
  /** Select an editor-only fracture bond without changing scene history. */
  onPhysicsBondSelect?: (bondId: string) => void
}

const PADDING   = 24
const NO_MOTION_KEYS: ReadonlySet<string> = new Set()

export default function SceneCanvas({
  scene, displayScene = scene, editor, getShortcutContext, timeMs, selectedLayerId, selectedLayerIds, selectionToolMode, assets, onSelectLayer, onSelectLayers, onAgentHandoff,
  textEditRequestId, onTextEditRequestDone,
  overrides: runtimeOverrides, paramValues, previewMode, isPlaying, onLayerClickInPreview, onLayerDragInPreview,
  panMode: controlledPanMode, onPanModeChange, toolMode, onToolModeChange, snap,
  onSelectByGeometry, selectionContainMode = 'touching', selectionStyle = 'box', transformSpace = 'scene',
  fullscreen, onToggleFullscreen,
  menuHandlers, onAfterLayerCommit, onAfterCloneDrag, buildLayerCommitCommands,
  contentInspection = false,
  onEditContent, onIsolateContent,
  ghostSettings, selectedTimeline,
  selectedKeyframeIds, onSelectKeyframes, onSeekKeyframe, onMotionEditingChange, onEditMotionTiming, motionControlsHost, onOpenMotionControls,
  arrayAuthoring, shapePlacementLayer = null, shapePlacementHint, onShapePlacementComplete,
  physicsOverlay, onPhysicsBondSelect,
  pathPickMode = null, onAssignPath, onExitPathPickMode,
  splineDrawKind = null, splineAppendTargetId = null, splineContinuationPointId = null, splineAutoClose = false, onSplineDrawCommit, onDrawSplineLine, onSplinePointSelected, splineEdit: suppliedSplineEdit, geometryEditActive = false, geometryEditMode = 'object', onExitGeometryEdit, onOpenSplineTools, splineToolActions, splineTangentClipboard, booleanPreview, outlinePreview, chamferPreview, filletPreview, onEditOperation, onBooleanPreview,
}: Props) {
  const [hoveredPickPathId, setHoveredPickPathId] = useState<string | null>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  useEffect(() => {
    if (textEditRequestId && scene.layers.some(layer => layer.id === textEditRequestId)) {
      setEditingTextId(textEditRequestId)
    }
  }, [textEditRequestId, scene.layers])

  // BL-66 — hide all editor chrome (selection, gizmos, grid, overlays) during
  // playback or preview so the viewport shows clean animation content. This is
  // the editor-side mirror of CanvasRenderer's renderMode='preview'.
  const displayAvailable = useEditorDisplayAvailable()
  const hideEditorUI = !!previewMode || !!isPlaying || !displayAvailable
  const [transformWarning, setTransformWarning] = useState<string | null>(null)
  const [offArtboardDiagnostic, setOffArtboardDiagnostic] = useState('')
  const [pivotMode, setPivotMode] = useState<'selectionCenter' | 'active'>('selectionCenter')
  const [motionMode, setMotionMode] = useState<'off' | 'select' | 'add' | 'draw'>('off')
  const motionEditing = motionMode !== 'off'
  const arrayEditing = !!arrayAuthoring?.active
  const placingShape = !!shapePlacementLayer && toolMode === 'shape-draw'
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
  useEffect(() => { if (arrayEditing || placingShape) setMotionMode('off') }, [arrayEditing, placingShape])
  useEffect(() => { onMotionEditingChange?.(motionEditing); return () => onMotionEditingChange?.(false) },
    [motionEditing, onMotionEditingChange])

  // Borrow aliases only for geometry queries. Editor commands continue using
  // the authored scene/ref, keeping runtime names out of history and save data.
  const geometryScene = useMemo(() => projectFrameFonts(projectBooleanOperations(displayScene), assets.fonts), [displayScene, assets])
  const geometryOverrides = useMemo(() => overrides && projectFrameFontOverrides(scene, overrides, assets.fonts), [scene, overrides, assets])
  const meshFrameQuery = useMemo(() => ({ meshDeformations: assets.meshDeformations }), [assets])
  const geometrySceneRef = useRef(geometryScene)
  useEffect(() => { geometrySceneRef.current = geometryScene }, [geometryScene])
  const { width, height } = scene.composition
  const layerIndex = useMemo(() => new LayerIndex(scene.layers), [scene.layers])

  // ── Viewport: zoom / pan / fit presets / wheel zoom / pan drag ────────────
  const {
    zoom, pan, panDragRef, isPanning, cancelPan,
    fitAll, fitWidth, fitHeight, actualSize, zoomTo, fitSelection, centreSelection,
    zoomIn, zoomOut, beginPan, handleWheel,
  } = useZoomAndPan({ width, height, padding: PADDING, containerRef, scene: geometryScene,
    selectedLayerId, timeMs, overrides: geometryOverrides, ...meshFrameQuery })

  // ── Snap config — owned upstream by useSnapSettings ─────────────────────
  // Mirror to a ref so pointermove closures see fresh values without being
  // re-created every settings change (drag handlers run thousands of times).
  // Naming kept ("master/grid/objects/...") so the algorithm below didn't
  // need to be rewritten when the source moved up the tree.
  const snapSettings = snap.settings
  const snapEnabled   = snapSettings.enabled
  const snapToGridOn  = gridSnappingEnabled(snapSettings)
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
  const pointerSnapContext = useMemo(() => {
    if (!snapEnabled || hideEditorUI || arrayEditing) return { canvasWidth: width, canvasHeight: height, otherLayers: [] }
    return prepareSceneSnapContext(geometryScene, timeMs, geometryOverrides,
      placingShape && shapePlacementLayer ? [shapePlacementLayer.id] : Array.from(selectedLayerIds?.size ? selectedLayerIds : selectedLayerId ? [selectedLayerId] : []),
      snapToObjects || snapToPoints ? new Set(displayScene.layers.map(layer => layer.id)) : new Set())
  }, [geometryScene, timeMs, geometryOverrides, selectedLayerIds, selectedLayerId, placingShape, shapePlacementLayer?.id,
    displayScene.layers, snapEnabled, hideEditorUI, arrayEditing, width, height, snapToObjects, snapToPoints])
  /** Physical pointer remains unchanged; tools and editor feedback consume the
   * same nearest composition-space target at the actual CSS viewport scale. */
  const resolvePointerSnap = useCallback((point: { x: number; y: number }) => {
    const canvas = canvasRef.current, rect = canvas?.getBoundingClientRect()
    return engineRef.current!.resolvePoint(point, { ...pointerSnapContext,
      zoom: rect && canvas?.width ? rect.width / canvas.width : zoom })
  }, [pointerSnapContext, zoom, snapSettings])
  const shapePlacement = useShapePlacement({ template: shapePlacementLayer,
    active: placingShape && !hideEditorUI && !arrayEditing, editor, canvasRef,
    resolveSnap: resolvePointerSnap,
    onComplete: id => onShapePlacementComplete?.(id), onWarning: setTransformWarning })
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
  const gridInFront = snapSettings.grid.inFront
  const [showGuides,  setShowGuides]  = useState(true)
  const [showMeasurements, setShowMeasurements] = useState(true)
  const [showMeshTriangles, setShowMeshTriangles] = useState(false)

  // ── Right-click context menu — opens at cursor on a layer hit ────────────
  // Targets the right-clicked layer (not necessarily the selected one) so
  // users can act on any object without changing selection first. Selection
  // does, however, get updated so e.g. Animate can keyframe the right layer.
  const ctxMenu = useContextMenu()
  const [ctxTargetLayerId, setCtxTargetLayerId] = useState<string | null>(null)
  const ctxPointRef = useRef<{ x: number; y: number } | null>(null)
  const ctxSelectionAtOpenRef = useRef<string | null>(null)
  const selectionKey = useMemo(() => `${selectedLayerId ?? ''}|${Array.from(selectedLayerIds ?? []).sort().join(',')}`,
    [selectedLayerId, selectedLayerIds])
  useEffect(() => {
    if (!ctxMenu.isOpen || ctxSelectionAtOpenRef.current == null) return
    if (ctxSelectionAtOpenRef.current !== selectionKey) {
      ctxMenu.close()
      setCtxTargetLayerId(null)
      ctxSelectionAtOpenRef.current = null
    }
  }, [ctxMenu.isOpen, ctxMenu.close, selectionKey])
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
  // A newly selected creation tool owns primary-button gestures immediately,
  // even if an embedding editor previously enabled the local Pan toggle.
  // Clear that local state as well so exiting creation cannot revive old Pan.
  const panMode = !placingShape && (controlledPanMode ?? internalPanMode)
  useEffect(() => { if (placingShape) setInternalPanMode(false) }, [placingShape])
  const setPanMode = (next: boolean | ((p: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(panMode) : next
    if (onPanModeChange) onPanModeChange(resolved)
    else setInternalPanMode(resolved)
  }
  // A tool/scope handover must release the previous view owner before the next
  // source/guide gesture measures canvas coordinates. It keeps the current view.
  useEffect(() => { cancelPan() }, [cancelPan, toolMode, panMode, placingShape, hideEditorUI, motionEditing, arrayEditing])

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


  const splineSource = (!selectedLayerIds || selectedLayerIds.size <= 1) ? scene.layers.find(layer => layer.id === selectedLayerId) ?? null : null
  const fallbackSplineEdit = useSplineEditSelection(splineSource, editor.getDocumentSignal())
  const splineEditController = suppliedSplineEdit ?? fallbackSplineEdit
  const selectedSplinePointId = splineEditController.active && splineEditController.mode === 'point' && splineEditController.ids.length === 1
    ? splineEditController.ids[0] : null
  useEffect(() => { onSplinePointSelected?.(selectedSplinePointId) }, [selectedSplinePointId, onSplinePointSelected])
  useEffect(() => { if (toolMode === 'pen' && splineSource?.spline) splineEditController.enter('point') }, [toolMode, splineSource?.id])

  // ── Drag-time numeric HUD (position / rotation / size readout) ───────────
  // Mirrors AE / Figma — appears next to the cursor while transforming.
  const [dragHud, setDragHud] = useState<{ x: number; y: number; label: string } | null>(null)

  // Map of `layers.<id>.transform.x|y` → number. Merged into renderer
  // overrides so the dragged layer follows the cursor. Owned here because it's
  // shared by the move-drag path, the renderer, AND preview drag.
  const [dragOverrides, setDragOverrides] = useState<Map<string, number>>(new Map())

  // ── Core transform/drag engine (move/resize/rotate/scale/anchor/path/spline) ─
  const snapLayerIds = useMemo(() => displayScene === scene ? undefined
    : new Set(displayScene.layers.filter(layer => !layer.hidden).map(layer => layer.id)), [displayScene, scene])
  const { dragRef, startDrag, snapPoint: dragSnapPoint } = useCanvasDrag({
    snapLayerIds,
    canvasRef, compositionRef, sceneRef, editorRef, snapRef, engineRef, guidesRef,
    readScale, setGuides, setDragHud, setDragOverrides,
    onAfterLayerCommit, onAfterCloneDrag, onSelectLayer, onSelectLayers, buildLayerCommitCommands,
    timeMs, overrides, ...meshFrameQuery,
    contextKey: `${selectedTimeline?.id ?? ''}:${timeMs}:${hideEditorUI}:${pivotMode}:${transformSpace}:${motionEditing}:${arrayEditing}:${placingShape}:${panMode}:${toolMode}:${splineEditController.layerId}:${splineEditController.active}:${splineEditController.mode}:${geometryEditActive}:${geometryEditMode}`,
    onWarning: setTransformWarning,
  })

  // ── Pen tool / path editing (anchors, handles, segment insert, close) ─────
  const { tryStartPathEdit } = usePathEdit({ editorRef, sceneRef, dragRef, startDrag, toolMode,
    timeMs, overrides, zoom })


  // ── BL-73 Spline drawing tools (box-drag primitives + multi-click line) ──
  const splineDrawSnapContext = useMemo(() => toolMode === 'spline-draw' && snapEnabled
    ? prepareSceneSnapContext(geometryScene, timeMs, geometryOverrides, [], new Set(displayScene.layers.map(layer => layer.id)), snapSettings.targets.vertex)
    : { canvasWidth: width, canvasHeight: height, otherLayers: [] },
  [toolMode, snapEnabled, geometryScene, timeMs, geometryOverrides, displayScene.layers, snapSettings.targets.vertex, width, height])
  const resolveSplineDrawSnap = useCallback((point: { x: number; y: number }) => engineRef.current!.resolvePoint(point,
    { ...splineDrawSnapContext, zoom: canvasRef.current ? canvasRef.current.getBoundingClientRect().width / width : zoom }), [splineDrawSnapContext, width, zoom])
  const { splinePreview, snappedPoint: splineSnappedPoint, onSplineDrawHover, onSplineDrawPointerDown, onSplineDrawContextMenu } = useSplineDrawing({
    canvasRef, compositionRef, sceneRef, editorRef,
    toolMode, splineDrawKind, splineAppendTargetId, onSplineDrawCommit,
    onSelectLayer, setDragHud, timeMs, overrides, continuationPointId: splineContinuationPointId, autoClose: splineAutoClose, onWarning: setTransformWarning,
    resolveSnap: resolveSplineDrawSnap,
  })

  const splineViewport = useSplineViewportEditing({ controller: splineEditController, layer: splineSource, scene, editor, canvasRef,
    overrides, timeMs, zoom, panMode, toolMode, transformSpace, onSelectLayer, containment: selectionContainMode, drag: { dragRef, startDrag }, getContext: getShortcutContext,
    enabled: !hideEditorUI && !contentInspection && !motionEditing && !arrayEditing && !placingShape && toolMode !== 'spline-draw' && !pathPickMode,
    isSelecting: () => isSelectionActive(), warning: setTransformWarning })
  const preferredRegion = selectionToolMode?.replace('selection-', '') as SelectionRegionStyle | undefined
  const geometryEditing = splineViewport.active || (geometryEditActive && !hideEditorUI && !contentInspection && !motionEditing && !arrayEditing && !placingShape)
  const geometrySessionActive = geometryEditActive || splineEditController.active
  const meshEditModifierId = useMeshEditSession(geometryEditActive, splineSource, editor.getDocumentSignal())
  const meshComponents = useMeshViewportEditing({ active: geometryEditing && !splineViewport.active && !panMode && toolMode !== 'pan',
    mode: geometryEditMode, layer: splineSource, scene, editor, timeMs, overrides, zoom, transformSpace, toolMode, canvasRef,
    drag: { dragRef, startDrag }, modifierId: meshEditModifierId, warning: setTransformWarning })
  useGeometryEditKeyboard({ active: geometryEditing && !splineViewport.active && !panMode && toolMode !== 'pan',
    layer: splineSource, editor, timeMs, overrides, canvasRef, getContext: getShortcutContext,
    modifierId: meshEditModifierId, selectedVertexIds: meshComponents.active ? meshComponents.vertices : undefined, clearSelection: meshComponents.clear, exit: onExitGeometryEdit, warning: setTransformWarning })
  const regionStyle = selectionRegionForTool(toolMode, preferredRegion ?? selectionStyle) ?? (splineViewport.active && toolMode === 'pen' ? preferredRegion ?? selectionStyle ?? 'box' : null)
  const regionSelectionEnabled = !!regionStyle && !hideEditorUI && !panMode && !motionEditing && !arrayEditing && !placingShape && !pathPickMode
  const regionSelect = splineViewport.active
    ? (ids: Set<string>, mode: 'replace' | 'add' | 'subtract') => splineEditController.select(Array.from(ids), mode)
    : meshComponents.active ? meshComponents.select : onSelectByGeometry
  const { selectionOverlay, beginSelectionDrag, isSelectionActive } = useSelectionTools({ canvasRef, sceneRef: geometrySceneRef, width, height,
    frame: { timeMs, overrides: geometryOverrides, ...meshFrameQuery }, selectionContainMode, onSelectByGeometry: regionSelect,
    query: splineViewport.active ? splineViewport.query : meshComponents.active ? region => meshComponents.query(region, selectionContainMode) : undefined, enabled: regionSelectionEnabled,
    contextKey: `${toolMode}:${regionStyle}:${selectionContainMode}:${timeMs}:${editor.getRevision()}:${splineViewport.active}:${splineEditController.mode}:${geometryEditActive}:${geometryEditMode}` })

  /** Prepare independent selected roots once. Body and axis dragging share
   * the same evaluated baseline and parent-space conversion contract. */
  const beginMoveForSelection = useCallback((ids: readonly string[], activeId: string,
    event: React.PointerEvent, axisLock: 'x' | 'y' | null = null, cloneMode?: CloneMode) => {
    if (dragRef.current || editor.isTransactionActive() || motionEditing || arrayEditing) {
      interactionTrace.recordEvent('object', 'start-rejected', { reason: 'editing-scope-busy',
        dragActive: !!dragRef.current, transactionActive: editor.isTransactionActive(), motionEditing, arrayEditing })
      return
    }
    const prepared = prepareTransformTargets(scene, ids, timeMs, overrides, { activeId, pivotMode })
    if (!prepared.ok) {
      interactionTrace.recordEvent('object', 'start-rejected', { reason: 'transform-preparation', activeId })
      setTransformWarning(prepared.reason); return
    }
    const primary = prepared.activeTarget
    if (!primary) return
    event.preventDefault()
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
      axisFrame: transformAxisFrame(transformSpace, primary.worldMatrix),
      axisLock, cloneMode: cloneMode ?? resolveCloneDragMode(event),
    }
    // The body or an off-artboard proxy may be replaced during selection or
    // cross back inside. Capture the persistent native canvas, not its proxy.
    startDrag({ pointerId: event.pointerId, currentTarget: canvasRef.current ?? event.currentTarget })
  }, [scene, timeMs, overrides, editor, dragRef, startDrag, pivotMode, motionEditing, arrayEditing, transformSpace])

  /** Outside-composition wireframes use the same root selection and native
   * transform owner as painted bodies. Pan bubbles to the viewport; ordinary
   * edits preserve multi-selection, parent-local animation and clone policies. */
  const handleOffArtboardPointerDown = useCallback((id: string, event: React.PointerEvent<SVGRectElement>) => {
    if (event.button === 1 || (panMode && event.button === 0)) return
    if (event.button !== 0 || dragRef.current || editor.isTransactionActive() || hideEditorUI || motionEditing || arrayEditing) return
    const target = geometryScene.layers.find(layer => layer.id === id)
    if (!target || !new CanvasSelectionEligibility(geometryScene.layers, timeMs, geometryOverrides).accepts(target)) return
    cancelPan()
    event.preventDefault(); event.stopPropagation()
    const cloneMode = resolveCloneDragMode(event)
    if (event.shiftKey && !cloneMode) { onSelectLayer(id, true); return }
    const selected = selectedLayerIds?.has(id) ?? selectedLayerId === id
    if (!selected) onSelectLayer(id)
    const ids = selected && selectedLayerIds?.size ? Array.from(selectedLayerIds) : [id]
    beginMoveForSelection(ids, id, event, null, cloneMode)
  }, [panMode, editor, hideEditorUI, motionEditing, arrayEditing, selectedLayerIds, selectedLayerId, onSelectLayer, beginMoveForSelection, cancelPan,
    geometryScene, timeMs, geometryOverrides])

  const modelCamera = useModelCamera(scene, selectedLayerId, editor,
    !hideEditorUI && (!selectedLayerIds || selectedLayerIds.size === 1) && !motionEditing && !arrayEditing && !placingShape && !panMode && (toolMode === 'select' || toolMode === 'move'), setTransformWarning)

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (modelCamera.begin(e)) return
    // One bounded routing record per down distinguishes an ignored start from
    // a session that actually began and was later cancelled. No scene is copied.
    interactionTrace.recordEvent('viewport', 'pointer-down', { pointerId: e.pointerId, button: e.button,
      buttons: e.buttons, clientX: e.clientX, clientY: e.clientY, toolMode: toolMode ?? 'select', panMode, placingShape,
      motionEditing, arrayEditing, previewMode: !!previewMode, timeMs, selectedLayerId,
      dragActive: !!dragRef.current, transactionActive: editor.isTransactionActive(), isTrusted: e.isTrusted })
    if (dragRef.current || editor.isTransactionActive()) return
    // Middle-mouse OR pan-mode + left button → pan the view, not the layer
    if (e.button === 1 || (panMode && e.button === 0)) {
      e.preventDefault()
      beginPan(e)
      return
    }
    cancelPan()
    if (hideEditorUI && !previewMode) return
    if (arrayEditing) { if (e.button === 0) arrayAuthoring?.close(); return }
    if (e.button !== 0) return
    if (placingShape) { shapePlacement.begin(e); return }
    if (motionEditing) return

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


    // ── Runtime preview mode: clicks on tappable layers fire trigger events
    //    instead of changing selection. Lets the author exercise layer-click
    //    rules without leaving the builder.
    if (previewMode) {
      const stack = hitTestLayersAt(geometryScene, timeMs, cx, cy, geometryOverrides, meshFrameQuery)
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

    if (splineViewport.active) {
      if (splineViewport.pointerDown(cx, cy, e)) return
      if (regionSelectionEnabled && regionStyle) {
        e.preventDefault(); e.stopPropagation()
        beginSelectionDrag(regionStyle, selectionModeForModifiers(e), cx, cy, e.pointerId, e)
      }
      return
    }

    // Geometry Edit never falls through to layer movement. Mesh drags append
    // a local affine stage, preserving the original object TRS and anchor.
    if (geometryEditing) {
      if (meshComponents.active) {
        if (meshComponents.pointerDown(cx, cy, e)) return
        if (regionSelectionEnabled && regionStyle) {
          e.preventDefault(); e.stopPropagation()
          beginSelectionDrag(regionStyle, selectionModeForModifiers(e), cx, cy, e.pointerId, e)
        } else meshComponents.clear()
        return
      }
      const hit = hitTestLayer(geometryScene, timeMs, cx, cy, geometryOverrides, meshFrameQuery)
      if (hit !== selectedLayerId) { if (hit) onSelectLayer(hit); return }
      if (selectedLayer?.type !== 'mesh2d' || !['select', 'move', 'rotate', 'scale'].includes(toolMode ?? 'select')) return
      try {
        const matrix = resolveLayerWorldMatrix(selectedLayer, scene, timeMs, overrides)
        if (Math.abs(matrix.determinant()) < 1e-9) throw new Error('The mesh transform is singular.')
        const inverse = matrix.invert(), startLocal = inverse.applyToPoint({ x: cx, y: cy })
        const pivot = { x: selectedLayer.transform.anchorX, y: selectedLayer.transform.anchorY }
        const operation = toolMode === 'rotate' ? 'rotate' : toolMode === 'scale' ? 'scale' : 'move'
        if (operation !== 'move' && Math.hypot(startLocal.x - pivot.x, startLocal.y - pivot.y) < 1e-6) return
        const modifierId = meshEditModifierId
        if (!modifierId) return
        makeTransformMeshGeometryCmd(scene, selectedLayer.id, modifierId,
          { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: pivot.x, pivotY: pivot.y })
        e.preventDefault(); e.stopPropagation(); editor.beginTransaction()
        dragRef.current = { kind: 'meshGeometry', layerId: selectedLayer.id, originalLayer: selectedLayer,
          modifierId, operation, startClientX: e.clientX, startClientY: e.clientY,
          startLocal, pivot, worldToLocal: inverse, axisFrame: transformAxisFrame(transformSpace, matrix) }
        startDrag(e)
      } catch (error) { setTransformWarning(error instanceof Error ? error.message : String(error)) }
      return
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
      const stack = hitTestLayersAt(geometryScene, timeMs, cx, cy, geometryOverrides, meshFrameQuery)
      if (stack.length === 0) hit = null
      else {
        const cur = selectedLayerId ?? ''
        const idx = stack.indexOf(cur)
        hit = idx === -1 ? stack[0] : stack[(idx + 1) % stack.length]
      }
    } else {
      hit = hitTestLayer(geometryScene, timeMs, cx, cy, geometryOverrides, meshFrameQuery)
      hit = canvasSelectionPickTarget(hit, layerIndex,
        selectedLayerIds ?? new Set(selectedLayerId ? [selectedLayerId] : []), !!requestedCloneMode && e.altKey)
    }
    // A down over geometry always selects/moves that object. Only an empty
    // start may own a region; moving over objects later never changes owner.
    if (!hit) {
      if (regionSelectionEnabled && regionStyle && onSelectByGeometry) {
        e.preventDefault()
        beginSelectionDrag(regionStyle, selectionModeForModifiers(e), cx, cy, e.pointerId, e)
      } else onSelectLayer(null)
      return
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
    const layer = scene.layers.find((l) => l.id === hit)
    if (!layer || layer.locked) return

    const ids = inMultiSet && selectedLayerIds?.size
      ? Array.from(selectedLayerIds) : [layer.id]
    beginMoveForSelection(ids, layer.id, e, null, requestedCloneMode)
  }, [scene, geometryScene, geometryOverrides, timeMs, width, height, overrides, onSelectLayer,
    editor, startDrag, panMode, beginPan, selectedLayerId, selectedLayerIds, previewMode, meshFrameQuery,
    onLayerClickInPreview, toolMode, onSelectByGeometry, beginSelectionDrag, tryStartPathEdit,
    pathPickMode, onExitPathPickMode, splineDrawKind, onSplineDrawPointerDown, zoom,
    beginMoveForSelection, layerIndex, splineViewport, motionEditing, arrayEditing, arrayAuthoring?.close, placingShape, shapePlacement.begin, cancelPan, modelCamera,
    regionSelectionEnabled, regionStyle, hideEditorUI, geometryEditing, meshEditModifierId, transformSpace, meshComponents])

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
    const sizeDriver = ['size.width', 'size.height'].map(path => drivenChannelReason(scene, layer, path)).find(Boolean)
    if (sizeDriver) { setTransformWarning(sizeDriver); return }
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
    const frame = overrides ?? evaluateSceneFrame(scene, timeMs).overrides
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
    const primary = prepared.activeTarget
    if (!primary) return
    setTransformWarning(null)
    editor.beginTransaction()
    dragRef.current = {
      kind: 'scaleAxis', layerId: primary.id, originalLayer: primary.originalLayer,
      axis, axisFrame: transformAxisFrame(transformSpace, primary.worldMatrix), startClientX: e.clientX, startClientY: e.clientY,
      targets: prepared.targets, pivotX: prepared.pivot.x, pivotY: prepared.pivot.y,
    }
    startDrag(e)
  }, [scene, timeMs, overrides, selectedLayerId, selectedLayerIds, editor, dragRef, startDrag, pivotMode, transformSpace])

  /** Common bounding handles scale the whole selection about the opposite
   * handle, while retaining each root's source geometry and custom anchor. */
  const beginSelectionResize = useCallback((handle: Handle) => (event: React.PointerEvent) => {
    if (event.button !== 0 || dragRef.current || editor.isTransactionActive() || !selectedLayerId) return
    event.stopPropagation()
    event.preventDefault()
    const ids = selectedLayerIds?.size ? Array.from(selectedLayerIds) : [selectedLayerId]
    const prepared = prepareTransformTargets(scene, ids, timeMs, overrides, { activeId: selectedLayerId, pivotMode })
    if (!prepared.ok) { setTransformWarning(prepared.reason); return }
    const resolveBounds = createLayerWorldBoundsResolver(geometryScene, timeMs, geometryOverrides, meshFrameQuery)
    const bounds = prepared.targets.reduce<PathBounds | null>((value, target) => {
      const layer = geometryScene.layers.find(item => item.id === target.id)
      const item = layer && resolveBounds(layer)
      return item ? unionBounds(value, item) : value
    }, null)
    const resize = bounds && selectionResize(bounds, handle, { x: 0, y: 0 }, false)
    if (!bounds || !resize) { setTransformWarning('This selection has no resizable bounds.'); return }
    const primary = prepared.activeTarget
    if (!primary) return
    setTransformWarning(null)
    editor.beginTransaction()
    dragRef.current = { kind: 'scaleAxis', layerId: primary.id, originalLayer: primary.originalLayer,
      axis: 'both', startClientX: event.clientX, startClientY: event.clientY,
      targets: prepared.targets, pivotX: resize.pivot.x, pivotY: resize.pivot.y,
      selectionResize: { bounds, handle } }
    startDrag(event)
  }, [scene, geometryScene, geometryOverrides, timeMs, overrides, selectedLayerId, selectedLayerIds,
    pivotMode, editor, dragRef, startDrag, meshFrameQuery])

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
    const primary = prepared.activeTarget
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
    scene: displayScene, timeMs, selectedLayerId, selectedLayerIds, assets,
    snapEnabled, snapToGridOn, gridSize, gridVisible: snapSettings.grid.visible, gridInFront,
    meshTrianglesVisible: showMeshTriangles,
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
    const frame = overrides ?? evaluateSceneFrame(scene, timeMs).overrides
    if (dragOverrides.size === 0) return frame
    const merged: OverrideMap = new Map()
    frame.forEach((v, k) => merged.set(k, v))
    dragOverrides.forEach((v, k) => merged.set(k, v))
    return merged
  }, [overrides, scene, timeMs, dragOverrides])
  // Only visual geometry is projected. Gesture commands continue to borrow the
  // authored layer, so drawing a live size never stamps that size into source.
  const frameGeometryOverrides = useMemo(() => projectFrameFontOverrides(scene, displayOverrides, assets.fonts), [scene, displayOverrides, assets])
  const selectedFrameLayer = useMemo(() => {
    const source = geometryScene.layers.find(layer => layer.id === selectedLayerId)
    const visual = source?.instanceOf ? resolveInstanceLayer(source, geometryScene.layers) : source
    return visual ? selectionGeometry(visual, frameGeometryOverrides, scene.assets) : null
  }, [geometryScene, selectedLayerId, frameGeometryOverrides, scene.assets])
  // Selection frame anchor: prefer live display transform but keep the
  // static fallback so empty paths / unconfigured followPath layers still
  // get a sensible gizmo origin.
  const selectedWorldMatrix = useMemo(() => {
    if (!selectedLayer || (hideEditorUI && !geometrySessionActive)) return null
    return resolveLayerWorldMatrix(selectedLayer, scene, timeMs, displayOverrides)
  }, [selectedLayer, scene, timeMs, displayOverrides, hideEditorUI, geometrySessionActive])
  const selectedBooleanOwner = booleanOwner(scene, selectedLayerId)
  const booleanEditResult = selectedBooleanOwner && geometryScene.layers.find(layer => layer.id === selectedBooleanOwner.booleanOperation?.resultLayerId)
  const booleanSourceEditing = splineViewport.active && !!selectedBooleanOwner && !!booleanEditResult?.spline && !booleanEditResult.hidden
  const selectedMeshTexture = useMemo(() => {
    if (rawSelectedLayer?.type !== 'mesh2d' || rawSelectedLayer.mesh2d?.appearance?.kind !== 'texture') return null
    const assetId = rawSelectedLayer.mesh2d.appearance.textureAssetId
    return assetId ? assets.get(assetId) ?? null : null
  }, [rawSelectedLayer, assets])
  // Most playback frames have no selection/hover bounds consumer. Keep this
  // scope lazy instead of materializing/indexing every layer just to discard
  // the resolver. Visible rulers still need their selected extents in playback.
  const boundsForFrame = useMemo(() => createLayerWorldBoundsResolver(geometryScene, timeMs,
    frameGeometryOverrides, { deferPreparation: true, ...meshFrameQuery }),
  [geometryScene, timeMs, frameGeometryOverrides, meshFrameQuery])
  const selectedWorldBounds = useMemo(() => rawSelectedLayer && (!hideEditorUI || showRulers)
    ? boundsForFrame(rawSelectedLayer)
    : null, [rawSelectedLayer, boundsForFrame, hideEditorUI, showRulers])

  const measurementSelection = useMemo(() => selectedLayerIds ?? new Set(selectedLayerId ? [selectedLayerId] : []),
    [selectedLayerIds, selectedLayerId])
  const measurementNames = useMemo(() => new Map(scene.layers.map(layer => [layer.id, layer.name])), [scene.layers])
  const measurements = useSelectionMeasurements({ scene, editor, timeMs, selectedIds: measurementSelection,
    primaryId: selectedLayerId, overrides: displayOverrides, boundsFor: boundsForFrame,
    enabled: showMeasurements && !hideEditorUI && !motionEditing && !arrayEditing && !placingShape && !dragRef.current
      && toolMode !== 'pen' && toolMode !== 'spline-draw',
    buildLayerCommitCommands, onAfterLayerCommit })

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
  const gizmo = hideEditorUI || !!editingTextId || motionEditing || arrayEditing || placingShape || modelCamera.active || geometryEditing ? {
    frame: false, resize: false, cornerRot: false, ring: false,
    axisMove: false, axisScale: false, anchor: false,
  } : {
    frame:     toolMode !== 'anchor' && toolMode !== 'pan' && toolMode !== 'pen' && toolMode !== 'texture',
    resize:    toolMode === 'select' || toolMode === 'scale',
    cornerRot: toolMode === 'select',
    ring:      toolMode === 'rotate',
    axisMove:  toolMode === 'move',
    axisScale: toolMode === 'scale',
    anchor:    toolMode === 'anchor',
  }
  const actualWorldPivot = selectedWorldMatrix && selectedFrameLayer
    ? selectedWorldMatrix.applyToPoint({ x: selectedFrameLayer.transform.anchorX, y: selectedFrameLayer.transform.anchorY })
    : { x: 0, y: 0 }
  const multiPreparation = useMemo(() => !hideEditorUI && selectedLayerIds && selectedLayerIds.size > 1
    ? prepareTransformTargets(scene, selectedLayerIds, timeMs, displayOverrides,
      { activeId: selectedLayerId ?? undefined, pivotMode }) : null,
  [scene, selectedLayerIds, selectedLayerId, timeMs, displayOverrides, hideEditorUI, pivotMode])
  const selectedAxisFrame = transformAxisFrame(transformSpace, multiPreparation?.ok ? multiPreparation.activeTarget.worldMatrix : selectedWorldMatrix)
  // Rotation/axis-scale tools display their fixed operation pivot. A frame
  // resize instead pins an opposite handle for its calculation; that corner is
  // not the object's origin or the selection's live rotation center.
  const activeDrag = dragRef.current
  const gesturePivot = activeDrag?.kind === 'rotate'
    ? { x: activeDrag.anchorWorldX, y: activeDrag.anchorWorldY }
    : activeDrag?.kind === 'scaleAxis' && !activeDrag.selectionResize && activeDrag.pivotX !== undefined && activeDrag.pivotY !== undefined
      ? { x: activeDrag.pivotX, y: activeDrag.pivotY } : null
  const selectedWorldPivot = toolMode === 'anchor' ? actualWorldPivot
    : gesturePivot ?? (multiPreparation?.ok ? multiPreparation.pivot : actualWorldPivot)
  const transformWorldBounds = multiSelectionBounds ?? selectedWorldBounds
  const rotationRingRadius = transformWorldBounds ? Math.max(60,
    Math.abs(transformWorldBounds.x - selectedWorldPivot.x) * zoom + 16,
    Math.abs(transformWorldBounds.x + transformWorldBounds.width - selectedWorldPivot.x) * zoom + 16,
    Math.abs(transformWorldBounds.y - selectedWorldPivot.y) * zoom + 16,
    Math.abs(transformWorldBounds.y + transformWorldBounds.height - selectedWorldPivot.y) * zoom + 16) : 60
  let hudPoint = dragHud
  if (dragHud && activeDrag?.kind === 'rotate' && canvasRef.current) {
    const rect = canvasRef.current.getBoundingClientRect()
    const center = { x: rect.left + selectedWorldPivot.x * zoom, y: rect.top + selectedWorldPivot.y * zoom }
    const dx = dragHud.x - center.x, dy = dragHud.y - center.y, distance = Math.hypot(dx, dy) || 1
    hudPoint = { ...dragHud, x: center.x + dx / distance * rotationRingRadius, y: center.y + dy / distance * rotationRingRadius }
  }
  // Vector and mesh geometry wins over retained size metadata; groups use the
  // union of visible children. Their frame scales the layer transform through
  // beginSelectionResize, preserving spline/mesh source data and modifier recipes.
  // Regular raster/parametric sized objects keep their size-resize frame.
  const usesWorldFrame = usesGeometryDrivenSelectionFrame(selectedLayer)
  const hasFrameGeometry = !!selectedLayer && (usesWorldFrame ? !!selectedWorldBounds : !!selectedLayer.size)
  const showFrame =
    !!selectedLayer && hasFrameGeometry && !selectedLayer.locked && !selectedLayer.frozen && !selectedLayer.hidden
    && gizmo.frame

  /** Drawing actions follow the current spline selection; no permanent toolbar mode switch. */
  const splineDrawItems = (layer?: Layer | null): import('./ui/ContextMenu').MenuItem[] => !onDrawSplineLine ? [] : [
    ...(layer?.spline && !layer.booleanResultFor && !layer.locked && !layer.frozen && !layer.hidden ? [{ kind: 'action' as const,
      label: 'Add line object to spline', onSelect: () => onDrawSplineLine(layer.id) },
      ...(selectedSplinePointId && splineContinuation(layer.spline, selectedSplinePointId) ? [{ kind: 'action' as const, label: 'Continue selected endpoint',
        onSelect: () => onDrawSplineLine(layer.id, selectedSplinePointId) }] : [])] : []),
  ]

  return (
    <div data-testid="canvas-workspace" className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <div
      ref={containerRef}
      data-testid="canvas-viewport"
      className={`min-h-0 flex-1 flex items-center justify-center bg-neutral-800 overflow-hidden relative ${
        isPanning ? 'cursor-grabbing' : panMode ? 'cursor-grab' : placingShape ? 'cursor-crosshair' : ''
      }`}
      onWheel={handleWheel}
      onContextMenu={event => {
        if (placingShape) { event.preventDefault(); event.stopPropagation(); shapePlacement.cancel() }
        else if (onSplineDrawContextMenu()) { event.preventDefault(); event.stopPropagation() }
      }}
      onPointerDown={(e) => {
        // If the click was on the <canvas>, its own handler manages pan +
        // selection. We only fire here when the user clicks the EMPTY leaf
        // area around the artboard — so pan still works outside the canvas
        // (matches Figma / SVGator behaviour).
        if (e.target === canvasRef.current) return
        // Viewport controls own primary/middle clicks even with Pan active.
        // Starting pointer capture here used to swallow zoom and toggle clicks.
        if ((e.target as Element).closest('button,input,select,textarea,a,[role="toolbar"],[role="menu"],[data-viewport-cursor-block]')) return
        if (e.button === 1 || (panMode && e.button === 0)) {
          e.preventDefault()
          beginPan(e)
          return
        }
        // Native buttons/rulers own their gestures; empty work area may start
        // a shape beyond the composition without changing export clipping.
        if (placingShape) { shapePlacement.begin(e); return }
        // The empty pasteboard is also a selection surface. Painted/off-board
        // objects and controls stop propagation in their own gesture owners.
        if (e.button === 0 && !hideEditorUI && !motionEditing && !arrayEditing && !pathPickMode
            && !dragRef.current && !editor.isTransactionActive()) {
          const canvas = canvasRef.current
          if (canvas && splineViewport.active) {
            const rect = canvas.getBoundingClientRect()
            if (splineViewport.pointerDown((e.clientX - rect.left) * width / rect.width, (e.clientY - rect.top) * height / rect.height, e)) return
          }
          if (regionSelectionEnabled && regionStyle && regionSelect && canvas) {
            const rect = canvas.getBoundingClientRect()
            e.preventDefault()
            beginSelectionDrag(regionStyle, selectionModeForModifiers(e), (e.clientX - rect.left) * width / rect.width,
              (e.clientY - rect.top) * height / rect.height, e.pointerId, { pointerId: e.pointerId, currentTarget: canvas })
          } else onSelectLayer(null)
        }
      }}
    >
      <SoloModeOverlay active={displayScene.layers.some(layer => layer.type !== 'audio' && !!layer.solo)} />
      {splineViewport.active && <div role="status" aria-label="Viewport spline edit mode"
        className="pointer-events-none absolute top-3 left-1/2 z-40 -translate-x-1/2 rounded border border-orange-400/70 bg-orange-950/95 px-3 py-1.5 text-xs font-semibold text-orange-100">
        SPLINE EDIT · {splineEditController.edgeTool ? `${splineEditController.edgeTool === 'addVertex' ? 'Add Vertex · Keep clicking edges' : splineEditController.edgeTool === 'trim' ? 'Trim · Pick interval' : 'Extend · Pick open end'} · Esc to cancel` : splineEditController.attaching ? 'Add Spline · Pick objects · Esc to finish' : splineEditController.mode === 'point' ? 'Point' : splineEditController.mode === 'edge' ? 'Edge' : 'Object'}
      </div>}
      {geometryEditing && !splineViewport.active && <div role="status" aria-label="Viewport geometry edit mode"
        className="pointer-events-none absolute top-3 left-1/2 z-40 -translate-x-1/2 rounded border border-orange-400/70 bg-orange-950/95 px-3 py-1.5 text-xs font-semibold text-orange-100">
        {splineSource?.type === 'mesh2d' ? `MESH EDIT · ${geometryEditMode[0].toUpperCase() + geometryEditMode.slice(1)}` : 'SPLINE EDIT · Modifiers'}
      </div>}
      <div
        className="relative"
        style={{
          padding: PADDING,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          // Rulers, guides and handles share the exact current canvas rect;
          // interpolating the view after a fit/pan would desynchronize chrome.
          transition: 'none',
        }}
      >
        <div
          className="absolute inset-6 ring-1 ring-gray-600 rounded pointer-events-none"
          style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.28), 0 1px 4px rgba(0,0,0,0.18)' }}
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
              if (motionEditing || arrayEditing || placingShape || previewMode || editor.isTransactionActive() || isPlaying) return
              const cv = canvasRef.current
              if (!cv) return
              const rect = cv.getBoundingClientRect()
              const sx = width  / rect.width
              const sy = height / rect.height
              const cx = (e.clientX - rect.left) * sx
              const cy = (e.clientY - rect.top)  * sy
              const hitId = hitTestLayer(geometryScene, timeMs, cx, cy, geometryOverrides, meshFrameQuery)
              const hitLayer = hitId ? scene.layers.find((l) => l.id === hitId) : null
              if (hitLayer?.type === 'text' && !hitLayer.locked && !hitLayer.frozen) {
                onSelectLayer(hitId!)
                setEditingTextId(hitId!)
              } else if (hitLayer?.type === 'path' && !hitLayer.locked) {
                onSelectLayer(hitId!)
                onToolModeChange?.('pen')
              } else if (hitLayer && onEditContent && hasItemDetailEntry(hitLayer) && !detailUnavailableReason(hitLayer)) {
                onEditContent(hitLayer.id)
              }
            }}
            onContextMenu={(e) => {
              if (contentInspection) { e.preventDefault(); return }
              if (placingShape) { e.preventDefault(); e.stopPropagation(); shapePlacement.cancel(); return }
              if (onSplineDrawContextMenu()) { e.preventDefault(); e.stopPropagation(); return }
              if (motionEditing || arrayEditing || previewMode) return // Motion keys own canvas editing while active.
              const cv = canvasRef.current
              if (!cv) return
              const rect = cv.getBoundingClientRect()
              const sx = width  / rect.width
              const sy = height / rect.height
              const cx = (e.clientX - rect.left) * sx
              const cy = (e.clientY - rect.top)  * sy

              if (splineViewport.contextMenu(cx, cy, e)) return

              // Context menus must remain reachable for selected locked layers
              // so Lock selection can be reversed without changing selection.
              // This projection is hit-test-only; source lock flags stay intact.
              const contextScene = { ...geometryScene, layers: geometryScene.layers.map(layer =>
                layer.locked && selectedLayerIds?.has(layer.id) ? { ...layer, locked: false } : layer) }
              const hit = canvasSelectionPickTarget(hitTestLayer(contextScene, timeMs, cx, cy, geometryOverrides, meshFrameQuery),
                layerIndex, selectedLayerIds ?? new Set(selectedLayerId ? [selectedLayerId] : []), false)
              if (!hit) {
                e.preventDefault()
                emptyCanvasCtx.open(e)
                return
              }
              e.preventDefault()
              // Bring the right-clicked layer into selection so menu actions
              // operate on what the user pointed at — matches every other editor.
              // Preserve a multi-selection when the context click lands on
              // one of its members; otherwise establish a new single-layer
              // scope for the context menu.
              const keepsSelection = !!(selectedLayerIds?.size && selectedLayerIds.has(hit))
              if (!keepsSelection) onSelectLayer(hit)
              ctxSelectionAtOpenRef.current = keepsSelection ? selectionKey : `${hit}|${hit}`
              setCtxTargetLayerId(hit)
              ctxPointRef.current = { x: Math.round(cx), y: Math.round(cy) }
              ctxMenu.open(e)
            }}
            onPointerMove={(e) => {
              if (toolMode === 'spline-draw') { onSplineDrawHover(e); return }
              // Hover preview — rAF-throttled hit test. Skip while any drag
              // is active (avoids competing for state with move/resize/rotate
              // handlers).
              if (motionEditing || arrayEditing || panMode || previewMode || dragRef.current || panDragRef.current) return
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
                const hit = hitTestLayer(geometryScene, timeMs, cx, cy, geometryOverrides, meshFrameQuery)
                const target = canvasSelectionPickTarget(hit, layerIndex,
                  selectedLayerIds ?? new Set(selectedLayerId ? [selectedLayerId] : []), deepPick)
                setHoveredLayerId((cur) => (cur === target ? cur : target))

                splineViewport.hoverAt(cx, cy)
              })
            }}
            onPointerLeave={() => {
              onSplineDrawHover(null)
              if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current)
              setHoveredLayerId(null)
              splineViewport.clearHover()
            }}
            className={`absolute inset-0 block ${
              previewMode ? 'cursor-pointer'
              : pathPickMode ? 'cursor-crosshair'
              : splineViewport.active && splineEditController.edgeTool ? 'cursor-crosshair'
              : splineViewport.active && splineEditController.attaching ? 'cursor-copy'
              : toolMode === 'spline-draw' ? 'cursor-crosshair'
              : placingShape ? 'cursor-crosshair'
              : splineViewport.hover ? 'cursor-crosshair'
              : toolMode === 'pen' ? 'cursor-crosshair'
              : panMode ? 'cursor-grab'
              : dragRef.current?.kind === 'move' ? 'cursor-crosshair'
              : hoveredLayerId ? 'cursor-crosshair'
              : 'cursor-default'
            } ${isPanning ? '!cursor-grabbing' : ''}`}
            style={{
              width:  `${width  * zoom}px`,
              height: `${height * zoom}px`,
              imageRendering: 'pixelated',
              touchAction: 'none',
            }}
          />

          {!hideEditorUI && physicsOverlay?.enabled && <PhysicsViewportOverlay
            scene={scene}
            timeMs={timeMs}
            overrides={overrides}
            settings={physicsOverlay}
            onBondSelect={onPhysicsBondSelect}
          />}

          {shapePlacement.draft && <ShapePlacementOutline bounds={boundsForFrame(shapePlacement.draft)}
            width={width} height={height} zoom={zoom} />}
          {!hideEditorUI && dragSnapPoint && <SnapPointOverlay point={dragSnapPoint} zoom={zoom} />}
          {!hideEditorUI && shapePlacement.snappedPoint && <SnapPointOverlay point={shapePlacement.snappedPoint} zoom={zoom} />}
          {!hideEditorUI && toolMode === 'spline-draw' && splineSnappedPoint && <SnapPointOverlay point={splineSnappedPoint} zoom={zoom} />}
          {!hideEditorUI && placingShape && !shapePlacement.draft && shapePlacementHint && <SnapPointOverlay point={shapePlacementHint} zoom={zoom} reference />}

          {editingTextId && !hideEditorUI && (() => {
            const textLayer = scene.layers.find(layer => layer.id === editingTextId)
            if (!textLayer?.text || textLayer.locked || textLayer.frozen) return null
            const worldMatrix = resolveLayerWorldMatrix(textLayer, scene, timeMs, displayOverrides)
            return <TextEditOverlay key={editingTextId} layer={textLayer} assets={scene.assets} zoom={zoom} worldMatrix={worldMatrix}
              onCommit={value => {
                setEditingTextId(null)
                onTextEditRequestDone?.()
                if (value !== textLayer.text!.value) {
                  const next = syncTextLayerSize({ ...textLayer, text: { ...textLayer.text!, value } }, scene.assets)
                  editor.dispatchCommand(makeUpdateLayerCmd(textLayer.id, next, textLayer))
                  onAfterLayerCommit?.(textLayer, next)
                }
              }}
              onCancel={() => { setEditingTextId(null); onTextEditRequestDone?.() }} />
          })()}

          {!hideEditorUI && !geometryEditing && !editingTextId && !arrayEditing && !motionEditing && !placingShape && toolMode !== 'pen' && toolMode !== 'spline-draw' && toolMode !== 'texture' && containerRef.current && <OffArtboardOverlay
            scene={displayScene} selectedIds={measurementSelection} boundsFor={boundsForFrame} composition={{ width, height }}
            zoom={zoom} pan={pan} containerEl={containerRef.current} canvasRef={canvasRef}
            cursor={isPanning ? 'grabbing' : panMode ? 'grab' : 'crosshair'}
            onLayerPointerDown={handleOffArtboardPointerDown} onDiagnostics={setOffArtboardDiagnostic} />}

          {/* Hover preview — red outline showing which layer a click would select.
              Only rendered when a non-selected layer is under the cursor and no
              drag is in flight. Matches the layer's rotation so the rect lines
              up with the actual rendered geometry. */}
          {(() => {
            if (splineViewport.active || placingShape || !hoveredLayerId || hoveredLayerId === selectedLayerId) return null
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

          {!hideEditorUI && dragSnapPoint && <SnapPointOverlay point={dragSnapPoint} zoom={zoom} />}

          {/* Motion path — trajectory the selected layer follows over time,
              sampled from the position-keyframe interpolation. Drawn UNDER
              the selection frame so handles stay clickable. */}
          {selectedLayer && !selectedLayer.hidden && (!selectedLayerIds || selectedLayerIds.has(selectedLayer.id))
            && !contentInspection && !hideEditorUI && !arrayEditing && !placingShape && toolMode !== 'spline-draw' && toolMode !== 'pen' && toolMode !== 'texture' && (
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
              controlsHost={motionControlsHost}
              interactionDisabled={panMode}
              mode={motionMode}
              onModeChange={mode => { if (mode !== 'off') setPanMode(false); setMotionMode(mode) }}
              snapWorldPoint={point => resolvePointerSnap(point).point}
              onEditPathSource={sourceId => {
                setMotionMode('off'); onSelectLayer(sourceId); onToolModeChange?.('pen')
              }}
              onEditProgressTiming={layerId => { setMotionMode('off'); onEditMotionTiming?.(layerId) }}
            />
          )}

          {arrayAuthoring?.active && !hideEditorUI && <ArrayViewportOverlay authoring={arrayAuthoring} canvasRef={canvasRef} zoom={zoom} />}

          {toolMode === 'texture' && rawSelectedLayer?.type === 'mesh2d' && selectedMeshTexture && selectedWorldMatrix
            && !hideEditorUI && !arrayEditing && !motionEditing && !placingShape && (
            <Mesh2DTextureOverlay layer={rawSelectedLayer} texture={selectedMeshTexture}
              worldMatrix={selectedWorldMatrix} zoom={zoom} canvasRef={canvasRef} editor={editor} />
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
            showMotionGuides={!hideEditorUI && !placingShape}
          />

          {/* BL-66 — Anchor + bezier handle visualization for the selected
              path layer. Shown whenever a path layer is selected (not just
              in pen mode) so users can see the structure they're editing. */}
          {selectedLayer && selectedWorldMatrix && selectedLayer.type === 'path' && selectedLayer.path && !hideEditorUI && !motionEditing && !arrayEditing && !placingShape && (
            <PathEditOverlay layer={selectedLayer} zoom={zoom} worldMatrix={selectedWorldMatrix} />
          )}

          {geometrySessionActive && selectedFrameLayer && selectedWorldMatrix && <GeometryEditGhost
            key={selectedFrameLayer.id} layer={selectedFrameLayer} worldMatrix={selectedWorldMatrix}
            zoom={zoom} document={editor.getDocumentSignal()} visible={geometryEditing} outlineVisible={!booleanSourceEditing} sourceGhosts={splineEditController.sourceGhosts} />}

          {/* BL-73 — Control points + bezier handles for the selected spline. */}
          {splineViewport.active && selectedLayer && selectedWorldMatrix && selectedLayer.spline && !hideEditorUI && !motionEditing && !arrayEditing && !placingShape
            && !selectedLayer.hidden && !selectedLayer.locked && !selectedLayer.frozen && (
            <SplineEditOverlay layer={booleanSourceEditing ? selectedLayer : selectedFrameLayer ?? selectedLayer} zoom={zoom} worldMatrix={selectedWorldMatrix}
              hover={splineViewport.hover} selection={splineEditController} sourceGhost={booleanSourceEditing} />
          )}

          {booleanSourceEditing && selectedBooleanOwner && !hideEditorUI && !motionEditing && !arrayEditing && !placingShape && <BooleanEditOverlay
            scene={scene} owner={selectedBooleanOwner} result={booleanEditResult} timeMs={timeMs} overrides={displayOverrides} zoom={zoom} />}

          {meshComponents.active && meshComponents.model && <MeshComponentOverlay model={meshComponents.model}
            mode={meshComponents.mode} ids={meshComponents.ids} zoom={zoom} />}

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
          {!hideEditorUI && !placingShape && selectedLayerIds && Array.from(selectedLayerIds).map(id => {
            if (id === selectedLayerId) return null
            const layer = scene.layers.find(l => l.id === id)
            if (!layer || layer.hidden) return null
            const bounds = boundsForFrame(layer)
            if (!bounds) return null
            return <div key={id} className={`absolute pointer-events-none border-2 border-cyan-300/95 bg-blue-500/[0.06] box-border shadow-[0_0_0_1px_rgba(15,23,42,0.75),0_0_8px_rgba(96,165,250,0.3)] ${isOffArtboardBounds(bounds, { width, height }) ? 'border-dashed' : ''}`}
              style={{ left: bounds.x * zoom, top: bounds.y * zoom, width: bounds.width * zoom, height: bounds.height * zoom }} />
          })}

          {!geometryEditing && <SelectionMeasurementsOverlay measurements={measurements} zoom={zoom} names={measurementNames} />}

          {showFrame && !usesWorldFrame && selectedFrameLayer?.size && selectedWorldMatrix && (
            <AffineSelectionFrame
              width={selectedFrameLayer.size.width}
              height={selectedFrameLayer.size.height}
              zoom={zoom}
              worldMatrix={selectedWorldMatrix}
              dashed={!!selectedWorldBounds && isOffArtboardBounds(selectedWorldBounds, { width, height })}
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
              dashed={isOffArtboardBounds(selectedWorldBounds, { width, height })}
              onHandlePointerDown={gizmo.resize ? beginSelectionResize : undefined}
              onRotatePointerDown={gizmo.cornerRot ? beginRotate : undefined}
            />
          )}

          {showFrame && multiSelectionBounds && <SelectionFrame selectionKind="multiple"
            x={multiSelectionBounds.x * zoom} y={multiSelectionBounds.y * zoom}
            w={multiSelectionBounds.width * zoom} h={multiSelectionBounds.height * zoom}
            anchorOffsetX={(selectedWorldPivot.x - multiSelectionBounds.x) * zoom}
            anchorOffsetY={(selectedWorldPivot.y - multiSelectionBounds.y) * zoom}
            rotationDeg={0} dashed={isOffArtboardBounds(multiSelectionBounds, { width, height })} onHandlePointerDown={gizmo.resize ? beginSelectionResize : undefined}
            onRotatePointerDown={gizmo.cornerRot ? beginRotate : undefined} />}

          {/* Move-mode axis arrows — X (red) / Y (blue) / center square.
              Anchored at the shared world pivot; directions follow the toolbox's
              Scene/Local preference and the evaluated active root. */}
          {splineViewport.moveGizmo && <div role="group" aria-label="Spline edit move axes">
            <MoveAxisGizmo x={splineViewport.moveGizmo.point.x * zoom} y={splineViewport.moveGizmo.point.y * zoom}
              axisFrame={splineViewport.moveGizmo.axisFrame} onAxisPointerDown={splineViewport.moveGizmo.start} />
          </div>}
          {gizmo.axisMove && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <MoveAxisGizmo
              x={selectedWorldPivot.x * zoom}
              y={selectedWorldPivot.y * zoom}
              axisFrame={selectedAxisFrame} onAxisPointerDown={beginAxisMove}
            />
          )}

          {/* Scale-mode axis gizmo — X/Y arrows with SQUARE caps + centre
              uniform handle. Drives transform.scaleX/Y (matrix), distinct
              from frame resize which mutates width/height (geometry). */}
          {gizmo.axisScale && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <ScaleAxisGizmo
              x={selectedWorldPivot.x * zoom}
              y={selectedWorldPivot.y * zoom}
              axisFrame={selectedAxisFrame} onAxisPointerDown={beginScaleAxis}
            />
          )}

          {/* Rotate-mode ring — big orange circle around anchor.
              Radius scales with the layer size (min 60 CSS px) so the ring
              stays clearly outside the frame even for big shapes. */}
          {gizmo.ring && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <RotateRing
              x={selectedWorldPivot.x * zoom}
              y={selectedWorldPivot.y * zoom}
              radius={rotationRingRadius}
              isDragging={dragRef.current?.kind === 'rotate'}
              onPointerDown={beginRotate}
            />
          )}

          {/* Persistent origins and a distinct shared rotation center. */}
          {!hideEditorUI && !motionEditing && !arrayEditing && !placingShape && !panMode && selectedLayerIds && selectedLayerIds.size > 1 && (
            <SelectionOriginsOverlay scene={scene} selectedIds={selectedLayerIds} timeMs={timeMs} overrides={displayOverrides} zoom={zoom} />
          )}
          {!hideEditorUI && !geometryEditing && !motionEditing && !arrayEditing && !placingShape && !panMode && selectedLayer && !selectedLayer.hidden && (
            <AnchorHandle
              kind={multiSelectionBounds && !gizmo.anchor ? 'pivot' : 'origin'}
              x={selectedWorldPivot.x * zoom}
              y={selectedWorldPivot.y * zoom}
              isDragging={dragRef.current?.kind === 'anchor'}
              onPointerDown={gizmo.anchor ? beginAnchorDrag : undefined}
            />
          )}

          {!hideEditorUI && booleanPreview && <BooleanPreviewOverlay result={booleanPreview} zoom={zoom} width={width} height={height} />}
          {!hideEditorUI && outlinePreview && <SplineOutlineOverlay result={outlinePreview} zoom={zoom} width={width} height={height} />}
          {!hideEditorUI && chamferPreview && <SplineCornerOverlay label="Spline Chamfer preview" result={chamferPreview} zoom={zoom} width={width} height={height} />}
          {!hideEditorUI && filletPreview && <SplineCornerOverlay label="Spline Fillet preview" result={filletPreview} zoom={zoom} width={width} height={height} />}
          {/* Drag-time numeric readout (position / rotation / size) */}
          {hudPoint && containerRef.current && <TransformHUD {...hudPoint} viewport={containerRef.current} />}
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

      {/* Editor guides share the displayed geometry bounds; source metadata
          persists independently of the ruler/guide visibility preferences. */}
      {containerRef.current && (
        <CanvasGuideWorkspace
          scene={scene} editor={editor} canvasRef={canvasRef}
          composition={{ width, height }}
          zoom={zoom}
          pan={pan}
          containerEl={containerRef.current}
          showRulers={showRulers} showGuides={showGuides}
          cursorEnabled={!panMode && !modelCamera.active}
          pointerEnabled={!contentInspection && !hideEditorUI && !arrayEditing && !editor.isTransactionActive()}
          resolveSnap={snapEnabled ? resolvePointerSnap : undefined}
          enabled={!contentInspection && !hideEditorUI && !arrayEditing && !motionEditing && !placingShape}
          onWarning={setTransformWarning}
          selectedRect={
            !geometryEditing && selectedLayer && !selectedLayer.hidden
              ? selectedWorldBounds ?? undefined
              : undefined
          }
        />
      )}

      {/* Top-right controls: View + Snap dropdowns (SVGator-style) */}
      <div data-viewport-cursor-block className="absolute top-3 right-3 flex items-center gap-2 select-none z-40">
        <DocumentationHelp topic="editor/canvas" compact className="bg-gray-900/90" />
        <ViewMenu
          showGrid={snapSettings.grid.visible} onToggleGrid={() => snap.setGridVisible(!snapSettings.grid.visible)}
          gridSize={gridSize} onGridSizeChange={snap.setGridSize}
          showRulers={showRulers}     onToggleRulers={() => setShowRulers((v) => !v)}
          gridInFront={gridInFront}   onToggleGridFront={() => snap.setGridInFront(!gridInFront)}
          showGuides={showGuides}     onToggleGuides={() => setShowGuides((v) => !v)}
          showMeasurements={showMeasurements} onToggleMeasurements={() => setShowMeasurements(value => !value)}
          showMeshTriangles={showMeshTriangles} onToggleMeshTriangles={() => setShowMeshTriangles(value => !value)}
        />
        <SnapSettingsMenu snap={snap} />
      </div>

      <SelectionGapControls measurements={measurements} names={measurementNames} />
      {!hideEditorUI && offArtboardDiagnostic && <div role="status" className="absolute bottom-14 left-3 z-30 max-w-sm rounded border border-slate-600 bg-slate-950/95 px-2 py-1 text-xs text-slate-300">{offArtboardDiagnostic}</div>}
      {(measurements.diagnostic || (measurements.plan && (measurements.plan.truncated || measurements.plan.diagnostics.length > 0))) && <div
        role="status" data-measurement-diagnostics className="absolute bottom-14 left-3 z-30 max-w-sm rounded border border-pink-500/50 bg-slate-950/95 px-2 py-1 text-xs text-pink-100">
        {measurements.diagnostic || measurements.plan?.diagnostics.join(' ')}{measurements.plan?.truncated && ' Some measurement labels are omitted. Select fewer roots to show all gaps.'}
      </div>}

      <ViewportPerformanceOverlay />

      {/* Bottom-right controls: zoom pill */}
      <div data-viewport-cursor-block role="toolbar" aria-label="Viewport controls"
        onPointerDown={event => event.stopPropagation()}
        className="absolute bottom-3 right-3 z-30 max-w-[calc(100%-24px)] flex flex-wrap items-center justify-end gap-2 select-none">
        {!hideEditorUI && <ModelCameraToolbar camera={modelCamera} />}
        {/* Zoom + pan pill */}
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-700
                        rounded px-2 py-1 text-xs font-mono text-gray-300">
          <button
            onClick={() => setPanMode((p) => !p)}
            aria-pressed={panMode}
            title="Pan mode — drag the view instead of objects (middle-mouse always pans)"
            className={`px-1.5 py-0.5 rounded transition-colors
              ${panMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'text-gray-400 hover:bg-gray-700'}`}
          >
            ✋
          </button>
          <span className="w-px h-3 bg-gray-700 mx-0.5" />
          <button onClick={zoomOut}
            className="px-1.5 py-0.5 rounded hover:bg-gray-700" title="Zoom out (Cmd+scroll)">−</button>
          <ZoomScaleMenu
            zoom={zoom}
            onZoom={(scale) => scale === 1 ? actualSize() : zoomTo(scale)}
          />
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
          ? '✋ Pan mode · drag the work area · M / H or ✋ returns to the previous tool'
          : 'Drag = move · Arrows = 1px · Shift+Arrows = 10px · Shift = axis-lock · Handles to resize · ⌘ = aspect-lock · ⌘+Shift = scale from center · ⌘+scroll = zoom · Mid-mouse = pan'}
      </div>

      {/* ── Right-click context menu ─────────────────────────────────────────
          Built each render from the latest layer state so toggled flags
          (lock/hide) and selection size update the menu in real time. */}
      {ctxMenu.isOpen && ctxTargetLayerId && (() => {
        const target = scene.layers.find((l) => l.id === ctxTargetLayerId)
        if (!target) { ctxMenu.close(); return null }
        const handlers: CanvasMenuHandlers = {
          addLayer: menuHandlers?.addLayer,
          fitParent: menuHandlers?.fitParent,
          editContent: onEditContent ? () => onEditContent(target.id) : undefined,
          isolateSelection: onIsolateContent ? () => onIsolateContent(selectedLayerIds?.has(target.id) ? Array.from(selectedLayerIds) : [target.id]) : undefined,
          // ── Page-injected handlers (clipboard, group, animate, align) ───
          cut:        menuHandlers?.cut,
          copy:       menuHandlers?.copy,
          paste:      menuHandlers?.paste,
          duplicate:  menuHandlers?.duplicate,
          group:      menuHandlers?.group,
          ungroup:    menuHandlers?.ungroup ? () => menuHandlers.ungroup!(target.id) : undefined,
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
              : menuHandlers?.convertToSpline && ['shape', 'spline'].includes(target.type)
                ? menuHandlers.convertToSpline
                : undefined,
          convertToMesh2D: ['shape', 'spline'].includes(target.type) ? menuHandlers?.convertToMesh2D : undefined,

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
          editMotionKeys: selectedTimeline && !hideEditorUI && !arrayEditing && !placingShape && !contentInspection
            ? () => { onSelectLayer(target.id); setPanMode(false); onToolModeChange?.('select'); setMotionMode('select'); onOpenMotionControls?.() }
            : undefined,

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
          toggleSelectionLock: () => {
            const ids = Array.from(selectedLayerIds ?? [])
            const source = editor.getScene()
            const allLocked = ids.length > 0 && ids.every(id => source.layers.find(layer => layer.id === id)?.locked)
            editor.dispatchCommand(makeBulkToggleFlagCmd(ids, 'locked', !allLocked))
          },

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
          selectedLayers: scene.layers.filter(layer => selectedLayerIds?.has(layer.id)),
          canUngroup: menuHandlers?.canUngroup ?? false,
          canPaste:   menuHandlers?.canPaste   ?? false,
          handlers,
        })
        if (multiCount <= 1) items.unshift(...(target.spline && !target.booleanResultFor ? [{ kind: 'submenu' as const, label: 'Edit mode', items: (['point', 'edge', 'object'] as const).map(mode => ({ kind: 'action' as const, label: mode, onSelect: () => { splineEditController.enter(mode); onOpenSplineTools?.() } })) }] : []), ...splineDrawItems(target))
        if (onAgentHandoff) items.unshift(agentHandoffMenu({
          layerIds: selectedLayerIds?.has(target.id) ? Array.from(selectedLayerIds) : [target.id],
          ...(ctxPointRef.current ? { point: ctxPointRef.current } : {}),
        }, onAgentHandoff), { kind: 'separator' })
        return (
          <ContextMenu
            x={ctxMenu.state!.x}
            y={ctxMenu.state!.y}
            items={items}
            onClose={() => { ctxMenu.close(); setCtxTargetLayerId(null); ctxSelectionAtOpenRef.current = null }}
          />
        )
      })()}

      {/* ── Empty-canvas right-click → fit / zoom shortcuts ─────────────── */}
      {emptyCanvasCtx.isOpen && (() => {
        const hasSel = !!selectedLayerId
        const close  = emptyCanvasCtx.close
        const items: import('./ui/ContextMenu').MenuItem[] = [
          ...(menuHandlers?.addLayer ? [...buildAddLayerMenu(menuHandlers.addLayer), { kind: 'separator' as const }] : []),
          { kind: 'action', label: 'Fit to View',   shortcut: 'F',   onSelect: () => { fitAll();         close() } },
          { kind: 'action', label: 'Fit Width',                       onSelect: () => { fitWidth();       close() } },
          { kind: 'action', label: 'Fit Height',                      onSelect: () => { fitHeight();      close() } },
          { kind: 'action', label: 'Actual Size',   shortcut: '0',   onSelect: () => { actualSize();     close() } },
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

      {splineViewport.menu && splineSource?.spline && <SplineEditMenu x={splineViewport.menu.x} y={splineViewport.menu.y}
        target={splineViewport.menu.target} layer={splineSource} controller={splineEditController} getScene={editor.getScene}
        dispatch={editor.dispatchCommand} warning={setTransformWarning} close={splineViewport.closeMenu} prefix={splineDrawItems(splineSource)} tools={splineToolActions}
        tangentClipboard={splineTangentClipboard} timeMs={timeMs} overrides={runtimeOverrides} disabled={hideEditorUI || motionEditing || arrayEditing} isTransactionActive={editor.isTransactionActive} />}
    </div>
    <ViewportStatusBar selectedName={selectedLayer?.name} count={measurementSelection.size} toolMode={toolMode}
      placementName={placingShape ? shapePlacementLayer.name : undefined} placementSize={shapePlacement.draft?.size}
      pivotMode={pivotMode} onPivotModeChange={setPivotMode} mode={previewMode ? 'preview' : isPlaying ? 'playback' : 'editing'} />
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
