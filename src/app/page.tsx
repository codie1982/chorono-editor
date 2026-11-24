'use client'
import { emptyModelSceneDocument } from '@/lib/model3d/source/emptyModelScene'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { activateAddLayerItem } from '@/components/layers/add/activateAddLayerItem'
import { hasItemDetailEntry } from '@/lib/editor/detail'
import { useSelectionTimelineReveal } from '@/components/layerHierarchy/useSelectionTimelineReveal'
import { useItemDetail, useInactiveDetailSurface } from '@/components/detail/useItemDetail'
import { ItemDetailWorkspace } from '@/components/detail/ItemDetailWorkspace'
import { ModelDetailHeaderHost } from '@/components/detail/model3d/ModelDetailHeaderHost'
import type { Layer, ChronoScene, TimelineSettings } from '@/lib/types'
import { DEFAULT_TIMELINE_SETTINGS } from '@/lib/types'
import {
  emptyScene,
  newTimeline,
  cloneLayerForDuplicate,
} from '@/lib/defaults'
import { layerRegistry } from '@/lib/registry'
import { useShapeCreationTool } from '@/components/canvas/placement/useShapeCreationTool'
import { ensureInteractionTracePersistence } from '@/components/canvas/interactions/diagnostics'
import { acquireDiagnosticSharing } from '@/lib/diagnostics/browser/sharing'
import { DiagnosticConsentPrompt } from '@/components/resources/diagnostics/DiagnosticConsentPrompt'
import { computeTimelineCycleEnd, hasInfinitePlayback } from '@/lib/evaluator'
import { keyframePlaybackRange } from '@/lib/timeline/keyframePlaybackRange'
import { MotionKeysPanel } from '@/components/canvas/motion/MotionKeysPanel'
import { EditorDisplayBoundary } from '@/components/editorDisplay/EditorDisplayBoundary'
import { useEditorDisplayAvailable } from '@/components/editorDisplay/useEditorDisplay'
import { useEditorState }      from './hooks/useEditorState'
import { useTimelineAuthoring } from '@/components/timeline/authoring/useTimelineAuthoring'
import { sameKeyTime } from '@/lib/timeline/authoring/keyTimePolicy'
import { authoringTime } from '@/lib/timeline/authoring/timelineNavigation'
import { usePlayback }         from './hooks/usePlayback'
import { useKeyboard }         from './hooks/useKeyboard'
import { useToolMode }         from './hooks/useToolMode'
import type { TimelineProperty } from './hooks/useKeyboard'
import type { ShortcutContext } from '@/lib/shortcuts'
import { deletionTargetForPanel, panelFromAttribute, shortcutContextForPanel, type EditorPanel } from '@/lib/editor/keyboardContext'
import { resolveSelectedKeyframes } from '@/lib/timeline/keyframeSelection'
import { buildViewportNudgeCommand } from '@/lib/editor/viewportNudge'
import { makeSelectionSoloCmd } from '@/lib/editor/selectionSolo'
import { combineLayerSelection, createLayerSelection, retainLayerSelection, toggleLayerSelection } from '@/lib/selection/layerSelection'
import { useSnapSettings }     from './hooks/useSnapSettings'
import { useKeyframeClipboard } from './hooks/useKeyframeClipboard'
import { useAssetCache }       from './hooks/useAssetCache'
import { openDocumentFilePicker } from '@/components/import/DocumentFilePicker'
import { ImportActivityBar } from '@/components/import/ImportActivityBar'
import { useImport }           from './hooks/useImport'
import { useVideoPlaybackSync } from './hooks/useVideoPlaybackSync'
import { useAudioEngine }      from './hooks/useAudioEngine'
import AudioOutputControls from '@/components/timeline/AudioOutputControls'
import { normalizedClipGain } from '@/lib/audio/audioRender'
import { makePatchAudioClipCmd } from '@/lib/editor/commands-audio'
import { useInteractiveRuntime } from './hooks/useInteractiveRuntime'
import { useTimelineGhost }     from '@/components/timeline/hooks/useTimelineGhost'
import { useFileVersioning } from './hooks/useFileVersioning'
import { useMCPBridge } from './hooks/useMCPBridge'
import MCPConnection from '@/components/MCPConnection'
import AgentHandoffDialog from '@/components/agentHandoff/AgentHandoffDialog'
import { buildAgentHandoffPrompt, captureAgentHandoffContext, type AgentHandoffContext, type AgentHandoffRequest } from '@/lib/agentHandoff/prompt'
import { agentHandoffStore } from '@/lib/agentHandoff/store'
import { editorDocumentEpoch } from '@/lib/mcp/source/EditorSourceIdentity'
import ProjectMenu from '@/components/TopToolbar/ProjectMenu'
import { SessionOutputProvider, useSessionIdentity } from '@/components/editorSession/SessionOutputContext'
import { createChoronoDemo } from '@/lib/editor/demo/createChoronoDemo'
import { readSessionProject } from '@/lib/editor/session/SessionProject'
import { EditorSessionBoundary } from '@/components/editorSession/EditorSessionBoundary'
import { LocalRecoveryStatus } from '@/components/editorSession/LocalRecoveryStatus'
import { useSceneSessionRecovery } from './hooks/useSceneSessionRecovery'
import type { BrowserRecoverySession } from '@/lib/editor/persistence/recovery/browserSessionRecovery'
import { InteractivePreviewButton } from '@/components/TopToolbar/InteractivePreviewButton'
import WelcomeScreen from '@/components/welcome/WelcomeScreen'
import ReleaseNotesDialog from '@/components/releaseNotes/ReleaseNotesDialog'
import ResourceMonitorPanel from '@/components/resources/ResourceMonitorPanel'
import { renderWorkMonitor } from '@/lib/resources/performance/RenderWorkMonitor'
import { useWelcomeScreen } from '@/components/welcome/useWelcomeScreen'
import { useReleaseNotes } from '@/components/releaseNotes/useReleaseNotes'
import { createWelcomeProject, type WelcomeProjectSettings } from '@/lib/editor/welcomeProject'
import {
  makeAddLayerCmd, makeDeleteLayerCmd, makeDeleteLayersCmd, makeUpdateLayerCmd, makeToggleLayerCmd,
  makeDuplicateLayerCmd, makeMoveLayerCmd,
  makeBulkUpdateLayersCmd, makeBulkToggleFlagCmd,
  makeShowAllLayersCmd,
} from '@/lib/editor/commands-layer'
import { makeBulkDeleteKfCmd, makeKeyframeLayerSnapshotCmd, makeAddKfCmd, type KfDeletion } from '@/lib/editor/commands-keyframe'
import { buildViewportKeyframeCommands, type ViewportLayerChange } from '@/lib/editor/viewportKeyframes'
import { makeAddLayerToTimelineCmd, makeRemoveLayerFromTimelineCmd } from '@/lib/editor/commands-timeline'
import { makeBatchCmd } from '@/lib/editor/commands-batch'
import { makeUpdateCompositionCmd } from '@/lib/editor/commands-composition'
import { nextKfId } from '@/lib/defaults'
import { makeConvertToSplineCmd } from '@/lib/editor/commands-convert'
import { prepareGeometryConversion, type ConversionTarget } from '@/lib/editor/commands-geometry-conversion'
import type { SplinePrimitiveKind } from '@/lib/types/spline'

/** Maps Add-Layer menu kinds → spline primitive kinds for draw mode (BL-73). */
const SPLINE_MENU_TO_KIND: Record<string, SplinePrimitiveKind> = {
  splineCircle: 'circle', splineLine: 'line', splineRect: 'rectangle',
  splineEllipse: 'ellipse', splineArc: 'arc', splineDonut: 'donut',
  splineNGon: 'ngon', splineStar: 'star', splinePen:'custom', splineFreehand:'freehand', splineSpiral:'spiral',
}
import { ANIMATION_PRESETS } from '@/lib/timeline/presets'
import LayerPanel      from '@/components/LayerPanel'
import { useLayerIsolation } from '@/app/hooks/useLayerIsolation'
import { LayerIsolationBar } from '@/components/layerHierarchy/LayerFocusControls'
import type { TimelineRevealRequest } from '@/lib/timeline/hierarchy/TimelineRevealRequest'
import { makeMoveLayerInTreeCmd, makeGroupSiblingLayersCmd } from '@/lib/editor/branches/HierarchyCommands'
import { makeSetSubtreeFlagCmd } from '@/lib/editor/branches/SubtreeCommands'
import SceneExplorerPanel from '@/components/sceneExplorer/SceneExplorerPanel'
import SceneCanvas     from '@/components/SceneCanvas'
import PropertiesPanel from '@/components/PropertiesPanel'
import GeometryEditPanel from '@/components/editorGeometry/GeometryEditPanel'
import { modifierOutputReadOnly } from '@/lib/modifiers'
import { SplineModeControls } from '@/components/splineEdit/SplineModeControls'
import { useGeometryEditMode, type GeometryEditLevel } from '@/components/editorGeometry/useGeometryEditMode'
import type { MeshSelectionSummary } from '@/components/canvas/mesh2d/meshEditSelection'
import { useSplineDrawingPreferences } from '@/components/splineEdit/useSplineDrawingPreferences'
import { splineEditTools } from '@/components/splineEdit/tools/splineEditTools'
import { SplineEditInspector } from '@/components/splineEdit/SplineEditInspector'
import { useSplineAttachPicking } from '@/components/splineEdit/useSplineAttachPicking'
import { booleanOwner } from '@/lib/editor/boolean/operationPlan'
import { useBooleanPreview } from '@/components/booleanPreview/useBooleanPreview'
import { useSplineFillet } from '@/components/splineEdit/fillet/useSplineFillet'
import { useSplineChamfer } from '@/components/splineEdit/chamfer/useSplineChamfer'
import { useSplineBand } from '@/components/splineEdit/band/useSplineBand'
import { useSplineOutline } from '@/components/splineEdit/outline/useSplineOutline'
import { SplineToolsPanel } from '@/components/splineEdit/SplineToolsPanel'
import type { SplineEditMode } from '@/lib/spline/selection'
import { useSplineTangentClipboard } from '@/components/splineEdit/useSplineTangentClipboard'
import { useSplineEditSelection, type SplineEditRequest } from '@/components/splineEdit/useSplineEditSelection'
import { NumericPropertyProvider } from '@/components/inputs/expressions/NumericPropertyContext'
import { textToSplineData } from '@/lib/text/GlyphOutlineExtractor'
import { newSplineLayerFromData } from '@/lib/defaults'
import TimelinePanel   from '@/components/TimelinePanel'
import CurveEditor     from '@/components/timeline/CurveEditor'
import DopeSheetPanel  from '@/components/dope-sheet/DopeSheetPanel'
import JsonModal       from '@/components/JsonModal'
import WireParameterModal  from '@/components/wiring/WireParameterModal'
import { useWireModal }    from '@/app/hooks/useWireModal'
import FileMenu        from '@/components/TopToolbar/FileMenu'
import RasterExportDialog from '@/components/export/RasterExportDialog'
import SVGExportDialog   from '@/components/export/SVGExportDialog'
import SequenceExportDialog from '@/components/export/SequenceExportDialog'
import RenderSettingsDialog from '@/components/export/RenderSettingsDialog'
import {useSceneOutputActions} from './hooks/useSceneOutputActions'
import ImportUrlModal    from '@/components/modals/ImportUrlModal'
import ImportPreviewModal from '@/components/modals/ImportPreviewModal'
import SpriteSheetImportModal from '@/components/modals/SpriteSheetImportModal'
import { IMPORT_ACCEPT } from '@/lib/import/acceptFormats'
import type { ImportPreflight } from '@/lib/import/types'
import ToolGroup, {
  type ToolMode, type SelectionContainMode, type SelectionToolMode, isSelectionTool,
} from '@/components/TopToolbar/ToolGroup'
import ToastContainer  from '@/components/Toast/ToastContainer'
import { toast }       from '@/lib/toast/toast'
import KeyframeInspector from '@/components/panels/KeyframeInspector'
import CurveModifierStackPanel from '@/components/panels/CurveModifierStackPanel'
import ParametersPanel     from '@/components/panels/ParametersPanel'
import EventsPanel         from '@/components/panels/EventsPanel'
import MotionBindingPanel  from '@/components/panels/MotionBindingPanel'
import WiringListPanel     from '@/components/panels/WiringListPanel'
import SelectionPanel      from '@/components/panels/SelectionPanel'
import RuntimePreviewPanel from '@/components/panels/RuntimePreviewPanel'
import ChronoPlayerPanel from '@/components/panels/ChronoPlayerPanel'
import AssetsPanel         from '@/components/panels/AssetsPanel'
import StateMachinePanel       from '@/components/panels/StateMachinePanel'
import ScriptConsolePanel      from '@/components/panels/ScriptConsolePanel'
import ParticlePanel       from '@/components/particles/ParticlePanel'
import PhysicsSimulationsPanel from '@/components/physics/PhysicsSimulationsPanel'
import { usePhysicsBakeController } from '@/components/physics/usePhysicsBakeController'
import { DEFAULT_PHYSICS_VIEWPORT_OVERLAY_SETTINGS } from '@/components/physics/PhysicsViewportOverlayState'
import JobsBakePanel from '@/components/bake/JobsBakePanel'
import DockLayout       from '@/components/dock/DockLayout'
import DockOuterEdges   from '@/components/dock/DockOuterEdges'
import { DockDragProvider } from '@/components/dock/dragContext'
import { useDockLayout } from '@/components/dock/useDockLayout'
import { findLeafOfPanel } from '@/components/dock/layoutOps'
import { makeRegistry, type PanelDefinition, type PanelRegistry } from '@/components/dock/registry'
import CompositionPresetModal from '@/components/modals/CompositionPresetModal'
import ShortcutHelpModal      from '@/components/modals/ShortcutHelpModal'
import CloneModal             from '@/components/modals/CloneModal'
import ArrayModal             from '@/components/modals/ArrayModal'
import { useArrayAuthoring } from '@/components/array/useArrayAuthoring'
import { makeCloneAlignCmd } from '@/lib/editor/commands-clone'
import { prepareCloneForest } from '@/lib/editor/commands-clone-forest'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { makeBakeRepeaterCmd } from '@/lib/editor/commands-repeater'
import { defaultCloneAlignOptions } from '@/lib/clone/CloneAlign'
import {
  canCreateShapeBoundaryMesh2D,
  newShapeBoundaryMesh2DLayer,
  newSplineBoundaryMesh2DLayer,
} from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { targetsLayer } from '@/lib/timeline/TrackTargetParser'
// ── Mode system bootstrap ─────────────────────────────────────────────────────
import '@/lib/modes/bootstrap'
import { modeRegistry } from '@/lib/modes'
import type { EditorMode } from '@/lib/core/EditorMode'

export default function BuilderPage() {
  return <EditorDisplayBoundary><EditorSessionBoundary>{session => <SessionOutputProvider sessionId={session.id}><BuilderWorkspace session={session} /></SessionOutputProvider>}</EditorSessionBoundary></EditorDisplayBoundary>
}

/** Source/editor owners mount only after the local recovery barrier completes. */
function BuilderWorkspace({ session }: { session: BrowserRecoverySession }) {
  const displayAvailable = useEditorDisplayAvailable()
  // Restore the user's same-tab diagnostic session before any authoring gesture;
  // the adapter owns storage/timer/pagehide cleanup independently of dock panels.
  useEffect(() => ensureInteractionTracePersistence(), [])
  // ── Active editor mode ────────────────────────────────────────────────────
  // Currently always '2danimation'. When a mode selector UI lands, this will
  // drive descriptor lookup for panels / tools / renderer.
  const [currentMode] = useState<EditorMode>('2danimation')
  const modeDescriptor = modeRegistry.get(currentMode)

  // ── Central scene state with history + transactions ──────────────────────
  const [initialScene] = useState(() => session.scene ?? createChoronoDemo())
  const sessionIdentity = useSessionIdentity()!
  const editor = useEditorState(initialScene, session.history)
  const physicsBake = usePhysicsBakeController(editor)
  const [physicsViewportOverlay, setPhysicsViewportOverlay] = useState(DEFAULT_PHYSICS_VIEWPORT_OVERLAY_SETTINGS)
  const recovery = useSceneSessionRecovery(editor, session)
  useEffect(() => { if (!displayAvailable) editor.cancelTransaction() }, [displayAvailable, editor.cancelTransaction])
  useEffect(() => acquireDiagnosticSharing(() => !editor.isTransactionActive()), [editor.isTransactionActive])
  const {
    scene, canUndo, canRedo, dispatchCommand, resetScene, undo, redo,
    layerMetaById, getSiblingsInArray,
  } = editor
  const welcome = useWelcomeScreen(session.restored)
  const releaseNotes = useReleaseNotes(welcome.isReady, welcome.isOpen)

  // ── File versioning (browser-based scene persistence) ────────────────────
  // Writes scene to a user-chosen folder via the File System Access API:
  //  - sessions/<sessionId>/{name}.json → committed current + bounded history
  //  - same directory: {name}_TIMESTAMP.json → 10 min + manual versions
  // No server / MongoDB / Git — pure browser file output.
  const fileVersioning = useFileVersioning(editor.committedScene, {
    sessionId: sessionIdentity.id, history: editor.committedHistory,
    documentSignal:editor.getDocumentSignal(),
    interval_ms: 500,
    fallback_ms: 10000,
    snapshot_ms: 600000, // 10 minutes
    baseName: scene.composition.id || 'scene',
  })

  // ── Local UI selection / modal state (not part of scene history) ─────────
  const [layerSelection, setLayerSelection] = useState(() => createLayerSelection(scene.layers[0] ? [scene.layers[0].id] : [], scene.layers[0]?.id ?? null))
  const selectedLayerId = layerSelection.primaryId
  const [textEditRequestId, setTextEditRequestId] = useState<string | null>(null)
  // Legacy panel props accept Set; lend them a copy rather than mutable state.
  const selectedLayerIds = useMemo(() => new Set(layerSelection.selectedIds), [layerSelection.selectedIds])
  /** BL-73 — active spline primitive being drawn (null = not drawing). */
  const [splineDrawKind, setSplineDrawKind] = useState<SplinePrimitiveKind | null>(null)
  const [splineDrawTargetId, setSplineDrawTargetId] = useState<string | null>(null)
  const [splineContinuationPointId, setSplineContinuationPointId] = useState<string | null>(null)
  const [pendingSplineResult, setPendingSplineResult] = useState<SplineEditRequest | null>(null)
  const splineDrawingPreferences = useSplineDrawingPreferences()
  const { mode: toolMode, setMode: setToolMode, setPan: setPanMode, togglePan, chooseTool, selectionStyle, setSelectionStyle, transformSpace, setTransformSpace } = useToolMode()
  const changeToolMode = chooseTool
  const [manualPreview, setManualPreview] = useState(false)
  const [selectedTlId,     setSelectedTl]    = useState<string>(scene.timelines[0]?.id ?? '')
  const [showJson,        setShowJson]      = useState(false)
  const [showCompModal,   setShowCompModal] = useState(false)
  // BL-05: WireParameterModal state — opened by PropertiesPanel 🔗, WiringListPanel, etc.
  const wireModal = useWireModal()
  const [showHelp,        setShowHelp]      = useState(false)

  // Clone modal source is captured at open time. The Array authoring adapter
  // below owns its independent multi-root source/time/document session.
  const [cloneModalSource, setCloneModalSource] = useState<Layer | null>(null)
  const [cloneModalIds, setCloneModalIds] = useState<string[]>([])
  const [cloneModalScene, setCloneModalScene] = useState<ChronoScene | null>(null)

  // ── Dock layout (drag-droppable panel tiling) ────────────────────────────
  // The id list must enumerate EVERY panel the registry exposes — the
  // validator rejects unknown/duplicate panels but allows closed/new panels
  // to be absent from an older saved layout. Keep in sync
  // with the registry below.
  const dock = useDockLayout([
    'layers', 'sceneExplorer', 'canvas', 'stateMachine', 'properties', 'timeline', 'curveEditor', 'dopeSheet',
    'curveModifiers',
    'parameters', 'events', 'motionBinding', 'wiring', 'selection', 'runtimePreview', 'assets',
    'particles', 'physicsSimulations', 'jobsBake', 'player', 'scriptConsole', 'resourceMonitor', 'geometryEdit', 'motionKeys',
  ])

  // ── SM sub-mod toggle (BL-09) ────────────────────────────────────────────
  // The State Machine panel shares the canvas leaf as a tab. The toolbar
  // toggle (and Cmd+Shift+M) just switches the active tab — no separate "mode"
  // system. Dock tabs own navigation; this callback preserves the shortcut.
  const toggleSMMode = useCallback(() => {
    const leaf = findLeafOfPanel(dock.layout, 'stateMachine')
    if (!leaf) return
    const onSM = leaf.panels[leaf.activeIndex] === 'stateMachine'
    const other = leaf.panels.find((p) => p !== 'stateMachine') ?? 'canvas'
    dock.dispatchTab(leaf.id, onSM ? other : 'stateMachine')
  }, [dock])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        toggleSMMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSMMode])

  // Fullscreen canvas — hides the dock and renders only the canvas leaf.
  const [fullscreenCanvas, setFullscreenCanvas] = useState(false)
  // Escape exits fullscreen
  useEffect(() => {
    if (!fullscreenCanvas) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenCanvas(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreenCanvas])
  const dockContainerRef = useRef<HTMLDivElement | null>(null)
  const layerFocusDocument = editor.getDocumentSignal()
  const layerIsolation = useLayerIsolation(scene, layerFocusDocument)
  /** UUID-based keyframe multi-selection — survives drag, persists across renders */
  const [storedSelectedKfIds, setSelectedKfIds] = useState<Set<string>>(() => new Set())
  /** A motion-key tool owns canvas arrows/delete while editing its selection. */
  const [motionKeyEditing, setMotionKeyEditing] = useState(false)
  const [motionControlsHost, setMotionControlsHost] = useState<HTMLDivElement | null>(null)
  const selectTimeline = useCallback((id: string) => {
    setSelectedTl(id)
    setSelectedKfIds(new Set())
  }, [])
  const selectedKeyframes = useMemo(
    () => resolveSelectedKeyframes(scene, selectedTlId, storedSelectedKfIds, layerIsolation.contentScope),
    [scene, selectedTlId, storedSelectedKfIds, layerIsolation.contentScope],
  )
  // Keep outside key selection dormant rather than authoring or deleting it.
  // Every keyboard/clipboard/panel callback consumes this effective selection.
  const selectedKfIds = useMemo(() => layerIsolation.contentScope
    ? new Set(selectedKeyframes.map(item => item.kf.id)) : storedSelectedKfIds,
  [layerIsolation.contentScope, selectedKeyframes, storedSelectedKfIds])
  // Timeline changes, undo and imports cannot leave invisible keys selected.
  useEffect(() => {
    const timeline = scene.timelines.find((tl) => tl.id === selectedTlId)
    if (!timeline) {
      const nextId = scene.timelines[0]?.id ?? ''
      if (nextId !== selectedTlId) selectTimeline(nextId)
    }
    const valid = new Set(timeline?.tracks.flatMap((track) => track.keyframes.map((key) => key.id)) ?? [])
    setSelectedKfIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => valid.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [scene.timelines, selectedTlId, selectTimeline])
  /** Editor preferences (snap, auto-key, graph editor mode) — outside undo */
  const [timelineSettings, setTimelineSettings] = useState<TimelineSettings>(DEFAULT_TIMELINE_SETTINGS)

  // ── Derived ──────────────────────────────────────────────────────────────
  /**
   * Global playback span. Has to fit the LONGEST per-timeline cycle —
   * for loopCount=N or pingPong, that means N×duration or 2×duration so the
   * evaluator's bounded-loop math gets a chance to trigger. composition's
   * own durationMs is the lower bound (manual override).
   */
  const maxDuration = useMemo(() => {
    let max = scene.composition.durationMs
    for (const tl of scene.timelines) {
      const end = computeTimelineCycleEnd(tl)
      if (end > max) max = end
    }
    return max
  }, [scene.timelines, scene.composition.durationMs])

  /** Whether the playhead should wrap back to 0 at maxDuration (true) vs.
   *  auto-pause (false). Wraps only if some timeline plays forever. */
  const wrapAtEnd = useMemo(() => hasInfinitePlayback(scene.timelines), [scene.timelines])
  const selectedLayer = scene.layers.find((l) => l.id === selectedLayerId) ?? null
  const splineTangentClipboard = useSplineTangentClipboard(editor.getDocumentSignal())
  const splineEdit = useSplineEditSelection(selectedLayerIds.size <= 1 ? selectedLayer : null, editor.getDocumentSignal())
  const geometryEdit = useGeometryEditMode(selectedLayerIds.size === 1 ? selectedLayer : null, splineEdit, editor.getDocumentSignal())
  const [meshSelection, setMeshSelection] = useState<MeshSelectionSummary | null>(null)
  useEffect(() => {
    if (!pendingSplineResult) return
    if (pendingSplineResult.layerId === selectedLayerId && selectedLayer?.spline) splineEdit.enter(pendingSplineResult.mode, pendingSplineResult.ids)
    setPendingSplineResult(null)
  }, [pendingSplineResult, selectedLayerId, selectedLayer?.spline, splineEdit.enter])
  const frameRate     = scene.composition.frameRate

  // Auto-switch the right-hand dock column to the Particle tab whenever the
  // user selects a particleEmitter layer — saves an extra click. Switching
  // BACK to Properties is left to the user (no auto-revert on deselection).
  //
  // ⚠️ Critical: depend on `dispatchTab` (stable — wrapped in useCallback([])
  // inside the hook), NOT on the wrapping `dock` object. `useDockLayout()`
  // returns a fresh object literal every render, so including `dock` as a
  // dep would re-fire this effect on every tab click: user clicks Properties
  // → layout state updates → dock ref changes → effect re-runs → snaps the
  // tab back to Particle → user can't escape the panel. Bug fix.
  const { dispatchTab } = dock
  useEffect(() => {
    if (selectedLayer?.type === 'particleEmitter') {
      dispatchTab('properties-leaf', 'particles')
    }
  }, [selectedLayer?.id, selectedLayer?.type, dispatchTab])

  // ── Asset cache: loads images/videos referenced in scene.assets ──────────
  const assetCache = useAssetCache(scene.assets, { managed: true })

  // Active timeline's work area confines playback to a sub-range when set.
  const activeWorkArea = useMemo(() => {
    const tl = scene.timelines.find((t) => t.id === selectedTlId)
    return { inMs: tl?.workAreaInMs, outMs: tl?.workAreaOutMs }
  }, [scene.timelines, selectedTlId])
  const activeKeyRange = useMemo(() => {
    const timeline = scene.timelines.find(item => item.id === selectedTlId)
    return timeline?.playKeyRange ? keyframePlaybackRange(timeline) : null
  }, [scene.timelines, selectedTlId])

  // ── Playback loop ────────────────────────────────────────────────────────
  const {
    currentTimeMs, isPlaying, playbackSpeed,
    handlePlayToggle, handlePause, handleSeek, setPlaybackSpeed,
  } = usePlayback({
    maxDuration, wrapAtEnd,
    workAreaInMs: activeWorkArea.inMs,
    workAreaOutMs: activeWorkArea.outMs,
    range: activeKeyRange,
    enabled: displayAvailable,
  })

  const detail = useItemDetail(editor)
  const detailHeaderRef = useInactiveDetailSurface<HTMLElement>(!!detail.session)
  const detailBackgroundRef = useInactiveDetailSurface<HTMLDivElement>(!!detail.session)
  const [detailTimeMs, setDetailTimeMs] = useState(0)
  /** Read current committed source before entering; selection and dock stay put. */
  const openItemDetail = useCallback((id: string) => {
    if (!hasItemDetailEntry(editor.getCommittedScene().layers.find(layer => layer.id === id))) return
    try {
      if (motionKeyEditing || toolMode === 'shape-draw' || toolMode === 'spline-draw') throw new Error('Finish the current drawing or motion-key tool before opening content.')
      detail.open(id); setDetailTimeMs(currentTimeMs); handlePause()
    }
    catch (error) { toast.warning('Cannot edit content', { detail: error instanceof Error ? error.message : String(error) }) }
  }, [detail.open, currentTimeMs, handlePause, motionKeyEditing, toolMode, editor.getCommittedScene])

  // ── Autoplay: kick off playback once on first mount if any timeline asks for it.
  // Subsequent scene edits do NOT restart — toggling autoplay later is metadata
  // for the runtime export only. Browser autoplay policy may suppress audio.
  const autoplayedRef = useRef(false)
  useEffect(() => {
    if (autoplayedRef.current) return
    if (scene.timelines.some((t) => t.autoplay)) {
      autoplayedRef.current = true
      handlePlayToggle()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Interactive runtime: parameters / events / segments preview ──────────
  // Ephemeral state — never touches scene tree or undo history. Drives the
  // four "Interactive" panels and the canvas's runtime preview overlay.
  const [mcpTimelineIds, setMCPTimelineIds] = useState<string[] | null>(null)
  const playbackScene = useMemo(() => mcpTimelineIds ? { ...scene, timelines: scene.timelines.filter(t => mcpTimelineIds.includes(t.id)), stateMachines: [] } : scene, [scene, mcpTimelineIds])
  const runtime = useInteractiveRuntime(playbackScene, { playbackDriven: isPlaying })
  const mcp = useMCPBridge({ editor, assets: assetCache, selectedTimelineId: selectedTlId, currentTimeMs, isPlaying,
    getLiveFrame: () => frame,
    getRuntimeState: () => ({ parameters: Object.fromEntries(runtime.paramValues), stateMachines: Array.from(runtime.smRuntimes.values(), rt => ({id:rt.sm.id,stateId:rt.currentStateId,stateName:rt.currentState?.name,timelineId:rt.activeTimelineId})) }),
    setRuntimeTest: runtime.setSMTestActive,
    selectTimeline, isolateTimelines: setMCPTimelineIds, seek: handleSeek, playToggle: handlePlayToggle, setSpeed: setPlaybackSpeed,
    setParameter: runtime.setParamOverride, dispatchEvent: runtime.dispatchSMEvent,
    getAudioState: () => audioTransport.getState(),
    getAgentHandoff: id => agentHandoffStore.get(id),
  })
  const [pendingAgentHandoff, setPendingAgentHandoff] = useState<{
    intent: 'edit' | 'ask'; context: AgentHandoffContext
  } | null>(null)
  const copyAgentHandoff = useCallback(async (context: AgentHandoffContext, intent: AgentHandoffRequest['intent'], detail = '') => {
    try {
      const handoffId = agentHandoffStore.create(context)
      await navigator.clipboard.writeText(buildAgentHandoffPrompt(context, intent, detail, handoffId))
      toast.success('Agent prompt copied', { detail: 'Paste it into your connected agent chat.' })
      return true
    } catch (error) {
      toast.error('Unable to copy agent prompt', { detail: error instanceof Error ? error.message : String(error) })
      return false
    }
  }, [])
  const handleAgentHandoff = useCallback((request: AgentHandoffRequest) => {
    if (!mcp.connected || !mcp.sessionId) {
      toast.warning('MCP bağlantısı gerekli', {
        detail: mcp.enabled
          ? 'Üst araç çubuğundaki MCP düğmesinden “Connect this editor” seçin.'
          : 'MCP servisini başlatın, ardından üst araç çubuğundaki MCP düğmesinden editörü bağlayın.',
      })
      return
    }
    try {
      if (editor.isTransactionActive()) throw new Error('Finish the current edit before copying an agent prompt.')
      const context = captureAgentHandoffContext({
        scene: editor.getScene(), sessionId: mcp.sessionId,
        documentEpoch: editorDocumentEpoch(editor), revision: editor.getRevision(),
        timelineId: selectedTlId || null, timeMs: currentTimeMs, target: request,
      })
      if (request.intent === 'edit' || request.intent === 'ask') setPendingAgentHandoff({ intent: request.intent, context })
      else void copyAgentHandoff(context, request.intent)
    } catch (error) {
      toast.warning('Cannot prepare agent prompt', { detail: error instanceof Error ? error.message : String(error) })
    }
  }, [mcp.connected, mcp.enabled, mcp.sessionId, editor, selectedTlId, currentTimeMs, copyAgentHandoff])

  // Per-frame evaluation: merges timeline + binding + param overrides and
  // dispatches lifecycle / trigger events. Re-runs whenever the playhead or
  // any runtime input changes.
  const expressionAuthoringClock = useMemo(() => (!isPlaying || activeKeyRange) && !manualPreview && selectedTlId && scene.timelines.some(item => item.id === selectedTlId)
    ? { timelineId: selectedTlId, localTimeMs: authoringTime(scene.timelines.find(item => item.id === selectedTlId)!, currentTimeMs) } : null,
    [isPlaying, activeKeyRange, manualPreview, selectedTlId, scene.timelines, currentTimeMs])
  const frame = useMemo(
    () => renderWorkMonitor.measure('evaluation', () => runtime.evaluateFrame(currentTimeMs, expressionAuthoringClock)),
    // We deliberately include paramValues so slider edits cause a re-eval.
    // One revision includes segment/test playback and queued events while paused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, playbackScene, currentTimeMs, isPlaying, manualPreview, selectedTlId, runtime.paramValues, runtime.segmentState, runtime.frameRevision, expressionAuthoringClock],
  )

  /** Manual transport is local and paused; work-area playback never wraps an edit. */
  const isolatedSelectedIds = useMemo(() => layerIsolation.contentScope
    ? new Set(Array.from(selectedLayerIds).filter(id => layerIsolation.contentScope!.has(id))) : selectedLayerIds,
  [layerIsolation.contentScope, selectedLayerIds])
  const booleanPreview = useBooleanPreview({ scene, selectedIds: isolatedSelectedIds, primary: selectedLayerId, splineEdit,
    timeMs: currentTimeMs, overrides: frame.overrides, documentSignal: editor.getDocumentSignal(),
    dispatch: dispatchCommand, getScene: editor.getScene, isTransactionActive: editor.isTransactionActive, onApplied: id => { splineEdit.exit(); selectLayer(id) },
    disabled: isPlaying || manualPreview || !!runtime.segmentState || !!detail.session || toolMode === 'shape-draw' || toolMode === 'spline-draw' })
  const isolatedPrimaryId = selectedLayerId && (!layerIsolation.contentScope || layerIsolation.contentScope.has(selectedLayerId)) ? selectedLayerId : null
  const splineOutline = useSplineOutline({ scene, controller: splineEdit, timeMs: currentTimeMs, overrides: frame.overrides,
    documentSignal: editor.getDocumentSignal(), getScene: editor.getScene, dispatch: dispatchCommand, isTransactionActive: editor.isTransactionActive,
    disabled: isPlaying || manualPreview || !!runtime.segmentState || !!detail.session || booleanPreview.active || toolMode === 'shape-draw' || toolMode === 'spline-draw' })
  const splineChamfer = useSplineChamfer({ scene, controller: splineEdit, timeMs: currentTimeMs, overrides: frame.overrides,
    documentSignal: editor.getDocumentSignal(), getScene: editor.getScene, dispatch: dispatchCommand, isTransactionActive: editor.isTransactionActive,
    disabled: isPlaying || manualPreview || !!runtime.segmentState || !!detail.session || booleanPreview.active || toolMode === 'shape-draw' || toolMode === 'spline-draw' })
  const splineFillet = useSplineFillet({ scene, controller: splineEdit, timeMs: currentTimeMs, overrides: frame.overrides,
    documentSignal: editor.getDocumentSignal(), getScene: editor.getScene, dispatch: dispatchCommand, isTransactionActive: editor.isTransactionActive,
    disabled: isPlaying || manualPreview || !!runtime.segmentState || !!detail.session || booleanPreview.active || toolMode === 'shape-draw' || toolMode === 'spline-draw' })
  const splineBand = useSplineBand({ scene, controller: splineEdit, timeMs: currentTimeMs, overrides: frame.overrides,
    documentSignal: editor.getDocumentSignal(), getScene: editor.getScene, dispatch: dispatchCommand, isTransactionActive: editor.isTransactionActive,
    disabled: isPlaying || manualPreview || !!runtime.segmentState || !!detail.session || booleanPreview.active || toolMode === 'shape-draw' || toolMode === 'spline-draw' })
  useEffect(() => {
    if (layerIsolation.contentScope) setLayerSelection(previous => retainLayerSelection(previous, layerIsolation.contentScope!))
  }, [layerIsolation.contentScope])
  const [timelineReveal, setTimelineReveal] = useState<TimelineRevealRequest | null>(null)
  useEffect(() => { setTimelineReveal(null) }, [selectedLayerId, selectedLayerIds, selectedTlId, layerFocusDocument])
  /** Reveal the selection without changing membership, playhead or source.
   * Automatic requests wait until the selecting pointer gesture has finished. */
  const showSelectionInTimeline = useCallback(() => {
    if (!selectedTlId) return
    const ids = Array.from(selectedLayerIds.size ? selectedLayerIds : selectedLayerId ? [selectedLayerId] : [])
    if (!ids.length) return
    setTimelineReveal(previous => ({ nonce: (previous?.nonce ?? 0) + 1, timelineId: selectedTlId, layerIds: ids, primaryId: selectedLayerId }))
    dock.dispatchRestorePanel('timeline')
  }, [selectedTlId, selectedLayerId, selectedLayerIds, dock.dispatchRestorePanel])
  useSelectionTimelineReveal({ selectedId: selectedLayerId, selectedIds: selectedLayerIds,
    timelineId: selectedTlId, documentSignal: layerFocusDocument, editor,
    enabled: !detail.session && !manualPreview && !isPlaying, onReveal: showSelectionInTimeline })
  const seekAuthoring = useCallback((ms: number) => { handlePause(); handleSeek(ms) }, [handlePause, handleSeek])
  const timelineAuthoring = useTimelineAuthoring({ scene, editor, timelineId: selectedTlId,
    selectedId: isolatedPrimaryId, selectedIds: isolatedSelectedIds, selectedKeyIds: selectedKfIds, layerScope: layerIsolation.contentScope,
    currentTimeMs, isPlaying, timeBasis: activeKeyRange ? 'local' : 'global', enabled: !manualPreview && !runtime.segmentState, onSeek: seekAuthoring, onActivateTimeline: setSelectedTl })

  // Video properties use the same evaluated frame as the canvas and audio.
  useVideoPlaybackSync({ scene, assetCache, currentTimeMs, isPlaying, playbackSpeed, overrides: frame.overrides })

  const audioTimelineIds = useMemo(() => {
    if (mcpTimelineIds) return mcpTimelineIds
    if (!scene.stateMachines?.length) return undefined
    const owned = new Set(scene.stateMachines.flatMap(machine => machine.states.map(state => state.timelineId)))
    const active = new Set(Array.from(runtime.smRuntimes.values()).map(machine => machine.activeTimelineId))
    return scene.timelines.filter(timeline => !owned.has(timeline.id) || active.has(timeline.id)).map(timeline => timeline.id)
  }, [scene.timelines, scene.stateMachines, mcpTimelineIds, runtime.smRuntimes, frame])
  const audioTransport = useAudioEngine({ scene, currentTimeMs, isPlaying, playbackSpeed,
    overrides: frame.overrides, timelineIds: audioTimelineIds,
    masterVolume: scene.composition.audioMuted ? 0 : scene.composition.audioVolume ?? 1 })
  const normalizeAudio = useCallback(async (layerId: string) => {
    const revision = editor.getRevision()
    try {
      const normalized = await normalizedClipGain(editor.getScene(), layerId)
      if (editor.getRevision() !== revision) throw new Error('Scene changed while measuring audio; try again.')
      dispatchCommand(makePatchAudioClipCmd(layerId, { volume: normalized.volume }))
      if (normalized.warnings.length) toast.warning('Audio normalized', { detail: normalized.warnings.join(' ') })
      else toast.success('Source peak normalized to −1 dBFS')
    } catch (error) { toast.error('Audio normalization failed', { detail: (error as Error).message }) }
  }, [editor, dispatchCommand])

  /** Replace a bulk selection in one React update; keep its preferred primary
   * only if selected. Copy now so callers cannot mutate queued UI state. */
  const replaceLayerSelection = useCallback((ids: Iterable<string>, primaryId?: string | null) => {
    const selected = new Set(ids)
    setLayerSelection(previous => createLayerSelection(selected,
      primaryId === undefined ? previous.primaryId : primaryId))
  }, [])

  const selectArrayRoots = useCallback((ids: readonly string[]) => replaceLayerSelection(ids, ids[0] ?? null), [replaceLayerSelection])
  const arrayAuthoring = useArrayAuthoring({ editor, scene, timeMs: currentTimeMs,
    selectedLayerIds, selectedLayerId, onSelectLayers: selectArrayRoots })

  /** Click replaces selection; Shift-click toggles. Primary and membership
   * change atomically, including when the primary or final member is removed. */
  const selectLayer = useCallback((id: string | null, shiftHeld = false) => {
    if (id == null) setSelectedKfIds(new Set())
    setLayerSelection(previous => id == null ? createLayerSelection([])
      : shiftHeld ? toggleLayerSelection(previous, id) : createLayerSelection([id], id))
  }, [])
  const pickSplineToAttach = useSplineAttachPicking({ layer: selectedLayer, controller: splineEdit,
    getScene: editor.getScene, dispatch: dispatchCommand, timeMs: currentTimeMs, overrides: frame.overrides, onSelectLayer: selectLayer,
    disabled: isPlaying || manualPreview || !!detail.session, isTransactionActive: editor.isTransactionActive,
    warning: message => { if (message) toast.warning('Add Spline', { detail: message }) } })
  const shapeCreation = useShapeCreationTool({ toolMode, setToolMode, onSelect: selectLayer,
    documentSignal: editor.getDocumentSignal(), getScene: editor.getScene })
  useEffect(() => {
    if (manualPreview || runtime.segmentState || isPlaying) shapeCreation.close()
  }, [manualPreview, runtime.segmentState, isPlaying, shapeCreation.close])

  /** Reveal the existing dock tab, respecting a user's moved/collapsed layout. */
  const openSplineTools = useCallback(() => dock.dispatchRestorePanel('geometryEdit', 'properties'), [dock.dispatchRestorePanel])
  const editBooleanOperation = (id: string) => { booleanPreview.openOperation(id); openSplineTools() }
  /** A list context command may target a not-yet-selected spline. Defer mode
   * entry until its controller has adopted that layer; never enter on the old
   * selection or replace its source. Existing selections retain mode ID banks. */
  const enterSplineEditMode = useCallback((id: string, mode: SplineEditMode) => {
    if (isPlaying || manualPreview || detail.session || editor.isTransactionActive()) return
    if (!editor.getScene().layers.some(layer => layer.id === id && layer.spline && !layer.booleanResultFor)) return
    if (splineEdit.layerId === id && selectedLayerIds.size === 1) splineEdit.enter(mode)
    else { selectLayer(id); setPendingSplineResult({ layerId: id, mode, ids: [] }) }
    openSplineTools()
  }, [isPlaying, manualPreview, detail.session, editor.isTransactionActive, editor.getScene, splineEdit.layerId, splineEdit.enter, selectedLayerIds.size, selectLayer, openSplineTools])
  /** Digits enter one shared Edit level without changing source or restarting a session. */
  const enterGeometryEditLevel = useCallback((mode: GeometryEditLevel) => {
    if (isPlaying || manualPreview || detail.session || editor.isTransactionActive() || selectedLayerIds.size !== 1) return
    const layer = editor.getScene().layers.find(item => item.id === selectedLayerId)
    if (!layer || !['spline', 'mesh2d'].includes(layer.type) || layer.locked || layer.hidden || layer.frozen || layer.instanceOf) return
    setToolMode('select'); geometryEdit.enter(mode); openSplineTools()
  }, [isPlaying, manualPreview, detail.session, editor, selectedLayerIds.size, selectedLayerId, setToolMode, geometryEdit.enter, openSplineTools])
  useEffect(() => {
    if (selectedLayer?.spline && !isPlaying && !manualPreview && !detail.session) openSplineTools()
  }, [selectedLayer?.id, splineEdit.active, isPlaying, manualPreview, !!detail.session, openSplineTools])

  // External edits, undo and document replacement can remove selected layers.
  // Keep surviving members instead of clearing the whole selection.
  useEffect(() => {
    const valid = new Set(scene.layers.map(layer => layer.id))
    setLayerSelection(previous => retainLayerSelection(previous, valid))
  }, [scene.layers])

  // ── Universal import pipeline (BL-04–06) ─────────────────────────────────
  // Routes any File through ImportManager → atomic command → dispatch.
  // All media/document pickers below use this document-scoped pipeline.
  const {
    importFile: importAnyFile, importPaintImage,
    openScene: openSceneFile,
    importFiles: importAnyFiles,
    importUrl: importAnyUrl,
    importFromClipboard: importAnyClipboard,
    importSpriteSheet,
    preview: previewImport,
    activeCount: importActiveCount, settlingCount: importSettlingCount,
    label: importLabel, progress: importProgress, cancel: cancelImports,
  } = useImport({
    dispatchCommand, getDocumentSignal: editor.getDocumentSignal, getScene: editor.getScene,
    selectedTimelineId: selectedTlId, currentTimeMs,
    onSelectLayer: (id) => selectLayer(id),
  })

  const [importUrlDocument, setImportUrlDocument] = useState<AbortSignal | null>(null)
  // Single-file imports show a preflight preview before committing.
  const [pendingImport, setPendingImport] = useState<{ file: File; preflight: ImportPreflight; document: AbortSignal } | null>(null)
  // Sprite-sheet import: an image awaiting grid configuration.
  const [pendingSprite, setPendingSprite] = useState<{ file: File; document: AbortSignal } | null>(null)
  const importDocument = editor.getDocumentSignal()
  const previewRequest = useRef(0)
  useEffect(() => {
    setPendingImport(value => value?.document === importDocument ? value : null)
    setPendingSprite(value => value?.document === importDocument ? value : null)
    setImportUrlDocument(value => value === importDocument ? value : null)
  }, [importDocument])

  const openSpriteSheetPicker = useCallback(() => {
    openDocumentFilePicker({ accept: 'image/png,image/jpeg,image/webp', getDocumentSignal: editor.getDocumentSignal,
      onFiles: files => setPendingSprite({ file: files[0], document: editor.getDocumentSignal() }) })
  }, [editor.getDocumentSignal])

  const handleImportFiles = useCallback(async (files: FileList | File[]) => {
    const scope = editor.getDocumentSignal(), request = ++previewRequest.current
    setPendingImport(null)
    const list = Array.from(files)
    if (list.length === 1) {
      const preflight = await previewImport(list[0])
      if (preflight && request === previewRequest.current && !scope.aborted && editor.getDocumentSignal() === scope) {
        setPendingImport({ file: list[0], preflight, document: scope })
      }
      return
    }
    void importAnyFiles(list)
  }, [previewImport, importAnyFiles, editor.getDocumentSignal])

  // Programmatic file picker for the File menu "Import File…" entry.
  const openImportPicker = useCallback(() => {
    openDocumentFilePicker({ accept: IMPORT_ACCEPT, multiple: true, getDocumentSignal: editor.getDocumentSignal,
      onFiles: files => { void handleImportFiles(files) } })
  }, [handleImportFiles, editor.getDocumentSignal])

  /** Arm a captured target intent without source writes. Add in edit appends;
   * Continue additionally pins one endpoint. Selection changes cannot redirect
   * an in-progress gesture into a different spline. */
  const armSplineDrawing = useCallback((kind: SplinePrimitiveKind, targetId: string | null, endpointId?: string) => {
    if (editor.isTransactionActive()) return
    shapeCreation.close(); setManualPreview(false); runtime.stopSegment(); handlePause()
    setSplineDrawTargetId(targetId); setSplineContinuationPointId(endpointId ?? null)
    setSplineDrawKind(kind); setToolMode('spline-draw')
    if (kind === 'line') openSplineTools()
  }, [editor.isTransactionActive, shapeCreation.close, runtime.stopSegment, handlePause, setToolMode, openSplineTools])

  // ── Layer commands ───────────────────────────────────────────────────────
  /** Activate native creation from registry defaults, or use the layer's
   * dedicated insertion workflow. Native shapes exit runtime Preview/playback
   * without modifying existing source and return true to keep the palette open.
   * Shape gestures own insertion/undo; choosing a tool alone writes no history. */
  const addLayer = useCallback((kind: string, origin?: { x: number; y: number }) => {
    if (editor.isTransactionActive()) return
    if (kind === 'empty3dScene') { void importAnyFile(new File([JSON.stringify(emptyModelSceneDocument())], 'Empty 3D Scene.gltf', { type: 'model/gltf+json' })); return }
    arrayAuthoring.close()
    setPathPickMode(null)
    // BL-73 — Spline primitives are mouse-drawn, not instantly placed. Clicking
    // one enters draw mode; the canvas handles the create/append gesture.
    const splineKind = SPLINE_MENU_TO_KIND[kind]
    if (splineKind) {
      selectLayer(null)
      armSplineDrawing(splineKind, null)
      return
    }

    const def = layerRegistry.get(kind)
    if (!def) {
      console.warn(`addLayer: unknown layer kind "${kind}"`)
      return
    }
    const l = def.createDefault()
    // Both menus arm the same tool without source/history writes. A context
    // origin is a visual reference; actual pointer-down starts the gesture.
    if (shapeCreation.choose(kind, l, () => def.createDefault(), origin)) {
      setManualPreview(false)
      runtime.stopSegment()
      handlePause()
      setSplineDrawKind(null)
      return true
    }
    shapeCreation.close()
    dispatchCommand(makeAddLayerCmd(l))
    selectLayer(l.id)
    if (kind === 'text') setTextEditRequestId(l.id)
    // BL-66: paths start empty — auto-switch to Pen tool so the next click
    // on the canvas places the first anchor.
    if (kind === 'bezierPath' || kind === 'motionPath') {
      setToolMode('pen')
    }
  }, [dispatchCommand, selectLayer, editor.isTransactionActive, arrayAuthoring.close, handlePause,
    shapeCreation.choose, shapeCreation.close, runtime.stopSegment, importAnyFile])

  // BL-73 Sprint 6 — Convert a text layer into editable spline glyph outlines.
  // Async: lazily fetches + parses the font (opentype.js) before building the
  // granular spline data, then adds it as a new spline layer at the text's pos.
  const convertTextToSpline = useCallback(async () => {
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (layer?.type !== 'text' || !layer.text?.value) return
    const document=editor.getDocumentSignal()
    try {
      const data = await textToSplineData(layer.text.value, layer.text.fontSize ?? 48,undefined,{signal:document})
      if(document.aborted)return
      if (!data) { toast.info('No drawable glyphs to convert'); return }
      const splineLayer = newSplineLayerFromData(data, {
        name: `${layer.name} Outlines`,
        x: layer.transform.x,
        y: layer.transform.y,
      })
      dispatchCommand(makeAddLayerCmd(splineLayer))
      selectLayer(splineLayer.id)
    } catch (err) {
      if(document.aborted)return
      toast.error('Text → Spline failed: ' + (err as Error).message)
    }
  }, [scene.layers, selectedLayerId, dispatchCommand, selectLayer,editor.getDocumentSignal])

  /** Native static geometry conversion, shared by the multi-selection context
   * menu and Edit dock. Admission preserves existing drivers/references. */
  const convertSelectedGeometry = useCallback((target: ConversionTarget) => {
    try {
      if (isPlaying || manualPreview || detail.session || editor.isTransactionActive()) throw new Error('Finish playback or the current edit before converting.')
      const ids = Array.from(isolatedSelectedIds.size ? isolatedSelectedIds : selectedLayerId ? [selectedLayerId] : [])
      const plan = prepareGeometryConversion(editor.getScene(), ids, target)
      dispatchCommand(plan.command); selectLayer(plan.layerId); splineEdit.clear(); openSplineTools()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Geometry conversion failed') }
  }, [editor, isolatedSelectedIds, selectedLayerId, dispatchCommand, selectLayer, splineEdit.clear, openSplineTools, isPlaying, manualPreview, detail.session])

  /** Create a separate, source-linked Mesh2D from the selected closed spline. */
  const createMesh2DFromSpline = useCallback(() => {
    const source = scene.layers.find(layer => layer.id === selectedLayerId)
    if (source?.type !== 'spline' || !source.spline) return
    try {
      const mesh = newSplineBoundaryMesh2DLayer(source)
      dispatchCommand(makeAddLayerCmd(mesh))
      selectLayer(mesh.id)
      toast.success(`Created "${mesh.name}" — source spline was preserved`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Spline could not be converted to Mesh2D')
    }
  }, [scene.layers, selectedLayerId, dispatchCommand, selectLayer])

  /** Create a separate, source-linked Mesh2D from a supported closed shape. */
  const createMesh2DFromShape = useCallback(() => {
    const source = scene.layers.find(layer => layer.id === selectedLayerId)
    if (!source || !canCreateShapeBoundaryMesh2D(source)) return
    try {
      const mesh = newShapeBoundaryMesh2DLayer(source)
      dispatchCommand(makeAddLayerCmd(mesh))
      selectLayer(mesh.id)
      toast.success(`Created "${mesh.name}" — source shape was preserved`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Shape could not be converted to Mesh2D')
    }
  }, [scene.layers, selectedLayerId, dispatchCommand, selectLayer])

  /**
   * BL-67 — Assign a path layer as another layer's motion path.
   *
   * Seeds two keyframes on `followPath.progress` (0 at startMs → 1 at endMs)
   * so the motion plays back AND shows up as an editable curve on the
   * timeline. Users can drag the keyframes, change easing, or delete them
   * to keep the layer static at a single progress value.
   *
   * The whole binding + both keyframes collapse to a single undo entry.
   */
  const assignMotionPathToLayer = useCallback((
    targetLayerId: string,
    pathLayerId: string,
  ) => {
    const target = scene.layers.find((l) => l.id === targetLayerId)
    if (!target) return
    const tl = scene.timelines[0]
    if (!tl) return
    const startMs = target.startMs ?? 0
    const endMs   = target.endMs   ?? tl.durationMs
    const prev = target
    const next: Layer = {
      ...target,
      followPath: {
        ...target.followPath,
        pathLayerId,
        progress: 0,
      },
    }
    const trackTarget = `layers.${targetLayerId}.followPath.progress`
    const cmdLayer = makeUpdateLayerCmd(targetLayerId, next, prev)
    const cmdKf0   = makeAddKfCmd(tl.id, trackTarget, {
      id: nextKfId(), timeMs: startMs, value: 0, easing: { type: 'linear' },
    })
    const cmdKf1   = makeAddKfCmd(tl.id, trackTarget, {
      id: nextKfId(), timeMs: endMs,   value: 1, easing: { type: 'linear' },
    })
    dispatchCommand({
      label: 'Assign Motion Path',
      execute: (s) => cmdKf1.execute(cmdKf0.execute(cmdLayer.execute(s))),
      undo:    (s) => cmdLayer.undo(cmdKf0.undo(cmdKf1.undo(s))),
    })
  }, [scene.layers, scene.timelines, dispatchCommand])

  // ── Media import — routed through the universal pipeline (BL-05/BL-10) ─────
  // Image/Video/Audio handlers probe dimensions + duration, create an asset
  // (with storage/metadata) + a layer, and commit as one atomic undo step.
  // The asset cache hook revokes blob URLs when assets leave the scene.
  const addImageLayerFromFile = useCallback((file: File) => { void importAnyFile(file) }, [importAnyFile])
  const addVideoLayerFromFile = useCallback((file: File) => { void importAnyFile(file) }, [importAnyFile])
  const addAudioLayerFromFile = useCallback((file: File) => { void importAnyFile(file) }, [importAnyFile])

  // ── SVG Import — routed through the universal import pipeline (BL-06) ──────
  // SvgDocumentHandler wraps the same SvgImporter as before, but now also
  // registers an SVG asset in the library and wraps everything in one atomic
  // undo step. Reporting + toasts are handled inside useImport.
  const importSvgFile = useCallback(async (file: File) => {
    await importAnyFile(file)
  }, [importAnyFile])

  /** Right-click Add uses the same creation tool and guarded media import as Layers. */
  const addContextItem = useCallback((kind: string, origin?: { x: number; y: number }) => {
    if (kind === 'empty3dScene') { addLayer(kind, origin); return }
    activateAddLayerItem(kind, { onAdd: kind => addLayer(kind, origin), getDocumentSignal: editor.getDocumentSignal,
      onAddImage: addImageLayerFromFile, onAddVideo: addVideoLayerFromFile, onAddAudio: addAudioLayerFromFile,
      onImportSvg: importSvgFile, onImportModel: file => { void importAnyFile(file) } })
  }, [addLayer, editor.getDocumentSignal, addImageLayerFromFile, addVideoLayerFromFile, addAudioLayerFromFile, importSvgFile, importAnyFile])

  /** All selection surfaces delete one explicit forest in a single Undo step.
   * Resolve against committed source, never a stale row/primary-only closure. */
  const deleteLayers = useCallback((ids: readonly string[]) => {
    if (editor.isTransactionActive()) return
    const current = editor.getScene(), requested = new Set(ids)
    const roots = current.layers.filter(layer => requested.has(layer.id) && !(layer.type === 'audio' && layer.locked))
    if (!roots.length) return
    dispatchCommand(makeDeleteLayersCmd(roots.map(layer => layer.id), `Delete ${roots.length} layer${roots.length === 1 ? '' : 's'}`))
    const valid = new Set(editor.getScene().layers.map(item => item.id))
    setLayerSelection(previous => retainLayerSelection(previous, valid))
  }, [dispatchCommand, editor.getScene, editor.isTransactionActive])
  const deleteLayer = useCallback((id: string) => deleteLayers([id]), [deleteLayers])

  /** Deletes the current layer selection as one atomic command. Selected
   * descendants are folded into their selected ancestor so nested content is
   * removed once and one undo restores the complete prior scene. */
  const deleteSelectedLayers = useCallback(() => {
    const ids = Array.from(selectedLayerIds.size ? selectedLayerIds : selectedLayerId ? [selectedLayerId] : [])
    if (ids.length === 0) return
    const selected = new Set(ids)
    const roots = scene.layers.filter(layer => selected.has(layer.id)
      && (!layer.parentId || !selected.has(layer.parentId)))
    if (roots.length === 0) return
    dispatchCommand(makeBatchCmd(`Delete ${ids.length} layer${ids.length === 1 ? '' : 's'}`,
      roots.map(layer => makeDeleteLayerCmd(layer))))
    setLayerSelection(createLayerSelection([]))
  }, [scene.layers, selectedLayerIds, selectedLayerId, dispatchCommand])

  // Which panel last received a pointer-down. Lets the global Delete shortcut
  // act in-context: in the timeline it strips the layer's animation, elsewhere
  // (canvas / layer list) it deletes the layer itself.
  const activePanelRef = useRef<EditorPanel>('canvas')
  useEffect(() => {
    const updatePanel = (e: Event) => {
      const panel = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-panel]')?.dataset.panel
      activePanelRef.current = panelFromAttribute(panel, activePanelRef.current)
    }
    document.addEventListener('pointerdown', updatePanel, true)
    document.addEventListener('focusin', updatePanel, true)
    return () => {
      document.removeEventListener('pointerdown', updatePanel, true)
      document.removeEventListener('focusin', updatePanel, true)
    }
  }, [])

  // Maps the last-focused panel to a shortcut context so the same key can do
  // different things in the canvas vs the timeline (e.g. S = Solo selection on the
  // canvas, Show Scale track in the timeline). Stable identity (reads a ref).
  const getShortcutContext = useCallback(
    (): ShortcutContext => shortcutContextForPanel(activePanelRef.current),
    [],
  )

  // Remove every track of a layer on the selected timeline WITHOUT deleting the
  // layer — the timeline-focused Delete behaviour ("clear animation, keep the
  // object"). Single undo step.
  const deleteLayerAnimation = useCallback((layerId: string) => {
    const tl = scene.timelines.find((t) => t.id === selectedTlId)
    if (!tl) return
    const removed = tl.tracks.filter((t) => t.target.startsWith(`layers.${layerId}.`))
    if (removed.length === 0) return
    const removedTargets = new Set(removed.map((t) => t.target))
    dispatchCommand({
      label: 'Delete Layer Animation',
      execute: (s) => ({
        ...s,
        timelines: s.timelines.map((t) =>
          t.id !== selectedTlId ? t
            : { ...t, tracks: t.tracks.filter((tr) => !removedTargets.has(tr.target)) }),
      }),
      undo: (s) => ({
        ...s,
        timelines: s.timelines.map((t) =>
          t.id !== selectedTlId ? t : { ...t, tracks: [...t.tracks, ...removed] }),
      }),
    })
  }, [scene.timelines, selectedTlId, dispatchCommand])

  const toggleLayerFlag = useCallback((id: string, field: 'locked' | 'hidden' | 'solo' | 'pinned') => {
    if (field === 'solo') {
      const ids = selectedLayerIds.has(id) ? selectedLayerIds : [id]
      const command = makeSelectionSoloCmd(editor.getScene(), ids)
      if (command) dispatchCommand(command)
      return
    }
    dispatchCommand(makeToggleLayerCmd(id, field))
  }, [dispatchCommand, editor.getScene, selectedLayerIds])

  const reorderLayer = useCallback((from: number, to: number) => {
    if (from === to) return
    const layer = scene.layers[from]
    if (!layer) return
    dispatchCommand(makeMoveLayerCmd(layer.id, from, to))
  }, [scene.layers, dispatchCommand])

  // ── Drag-drop hierarchy ops (LayerPanel) ─────────────────────────────────
  // Drop ABOVE / BELOW a row reorders within the same parent (or moves to
  // root). Drop INTO a row groups the dragged layer with the target — if
  // the target is already a group, the dragged layer becomes its child; if
  // it's a leaf, both are wrapped in a fresh group.
  const moveLayerInTree = useCallback((
    draggedId:   string,
    newParentId: string | undefined,
    toIndex:     number,
  ) => {
    try {
      const command = makeMoveLayerInTreeCmd(editor.getScene(), draggedId, newParentId, toIndex)
      if (command) dispatchCommand(command)
    } catch (error) { toast.error('Cannot move layer', { detail: (error as Error).message }) }
  }, [editor.getScene, dispatchCommand])

  const groupLayersByDrop = useCallback(async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    const target = scene.layers.find(l => l.id === targetId)
    if (!target) return

    if (target.type === 'group') {
      // Drop INTO an existing group → just re-parent the dragged layer as
      // a child of that group. Insert at the top of the group (front of
      // render order for its siblings).
      const targetIdx = scene.layers.findIndex(l => l.id === targetId)
      // Find the index AFTER the group header and BEFORE its first child
      // (so the dragged layer renders on top of existing group members).
      const insertAt = targetIdx + 1
      moveLayerInTree(draggedId, target.id, insertAt)
      return
    }

    // Identity grouping preserves sibling animation; other parents need conversion.
    try {
      const command = makeGroupSiblingLayersCmd(editor.getScene(), [draggedId, targetId], { timeMs: currentTimeMs, overrides: frame.overrides })
      if (command) { dispatchCommand(command); selectLayer(command.groupId) }
    } catch (error) { toast.error('Cannot group layers', { detail: (error as Error).message }) }
  }, [scene.layers, editor.getScene, dispatchCommand, moveLayerInTree, selectLayer, currentTimeMs, frame.overrides])

  /**
   * Stagger: apply the same preset to every selected layer, offsetting each
   * subsequent layer's start time by `stepMs`. Preserves the order in which
   * the layers appear in the scene (back→front).
   */
  const applyStaggeredPreset = useCallback((presetId: string, stepMs = 80) => {
    const preset = ANIMATION_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const ordered = scene.layers.filter((l) => selectedLayerIds.has(l.id))
    if (ordered.length === 0) return
    ordered.forEach((layer, i) => {
      dispatchCommand(preset.apply({
        layer, timelineId: selectedTlId,
        startMs: currentTimeMs + i * stepMs,
      }))
    })
  }, [scene.layers, selectedLayerIds, selectedTlId, currentTimeMs, dispatchCommand])

  /** One editor entry point for Duplicate, quick clone and modal clone.
   * Commands resolve current source IDs, normalize selected roots and preserve
   * every relevant timeline. Selection updates only after a successful dispatch. */
  const duplicatePatternRef = useRef<{ x: number; y: number } | null>(null)
  const rememberDuplicatePattern = useCallback((offset: { x: number; y: number }) => {
    if (Number.isFinite(offset.x) && Number.isFinite(offset.y)
        && (Math.abs(offset.x) > 0.001 || Math.abs(offset.y) > 0.001)) {
      duplicatePatternRef.current = { x: offset.x, y: offset.y }
    }
  }, [])

  const cloneSourceIds = useCallback((sourceIds: readonly string[], params: {
    count?: number; offsetX?: number; offsetY?: number; duplicateAnimation?: boolean
    mode?: import('@/lib/clone/CloneTypes').CloneMode
  } = {}): boolean => {
    if (!sourceIds.length) return false
    try {
      const source = editor.getScene()
      const plan = prepareCloneForest(source, { sourceIds, count: params.count ?? 1,
        mode: params.mode ?? 'copy', duplicateAnimation: params.duplicateAnimation ?? true })
      const cmd = plan.atOffsets(Object.fromEntries(plan.sourceRootIds.map(id =>
        [id, { x: params.offsetX ?? 20, y: params.offsetY ?? 20 }])))
      dispatchCommand(cmd)
      replaceLayerSelection(cmd.result.suggestedSelection, cmd.result.suggestedSelection[0])
      if (cmd.diagnostics.length) toast.info('Clone completed', { detail: cmd.diagnostics.join(' ') })
      return true
    } catch (error) {
      toast.warning('Cannot clone selection', { detail: error instanceof Error ? error.message : String(error) })
      return false
    }
  }, [editor, dispatchCommand, replaceLayerSelection])
  const selectedCloneIds = useCallback(() => selectedLayerIds.size
    ? Array.from(selectedLayerIds) : selectedLayerId ? [selectedLayerId] : [], [selectedLayerIds, selectedLayerId])
  const duplicateSelectedLayer = useCallback(() => {
    const pattern = duplicatePatternRef.current ?? { x: 20, y: 20 }
    cloneSourceIds(selectedCloneIds(), { offsetX: pattern.x, offsetY: pattern.y })
  }, [cloneSourceIds, selectedCloneIds])

  // ── BL-59 — Clone & Array System ──────────────────────────────────────────
  //
  // Three entry points:
  //   • cloneQuick     — one new layer, default offset, no modal. Acts like
  //                       a richer "Duplicate" that also copies animation.
  //   • openCloneModal — opens CloneModal for count + offset + anim toggle.
  //   • openArrayModal — opens ArrayModal (Linear/Grid/Radial).
  //
  // Duplicate/Clone and Array preserve all relevant source timelines. The
  // active-timeline helper remains for the separate Clone & Align workflow.

  const getActiveTimeline = useCallback(() => {
    return scene.timelines.find((tl) => tl.id === selectedTlId) ?? null
  }, [scene.timelines, selectedTlId])

  const sourceHasAnimation = useCallback((source: Layer, allTimelines = false): boolean => {
    const ids = new LayerIndex(scene.layers).subtreeIds([source.id])
    const timelines = allTimelines ? scene.timelines : scene.timelines.filter(timeline => timeline.id === selectedTlId)
    return timelines.some(timeline => timeline.tracks.some(track =>
      Array.from(ids).some(id => targetsLayer(track.target, id))))
  }, [scene.layers, scene.timelines, selectedTlId])

  const cloneQuick = duplicateSelectedLayer

  const openCloneModal = useCallback(() => {
    if (!selectedLayerId) return
    const source = scene.layers.find((l) => l.id === selectedLayerId)
    if (!source) return
    setCloneModalSource(source)
    setCloneModalIds(selectedCloneIds())
    setCloneModalScene(editor.getScene())
  }, [selectedLayerId, scene.layers, selectedCloneIds, editor])

  /** All Array entry points open the same pinned multi-root editing session. */
  const openArrayModal = useCallback(() => {
    if (!arrayAuthoring.open()) return
    shapeCreation.close()
  }, [arrayAuthoring.open, shapeCreation.close])

  const handleCloneApply = useCallback((params: {
    count: number
    offsetX: number
    offsetY: number
    duplicateAnimation: boolean
    mode: import('@/lib/clone/CloneTypes').CloneMode
  }) => {
    if (!cloneModalSource) return false
    const current = editor.getScene().layers.find(layer => layer.id === cloneModalSource.id)
    if (current !== cloneModalSource || editor.getScene() !== cloneModalScene) {
      toast.warning('Clone source changed', { detail: 'Close the dialog and open it again against the current scene.' })
      return false
    }
    return cloneSourceIds(cloneModalIds, params)
  }, [cloneModalSource, cloneModalIds, cloneModalScene, editor, cloneSourceIds])

  // ── In-memory layer clipboard (cut / copy / paste from right-click menu) ──
  // Held in a ref because the clipboard is editor-state, not view-state — no
  // re-render needed when it changes (the menu reads from `clipboardLayersRef`
  // on the same render cycle when it's opened).
  const clipboardLayersRef = useRef<Layer[]>([])
  const [hasClipboard, setHasClipboard]   = useState(false)

  const copySelectedLayers = useCallback(() => {
    const ids = selectedLayerIds.size > 0
      ? Array.from(selectedLayerIds)
      : (selectedLayerId ? [selectedLayerId] : [])
    if (ids.length === 0) return
    // Deep clone via cloneLayerForDuplicate so paste produces fresh IDs each time.
    clipboardLayersRef.current = ids
      .map((id) => scene.layers.find((l) => l.id === id))
      .filter((l): l is Layer => !!l)
    setHasClipboard(clipboardLayersRef.current.length > 0)
  }, [scene.layers, selectedLayerIds, selectedLayerId])

  const cutSelectedLayers = useCallback(() => {
    copySelectedLayers()
    const ids = selectedLayerIds.size > 0
      ? Array.from(selectedLayerIds)
      : (selectedLayerId ? [selectedLayerId] : [])
    deleteLayers(ids)
  }, [copySelectedLayers, selectedLayerIds, selectedLayerId, deleteLayers])

  const pasteLayers = useCallback(() => {
    const src = clipboardLayersRef.current
    if (src.length === 0) return
    let lastId: string | null = null
    for (const orig of src) {
      const next = cloneLayerForDuplicate(orig)
      next.transform = { ...next.transform, x: next.transform.x + 20, y: next.transform.y + 20 }
      dispatchCommand(makeDuplicateLayerCmd(orig, next))
      lastId = next.id
    }
    if (lastId) selectLayer(lastId)
  }, [dispatchCommand, selectLayer])

  // ── Align selected layers to the shared bounding box edge ─────────────────
  // Updates every selected layer in a single dispatch via composite command so
  // undo restores all positions in one step. Anchor offset isn't touched —
  // only `transform.x` / `transform.y` so already-animated rigs keep working.
  const alignSelected = useCallback((edge:
    'left' | 'centerX' | 'right' | 'top' | 'middle' | 'bottom',
  ) => {
    const ids = selectedLayerIds.size > 1
      ? Array.from(selectedLayerIds)
      : []
    if (ids.length < 2) return
    const targets = ids
      .map((id) => scene.layers.find((l) => l.id === id))
      .filter((l): l is Layer => !!l)
    // Pre-compute each layer's bounding box (top-left in scene coords).
    const boxes = targets.map((l) => {
      const w = l.size?.width  ?? (l.text?.fontSize ? 120 : 80)
      const h = l.size?.height ?? (l.text?.fontSize ?? 24)
      return { l, x: l.transform.x, y: l.transform.y, w, h }
    })
    const minX = Math.min(...boxes.map((b) => b.x))
    const maxX = Math.max(...boxes.map((b) => b.x + b.w))
    const minY = Math.min(...boxes.map((b) => b.y))
    const maxY = Math.max(...boxes.map((b) => b.y + b.h))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    // Dispatch one command per layer — history's batch system collapses them
    // into a single undo group already; doing this in a tight loop keeps the
    // code small without growing the command surface.
    for (const b of boxes) {
      const nx =
        edge === 'left'    ? minX           :
        edge === 'right'   ? maxX - b.w     :
        edge === 'centerX' ? cx - b.w / 2   : b.x
      const ny =
        edge === 'top'     ? minY           :
        edge === 'bottom'  ? maxY - b.h     :
        edge === 'middle'  ? cy - b.h / 2   : b.y
      if (nx === b.x && ny === b.y) continue
      const next = { ...b.l, transform: { ...b.l.transform, x: nx, y: ny } }
      dispatchCommand(makeUpdateLayerCmd(b.l.id, next, b.l))
    }
  }, [scene.layers, selectedLayerIds, dispatchCommand])

  // Auto-key dispatch helper (BL-41). Returns true if the mode is currently
  // effective. Two modes write keyframes:
  //   • autoKeyMode === 'auto'   → always (paused or playing)
  //   • autoKeyMode === 'record' → only WHEN PLAYBACK IS RUNNING
  //     (mimics 3ds Max / Maya record mode — live performance capture).
  // Manual mode never auto-writes; user must press K or use ◆ buttons.
  const isAutoKeyActive = useCallback((): boolean => {
    const mode = timelineSettings.autoKeyMode
      ?? (timelineSettings.autoKeyframe ? 'auto' : 'manual')
    if (mode === 'auto')   return true
    if (mode === 'record') return isPlaying
    return false
  }, [timelineSettings.autoKeyMode, timelineSettings.autoKeyframe, isPlaying])

  // Snapshot any animatable properties that changed between prev → next.
  // Called after a Layer property mutation when auto-key is active.
  const autoKeyChangedProps = useCallback((prev: Layer, next: Layer) => {
    if (!selectedTlId) return
    const candidates: string[] = [
      'opacity',
      'transform.x', 'transform.y',
      'transform.scaleX', 'transform.scaleY',
      'transform.rotationDeg',
      'text.fontSize', 'text.letterSpacing', 'text.lineHeight',
    ]
    const changed = candidates.filter((p) => {
      const a = readNumber(prev, p), b = readNumber(next, p)
      return a !== b && typeof b === 'number'
    })
    if (changed.length === 0) return

    // Auto/REC mode keys every changed property. Manual mode keys ONLY the
    // properties that already have a keyframe: a keyframed value is what the
    // canvas renders, so without re-keying it the layer snaps back to its
    // keyframed position on mouse-up. Properties with no track stay a plain
    // base-value edit — manual mode still never CREATES new keyframes.
    let toKey = changed
    if (!isAutoKeyActive()) {
      const tl = scene.timelines.find((t) => t.id === selectedTlId)
      if (!tl) return
      toKey = changed.filter((p) =>
        tl.tracks.some((t) => t.target === `layers.${next.id}.${p}` && t.keyframes.length > 0),
      )
    }
    if (toKey.length === 0) return
    dispatchCommand(makeKeyframeLayerSnapshotCmd(selectedTlId, next, timelineAuthoring.localTimeMs, toKey))
  }, [selectedTlId, timelineAuthoring.localTimeMs, dispatchCommand, isAutoKeyActive, scene.timelines])

  /** Compose viewport keys with its source-layer commands in one transaction.
   * Read the synchronous current scene so a fast final pointer sample never
   * keys a stale React render; unchanged animated channels remain untouched. */
  const viewportKeyCommands = useCallback((changes: readonly ViewportLayerChange[]) =>
    buildViewportKeyframeCommands(editor.getScene(), changes, {
      timelineId: selectedTlId, timeMs: timelineAuthoring.localTimeMs, autoKeyframe: isAutoKeyActive(),
    }), [editor.getScene, selectedTlId, timelineAuthoring.localTimeMs, isAutoKeyActive])

  const updateLayer = useCallback((next: Layer) => {
    const prev = scene.layers.find((l) => l.id === next.id)
    if (!prev) return
    dispatchCommand(makeUpdateLayerCmd(next.id, next, prev))
    autoKeyChangedProps(prev, next)
  }, [scene.layers, dispatchCommand, autoKeyChangedProps])

  /** Inline-rename a layer (LayerPanel double-click). Single undo step. */
  const renameLayer = useCallback((id: string, name: string) => {
    const prev = scene.layers.find((l) => l.id === id)
    if (!prev || prev.name === name) return
    dispatchCommand(makeUpdateLayerCmd(id, { ...prev, name }, prev))
  }, [scene.layers, dispatchCommand])

  // ── Quick-keyframe selected layers' chosen properties at the playhead ────
  // Used by the canvas right-click "Animate ▶" submenu — snapshots the
  // current value of one property into a fresh keyframe on the active
  // timeline. If no timeline exists yet, this is a no-op.
  const keyframeSelectedLayers = useCallback((properties: string[]) => timelineAuthoring.setKey(properties), [timelineAuthoring.setKey])

  // ── Group / Ungroup (Cmd+G / Cmd+Shift+G) ────────────────────────────────
  /** Group the explicit context-menu scope without waiting for a selection
   * render; the created group becomes the only selected layer atomically. */
  const groupLayers = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      const command = makeGroupSiblingLayersCmd(editor.getScene(), ids, { timeMs: currentTimeMs, overrides: frame.overrides })
      if (command) { dispatchCommand(command); selectLayer(command.groupId) }
    } catch (error) { toast.error('Cannot group layers', { detail: (error as Error).message }) }
  }, [editor.getScene, dispatchCommand, selectLayer, currentTimeMs, frame.overrides])
  const groupSelected = useCallback(() => groupLayers(selectedLayerIds.size > 0
    ? Array.from(selectedLayerIds) : selectedLayerId ? [selectedLayerId] : []),
  [selectedLayerIds, selectedLayerId, groupLayers])

  // BL-67 — Motion path pick mode. When non-null, the next click on a
  // dashed path overlay assigns that path as the target layer's followPath
  // and auto-creates a progress 0→1 animation.
  const [pathPickMode, setPathPickMode] = useState<{ targetLayerId: string } | null>(null)

  // Escape leaves pick mode.
  useEffect(() => {
    if (!pathPickMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPathPickMode(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pathPickMode])

  // BL-66 — Pen Tool keyboard handling
  //   • Enter         → finish drawing (keep open path, switch back to select)
  //   • Escape        → cancel drawing: delete the in-progress path layer if it
  //                     has < 2 anchors, otherwise just exit pen mode
  useEffect(() => {
    if (toolMode !== 'pen') return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key !== 'Enter' && e.key !== 'Escape') return
      e.preventDefault()
      const sel = scene.layers.find(l => l.id === selectedLayerId)
      if (e.key === 'Escape' && sel?.type === 'path' && (sel.path?.anchors.length ?? 0) < 2) {
        dispatchCommand(makeDeleteLayerCmd(sel))
        selectLayer(null)
      }
      setToolMode('select')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toolMode, scene.layers, selectedLayerId, dispatchCommand, selectLayer])
  // BL-60 Faz 3 — canvas selection containment mode (only matters with a
  // selection tool active). Default 'touching' = Figma-style permissive.
  const [selectionContainMode, setSelectionContainMode] = useState<SelectionContainMode>('touching')

  // ── Shared viewport precision settings; the main Snap menu owns the UI. ──
  const snap = useSnapSettings()

  // ── Manual preview-mode toggle (so user can test draggable / tappable
  //    layers without setting up segments / clicking the Preview tab) ──────
  // BL-80 — raster image export dialog visibility.
  const [showRasterExport, setShowRasterExport] = useState(false)
  // BL-84 — SVG (vector) export dialog visibility.
  const [showSvgExport, setShowSvgExport] = useState(false)
  // BL-83 — image sequence (ZIP) export dialog visibility.
  const [showSequenceExport, setShowSequenceExport] = useState(false)
  const [showRenderSettings, setShowRenderSettings] = useState(false)

  // ── Scene JSON helpers (used by FileMenu) ────────────────────────────────
  const {saveSceneJson,copySceneJson,exportSceneHtml,exportRuntimeJson}=useSceneOutputActions(editor.committedScene,importDocument,editor.getCommittedHistory)

  const openSceneJson = useCallback(() => {
    openDocumentFilePicker({ accept: '.json,application/json', getDocumentSignal: editor.getDocumentSignal,
      onFiles: files => { void openSceneFile(files[0], parsed => {
        const project = readSessionProject(parsed)
        sessionIdentity.adopt(project.sessionId ?? crypto.randomUUID())
        editor.resetHistory(project.history)
        selectLayer(null)
        handleSeek(0)
        setSelectedTl(parsed.timelines[0]?.id ?? '')
        welcome.close()
        toast.success(`Loaded scene from ${files[0].name}`)
      }, error => welcome.setError(`Could not open project: ${error.message}`)) } })
  }, [editor.getDocumentSignal, openSceneFile, editor.resetHistory, sessionIdentity.adopt, selectLayer, handleSeek, welcome.close, welcome.setError])

  const newScene = useCallback((settings?: WelcomeProjectSettings): boolean => {
    if ((editor.getRevision() > 0 || session.restored) && !confirm('Start a new project? This replaces the current workspace. Save Scene JSON if you want to keep a separate copy.')) return false
    const next = settings ? createWelcomeProject(settings) : emptyScene()
    sessionIdentity.adopt(crypto.randomUUID())
    resetScene(next)
    selectLayer(null)
    handleSeek(0)
    setSelectedTl(next.timelines[0]?.id ?? '')
    welcome.close()
    return true
  }, [editor.getRevision, resetScene, selectLayer, handleSeek, welcome.close, session.restored, sessionIdentity.adopt])

  /** Resolve the explicit right-click target after loading the command. Never
   * depend on a selection update having committed or use a stale document. */
  const ungroupLayer = useCallback(async (id: string) => {
    const document = editor.getDocumentSignal()
    const { makeUngroupCmd } = await import('@/lib/editor/commands-group')
    if (document.aborted || editor.getDocumentSignal() !== document || editor.isTransactionActive()) return
    const current = editor.getScene()
    if (current.layers.find(layer => layer.id === id)?.type !== 'group') return
    const cmd = makeUngroupCmd(current, id)
    if (cmd) dispatchCommand(cmd)
  }, [editor.getDocumentSignal, editor.getScene, editor.isTransactionActive, dispatchCommand])
  const ungroupSelected = useCallback(() => { if (selectedLayerId) void ungroupLayer(selectedLayerId) }, [selectedLayerId, ungroupLayer])

  const updateComposition = useCallback((comp: typeof scene.composition) => {
    dispatchCommand(makeUpdateCompositionCmd(comp, { timelineId: selectedTlId || null }))
  }, [selectedTlId, dispatchCommand])

  // ── Keyframe clipboard (Cmd+C / Cmd+V) ──────────────────────────────────
  const clipboard = useKeyframeClipboard({
    scene, selectedKfIds, selectedTimelineId: selectedTlId,
    currentTimeMs: timelineAuthoring.localTimeMs, dispatchCommand,
    collisionPolicy: timelineAuthoring.collisionPolicy,
    onError: message => toast.warning('Paste cancelled', { detail: message }),
  })

  // ── BL-56 Timeline Ghost / Onion-Skin (page-level state so SceneCanvas
  //    and TimelinePanel both read from the same source of truth) ─────────
  const {
    ghostSettings,
    updateGhostSettings,
    toggleGhost,
    applyPreset: applyGhostPreset,
  } = useTimelineGhost()
  const selectedTimelineForGhost = useMemo(
    () => scene.timelines.find((t) => t.id === selectedTlId) ?? null,
    [scene.timelines, selectedTlId],
  )

  // ── Bulk delete selected keyframes (single undo step) ───────────────────
  const deleteSelectedKeyframes = useCallback(() => {
    const items: KfDeletion[] = selectedKeyframes
    if (items.length === 0) return false
    dispatchCommand(makeBulkDeleteKfCmd(items))
    setSelectedKfIds(new Set())
    return true
  }, [selectedKeyframes, dispatchCommand])

  // ── Timeline property shortcuts (After Effects-style P/S/R/T + Alt+key) ───
  // Each "property" maps to the transform sub-paths it keys together: position
  // = x+y, scale = scaleX+scaleY, rotation = rotationDeg, opacity = opacity.
  const TIMELINE_PROP_PATHS: Record<TimelineProperty, string[]> = useMemo(() => ({
    position: ['transform.x', 'transform.y'],
    scale:    ['transform.scaleX', 'transform.scaleY'],
    rotation: ['transform.rotationDeg'],
    opacity:  ['opacity'],
  }), [])

  // Alt+P/S/R/T — add a keyframe for the property at the playhead, or remove it
  // if one already sits there (toggle). Mirrors AE's keyframe-stopwatch click.
  const toggleTimelineKeyframe = useCallback((prop: TimelineProperty) => {
    const source = editor.getScene(), active = source.timelines.find(item => item.id === selectedTlId)
    if (!active || editor.isTransactionActive()) return
    const ids = selectedLayerIds.size ? Array.from(selectedLayerIds) : selectedLayerId ? [selectedLayerId] : []
    const paths = TIMELINE_PROP_PATHS[prop], at = timelineAuthoring.localTimeMs
    const existing: KfDeletion[] = []
    for (const id of ids) for (const path of paths) {
      const target = `layers.${id}.${path}`, keys = active.tracks.find(track => track.target === target)?.keyframes
      const key = keys?.find(item => sameKeyTime(item.timeMs, at))
      if (key) existing.push({ timelineId: active.id, target, kf: key })
    }
    if (ids.length && existing.length === ids.length * paths.length) dispatchCommand(makeBulkDeleteKfCmd(existing))
    else timelineAuthoring.setKey(paths)
  }, [editor.getScene, editor.isTransactionActive, selectedTlId, selectedLayerIds, selectedLayerId, timelineAuthoring.localTimeMs, timelineAuthoring.setKey, dispatchCommand, TIMELINE_PROP_PATHS])

  // P/S/R/T/U — reveal a property in the timeline (filters track rows to that
  // property; 'all' shows only animated tracks). The nonce makes each press
  // distinct so the TimelinePanel effect re-fires (and toggles) every time.
  const [revealProperty, setRevealProperty] =
    useState<{ prop: TimelineProperty | 'all'; nonce: number } | null>(null)
  const revealTimelineProperty = useCallback((prop: TimelineProperty | 'all') => {
    setRevealProperty((prev) => ({ prop, nonce: (prev?.nonce ?? 0) + 1 }))
  }, [])

  // Central transport uses the selected branches on the active timeline.
  const seekToKeyframe = useCallback((direction: 'prev' | 'next') => timelineAuthoring.navigate(direction === 'prev' ? 'previousKey' : 'nextKey'), [timelineAuthoring.navigate])

  /** Move the complete selected root set in composition pixels. The same
   * source/key command as pointer authoring preserves displayed pose and emits
   * one undo. Read-only playback/preview and active drag own their input. */
  const nudgeSelected = useCallback((dx: number, dy: number) => {
    if (motionKeyEditing || isPlaying || manualPreview || runtime.segmentState || editor.isTransactionActive()) return
    const ids = selectedLayerIds.size ? selectedLayerIds : new Set(selectedLayerId ? [selectedLayerId] : [])
    try {
      const command = buildViewportNudgeCommand(editor.getScene(), ids, { x: dx, y: dy }, {
        timelineId: selectedTlId, timeMs: timelineAuthoring.localTimeMs, autoKeyframe: isAutoKeyActive(), overrides: frame.overrides,
      })
      if (command) dispatchCommand(command)
    } catch (error) {
      toast.warning('Cannot move selection', { detail: error instanceof Error ? error.message : String(error) })
    }
  }, [motionKeyEditing, isPlaying, manualPreview, runtime.segmentState, editor.isTransactionActive, editor.getScene,
    selectedLayerIds, selectedLayerId, selectedTlId, timelineAuthoring.localTimeMs, isAutoKeyActive, frame.overrides, dispatchCommand])

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useKeyboard({
    enabled: !detail.session && displayAvailable,
    isTransactionActive: editor.isTransactionActive,
    onSetKey: () => timelineAuthoring.setKey(),
    onTimelineNavigate: timelineAuthoring.navigate,
    onUndo: undo,
    onRedo: redo,
    onPlayToggle: handlePlayToggle,
    onStepBack:    (frames) => handleSeek(Math.max(0, currentTimeMs - (frames * 1000) / frameRate)),
    onStepForward: (frames) => handleSeek(Math.min(maxDuration, currentTimeMs + (frames * 1000) / frameRate)),
    onNudgeSelected: nudgeSelected,
    onGeometryEditMode: enterGeometryEditLevel,
    onClearSelection: () => {
      // An armed/active authoring tool consumes the first Escape itself.
      if (shapeCreation.kind || toolMode === 'pen' || toolMode === 'spline-draw' || pathPickMode || motionKeyEditing || arrayAuthoring.active || fullscreenCanvas) return
      selectLayer(null); setSelectedKfIds(new Set())
    },
    onDeleteSelected: () => {
      if (motionKeyEditing && activePanelRef.current === 'canvas') return
      if (selectedLayer?.type === 'audio' && selectedLayer.locked) return
      const target = deletionTargetForPanel(activePanelRef.current, selectedKeyframes.length > 0, !!selectedLayerId, selectedLayer?.type)
      if (target === 'keyframes') deleteSelectedKeyframes()
      else if (target === 'animation' && selectedLayerId) deleteLayerAnimation(selectedLayerId)
      else if (target === 'layer') deleteLayers(Array.from(selectedLayerIds.size ? selectedLayerIds : selectedLayerId ? [selectedLayerId] : []))
    },
    onDuplicateSelected: duplicateSelectedLayer,
    onSoloSelected: () => {
      const ids = selectedLayerIds.size ? selectedLayerIds : selectedLayerId ? [selectedLayerId] : []
      const command = makeSelectionSoloCmd(editor.getScene(), ids)
      if (command) dispatchCommand(command)
    },
    onCopy:  () => clipboard.copySelected(),
    onPaste: () => {
      const pastedIds = clipboard.pasteAtPlayhead()
      if (pastedIds.size > 0) setSelectedKfIds(pastedIds)
    },
    onShowHelp: () => setShowHelp(true),
    onGroupSelected:   groupSelected,
    onUngroupSelected: ungroupSelected,
    // BL-59 — Clone & Array shortcuts
    onCloneQuick:      cloneQuick,
    onOpenArrayModal:  openArrayModal,
    onToolChange:      changeToolMode,
    onTimelineToggleKeyframe: toggleTimelineKeyframe,
    onTimelinePrevKeyframe:   () => seekToKeyframe('prev'),
    onTimelineNextKeyframe:   () => seekToKeyframe('next'),
    onTimelineShowProperty:   revealTimelineProperty,
    getContext:        getShortcutContext,
    frameRate,
  })

  // ── Lightweight panel registry (just id/title) for FileMenu ────────────────
  // FileMenu only reads id+title for its "restore hidden panel" submenu, but
  // its prop type is the full PanelRegistry (Map<string, PanelDefinition>),
  // so we provide a placeholder render so the type checks.
  const panelRegistry = useMemo<PanelRegistry>(() => {
    const defs: PanelDefinition[] = [
      { id: 'layers',         title: 'Layers',         render: () => null },
      { id: 'sceneExplorer',  title: 'Scene Explorer', render: () => null },
      { id: 'canvas',         title: 'Canvas',         render: () => null },
      { id: 'stateMachine',   title: 'State Machine',  render: () => null },
      { id: 'properties',     title: 'Properties',     render: () => null },
      { id: 'geometryEdit', title: 'Edit', render: () => null },
      { id: 'motionKeys', title: 'Motion Keys', render: () => null },
      { id: 'timeline',       title: 'Timeline',       render: () => null },
      { id: 'curveEditor',    title: 'Curve Editor',   render: () => null },
      { id: 'dopeSheet',      title: 'Dope Sheet',     render: () => null },
      { id: 'curveModifiers', title: 'Animation Modifiers', render: () => null },
      { id: 'parameters',     title: 'Parameters',     render: () => null },
      { id: 'events',         title: 'Events',         render: () => null },
      { id: 'motionBinding',  title: 'Bindings',       render: () => null },
      { id: 'wiring',         title: 'Wires',          render: () => null },
      { id: 'selection',      title: 'Select',         render: () => null },
      { id: 'runtimePreview', title: 'Preview',        render: () => null },
      { id: 'player',         title: 'Player',         render: () => null },
      { id: 'assets',         title: 'Assets',         render: () => null },
      { id: 'particles',      title: 'Particle',       render: () => null },
      { id: 'physicsSimulations', title: 'Physics',    render: () => null },
      { id: 'jobsBake',       title: 'Jobs & Bake',    render: () => null },
      { id: 'scriptConsole',  title: 'Script',         render: () => null },
      { id: 'resourceMonitor', title: 'Resources & Performance', render: () => null },
    ]
    return makeRegistry(defs)
  }, [])

  /** One File menu contract serves both editor headers. Scoped 3D drafts
   * expose Help until Apply publishes them to the main scene. */
  const fileMenuProps: Parameters<typeof FileMenu>[0] = {
    filename: scene.composition.id,
    onRename: next => updateComposition({ ...scene.composition, id: next }),
    onNewScene: newScene,
    onImportFile: openImportPicker,
    onImportUrl: () => setImportUrlDocument(editor.getDocumentSignal()),
    onImportClipboard: () => { void importAnyClipboard() },
    onImportSpriteSheet: openSpriteSheetPicker,
    onOpenSceneJson: openSceneJson,
    onSaveSceneJson: saveSceneJson,
    onExportRuntime: exportRuntimeJson,
    onExportImage: () => setShowRasterExport(true),
    onExportSvg: () => setShowSvgExport(true),
    onExportSequence: () => setShowSequenceExport(true),
    onRender: () => setShowRenderSettings(true),
    onExportHtml: exportSceneHtml,
    onCopySceneJson: copySceneJson,
    onShowShortcuts: () => setShowHelp(true),
    onShowReleaseNotes: releaseNotes.open,
    onShowWelcome: welcome.open,
    onShowResources: () => dock.dispatchRestorePanel('resourceMonitor'),
    onResetLayout: dock.resetLayout,
    panelRegistry,
    dockLayout: dock.layout,
    onRestorePanel: dock.dispatchRestorePanel,
  }
  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex min-w-0 flex-col h-dvh bg-gray-950 text-gray-200 overflow-hidden">

      <DiagnosticConsentPrompt visible={displayAvailable && releaseNotes.isReady && !welcome.isOpen && !releaseNotes.isOpen} />

      <ImportActivityBar activeCount={importActiveCount} settlingCount={importSettlingCount}
        label={importLabel} progress={importProgress} onCancel={cancelImports} />

      {/* ── Toolbar ────────────────────────────────────────────────── */}
      {detail.session?.animation ? <ModelDetailHeaderHost name={detail.session.layer.name} fileMenu={<FileMenu {...fileMenuProps} detailEditing />} /> : <header ref={detailHeaderRef} aria-hidden={detail.session ? true : undefined} data-panel="canvas" className="flex min-w-0 flex-nowrap items-center gap-2 px-3 py-2 border-b border-gray-700 bg-gray-900 shrink-0" data-testid="editor-toolbar">
        <FileMenu {...fileMenuProps} />

        <MCPConnection {...mcp} />
        <div className="w-px h-6 bg-gray-700 mx-1" />

        <ToolGroup
          mode={toolMode}
          transformSpace={transformSpace}
          onTransformSpaceChange={setTransformSpace}
          onChange={changeToolMode}
          onPanToggle={togglePan}
          selectionStyle={selectionStyle}
          onSelectionStyleChange={setSelectionStyle}
          penAuto={!!(scene.layers.find(l => l.id === selectedLayerId)?.type === 'path')}
          containMode={selectionContainMode}
          onContainModeChange={setSelectionContainMode}
        />

        <div className="w-px h-6 bg-gray-700 mx-1" />

        <span className="text-blue-400 text-base">🎬</span>
        <span className="font-semibold text-xs text-gray-100">Chorono</span>

        <button
          onClick={() => setShowCompModal(true)}
          title="Canvas size & framerate"
          className="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 font-mono"
        >
          {scene.composition.width}×{scene.composition.height}
        </button>

        {/* Undo / Redo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Cmd+Z)"
          className="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >↶</button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Cmd+Shift+Z)"
          className="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >↷</button>

        <span className="hidden 2xl:inline text-xs text-gray-500 font-mono ml-auto whitespace-nowrap">
          {scene.composition.width}×{scene.composition.height}
          {' · '}{scene.layers.length} layers
          {' · '}{scene.timelines.length} timelines
        </span>

        {/* File versioning: choose folder + auto-save + timestamped snapshots */}
        <div className="ml-auto shrink-0 2xl:ml-0"><LocalRecoveryStatus status={recovery} sessionId={sessionIdentity.id} history={editor.committedHistory} budget={editor.historyBudget} /></div>
        <ProjectMenu
          sessionInfo={{id:sessionIdentity.id,undo:editor.committedHistory.past.length,redo:editor.committedHistory.future.length}}
          mounted={fileVersioning.mounted}
          state={fileVersioning.state}
          directoryName={fileVersioning.directoryName}
          lastSavedAt={fileVersioning.lastSavedAt}
          snapshotCount={fileVersioning.snapshotCount}
          isSupported={fileVersioning.isSupported}
          onPickDirectory={fileVersioning.pickDirectory}
          onSaveSnapshot={fileVersioning.saveSnapshotNow}
          onSaveSceneJson={saveSceneJson}
          onCopySceneJson={copySceneJson}
          onInspectJson={() => setShowJson(true)}
          exports={{ onExportRuntime: exportRuntimeJson, onExportImage: () => setShowRasterExport(true),
            onExportSvg: () => setShowSvgExport(true),
            onExportSequence: () => setShowSequenceExport(true),
            onRender: () => setShowRenderSettings(true),
            onExportHtml: exportSceneHtml }}
        />

        <InteractivePreviewButton layers={scene.layers} active={manualPreview}
          onToggle={() => { if (!editor.isTransactionActive()) setManualPreview(value => !value) }} />
      </header>}

      {/* ── Dockable work area ─────────────────────────────────────── */}
      <DockDragProvider onDrop={dock.dispatchDrop}>
        <div ref={dockContainerRef} className="flex-1 min-h-0 relative">
          <div ref={detailBackgroundRef} className="h-full min-h-0" aria-hidden={detail.session ? true : undefined}
            style={{ visibility: detail.session ? 'hidden' : undefined }}>
          {!fullscreenCanvas && <DockOuterEdges containerRef={dockContainerRef} />}
          {(() => {
            const registry = makeRegistry([
              {
                id: 'layers', title: 'Layers',
                render: () => (
                  <LayerPanel layerScope={layerIsolation.contentScope}
                    layers={scene.layers}
                    selectedId={selectedLayerId}
                    selectedIds={selectedLayerIds}
                    onSelect={selectLayer}
                    onSelectLayers={replaceLayerSelection}
                    onIsolateSelection={() => layerIsolation.enter(Array.from(selectedLayerIds.size ? selectedLayerIds : selectedLayerId ? [selectedLayerId] : []))}
                    onExitIsolation={layerIsolation.exit} isolationActive={layerIsolation.active}
                    onEditContent={openItemDetail}
                    onSplineEditMode={enterSplineEditMode}
                    onEditOperation={id => booleanOwner(scene, id) ? editBooleanOperation(id) : undefined}
                    isBooleanMember={id => !!booleanOwner(scene, id)}
                    onIsolateLayers={layerIsolation.enter}
                    onAdd={addLayer}
                    activeAddKind={shapeCreation.kind}
                    getDocumentSignal={editor.getDocumentSignal}
                    onAddImage={addImageLayerFromFile}
                    onAddVideo={addVideoLayerFromFile}
                    onImportSvg={importSvgFile}
                    onImportModel={file => { void importAnyFile(file) }}
                    onAddAudio={addAudioLayerFromFile}
                    onDelete={deleteLayer}
                    onDeleteLayers={deleteLayers}
                    onReorder={reorderLayer}
                    onMoveInTree={moveLayerInTree}
                    onGroupWith={groupLayersByDrop}
                    onGroupSelected={groupSelected}
                    onUngroupLayer={ungroupLayer}
                    onToggleFlag={toggleLayerFlag}
                    onApplyStagger={applyStaggeredPreset}
                    onRename={renameLayer}
                    timelineLayerIds={selectedTimelineForGhost?.layerIds}
                    onToggleInTimeline={(layerId) => {
                      if (!selectedTlId) return
                      const tl = scene.timelines.find((t) => t.id === selectedTlId)
                      if (!tl || tl.layerIds === undefined) return
                      const cmd = tl.layerIds.includes(layerId)
                        ? makeRemoveLayerFromTimelineCmd(selectedTlId, layerId)
                        : makeAddLayerToTimelineCmd(selectedTlId, layerId)
                      dispatchCommand(cmd)
                    }}
                    onDuplicate={(layerId) => cloneSourceIds(selectedLayerIds.has(layerId) ? selectedCloneIds() : [layerId])}
                    onAgentHandoff={handleAgentHandoff}
                  />
                ),
              },
              {
                // BL-52 — Scene Explorer (column-aware successor to LayerPanel).
                // Kept side-by-side with LayerPanel so users can A/B during the
                // foundation phase. BL-58 will remove the old LayerPanel entry.
                id: 'sceneExplorer', title: 'Scene Explorer',
                render: () => (
                  <SceneExplorerPanel layerScope={layerIsolation.contentScope}
                    layers={scene.layers}
                    timeline={selectedTimelineForGhost}
                    selectedId={selectedLayerId}
                    selectedIds={selectedLayerIds}
                    onSelect={(id, shift, meta) => selectLayer(id, shift || meta)}
                    onSelectLayers={replaceLayerSelection}
                    onPickLayer={pickSplineToAttach}
                    onRename={renameLayer}
                    onToggleFlag={toggleLayerFlag}
                    onMoveInTree={moveLayerInTree}
                    onGroupWith={groupLayersByDrop}
                    onSetSubtreeFlag={(roots, field, value) => {
                      const command = makeSetSubtreeFlagCmd(editor.getScene(), roots, field, value)
                      if (command) dispatchCommand(command)
                    }}
                    onClearSelection={() => selectLayer(null)}
                    onAgentHandoff={handleAgentHandoff}
                    contextHandlers={{
                      addLayer: addContextItem,
                      editContent: openItemDetail,
                      splineEditMode: enterSplineEditMode,
                      editOperation: editBooleanOperation,
                      isBooleanMember: id => !!booleanOwner(scene, id),
                      // Rename re-uses the inline editor — selecting the
                      // layer first lets the panel know which row to put
                      // into edit mode (handled inside the panel via key).
                      rename: (id) => { selectLayer(id); /* panel's "rename" entry triggers F2-style edit in BL-58 polish */ },
                      duplicate: (id) => { cloneSourceIds(selectedLayerIds.has(id) ? selectedCloneIds() : [id]) },
                      duplicateLayers: cloneSourceIds,
                      deleteLayers,
                      groupLayers: (ids) => {
                        if (ids.length === 0) return
                        replaceLayerSelection(ids, ids[0])
                        void groupLayers(ids)
                      },
                      ungroupGroup: ungroupLayer,
                      setColorLabel: (ids, color) => {
                        dispatchCommand(makeBulkUpdateLayersCmd(ids, { colorLabel: color ?? undefined }, color ? 'Set color label' : 'Clear color label'))
                      },
                      bulkToggleFlag: (ids, field, nextValue) => {
                        if (field === 'solo') {
                          const command = makeSelectionSoloCmd(editor.getScene(), ids)
                          if (command) dispatchCommand(command)
                          return
                        }
                        dispatchCommand(makeBulkToggleFlagCmd(ids, field, nextValue))
                      },
                      isolate: (ids) => layerIsolation.enter(ids),
                      showAll: () => layerIsolation.active ? layerIsolation.exit() : dispatchCommand(makeShowAllLayersCmd()),
                    }}
                    onFreezeSelection={() => {
                      const ids = Array.from(selectedLayerIds.size > 0
                        ? selectedLayerIds
                        : selectedLayerId ? [selectedLayerId] : [])
                      if (ids.length > 0) dispatchCommand(makeBulkUpdateLayersCmd(ids, { frozen: true }, 'Freeze'))
                    }}
                    onUnfreezeSelection={() => {
                      const ids = Array.from(selectedLayerIds.size > 0
                        ? selectedLayerIds
                        : selectedLayerId ? [selectedLayerId] : [])
                      if (ids.length > 0) dispatchCommand(makeBulkUpdateLayersCmd(ids, { frozen: false }, 'Unfreeze'))
                    }}
                    isLayerAnimated={(layer) => {
                      const tl = selectedTimelineForGhost
                      if (!tl) return false
                      const prefix = `layers.${layer.id}.`
                      return tl.tracks.some((t) => t.target.startsWith(prefix) && t.keyframes.length > 0)
                    }}
                    doesLayerHaveEffects={(layer) =>
                      (layer.effectsChain?.length ?? 0) > 0 || (layer.masks?.length ?? 0) > 0
                    }
                  />
                ),
              },
              {
                id: 'canvas', title: 'Canvas',
                render: () => (
                  <div className="h-full min-h-0 flex flex-col">
                    <LayerIsolationBar count={layerIsolation.roots.length} onExit={layerIsolation.exit} />
                    <div className="flex flex-1 min-h-0 min-w-0"><SceneCanvas
                    arrayAuthoring={arrayAuthoring}
                    shapePlacementLayer={shapeCreation.template}
                    shapePlacementHint={shapeCreation.hint}
                    onShapePlacementComplete={shapeCreation.complete}
                    scene={scene} displayScene={layerIsolation.scene}
                    physicsOverlay={physicsViewportOverlay}
                    onPhysicsBondSelect={bondId => setPhysicsViewportOverlay(previous => ({
                      ...previous,
                      selectedBondId: bondId,
                    }))}
                    onEditContent={openItemDetail} onIsolateContent={layerIsolation.enter}
                    editor={editor}
                    getShortcutContext={getShortcutContext}
                    timeMs={currentTimeMs}
                    selectedLayerId={isolatedPrimaryId}
                    textEditRequestId={textEditRequestId}
                    onTextEditRequestDone={() => setTextEditRequestId(null)}
                    selectedLayerIds={isolatedSelectedIds}
                    assets={assetCache}
                    onSelectLayer={selectLayer}
                    onSelectLayers={ids => replaceLayerSelection(ids, ids[0])}
                    onAgentHandoff={handleAgentHandoff}
                    overrides={frame.overrides}
                    paramValues={frame.paramValues}
                    previewMode={!!runtime.segmentState || manualPreview}
                    isPlaying={isPlaying}
                    onLayerClickInPreview={(layerId) =>
                      runtime.fireEvent({ type: 'click', layerId })
                    }
                    onLayerDragInPreview={(layerId, phase, dx, dy, progress) => {
                      const evtType =
                          phase === 'start' ? 'dragStart'
                        : phase === 'end'   ? 'dragEnd'
                        : 'dragMove'
                      runtime.fireEvent({ type: evtType, layerId, dx, dy, progress })

                      const layer = scene.layers.find(l => l.id === layerId)
                      const cfg = layer?.dragConfig

                      // 🎬 Scrub a timeline — drag controls its playhead.
                      //    Author normal keyframe animations; drag becomes the
                      //    timeline cursor. Used for "drag this box down →
                      //    text blur ramps up" style interactions.
                      if (cfg?.scrubsTimeline) {
                        const tl = scene.timelines.find(t => t.id === cfg.scrubsTimeline)
                        if (tl) {
                          // Pause regular playback at drag start so the user's
                          // scrub isn't fighting the autoplay clock.
                          if (phase === 'start' && isPlaying) handlePlayToggle()
                          handleSeek(progress * tl.durationMs)
                        }
                      }

                      // Auto-set parameter when configured on the layer
                      if (cfg?.setsParameter && phase === 'move') {
                        runtime.setParamOverride(cfg.setsParameter, progress)
                      }
                    }}
                    panMode={toolMode === 'pan'}
                    onPanModeChange={setPanMode}
                    toolMode={toolMode}
                    onToolModeChange={setToolMode}
                    splineDrawKind={splineDrawKind}
                    splineAppendTargetId={splineDrawTargetId}
                    splineContinuationPointId={splineContinuationPointId}
                    splineAutoClose={splineDrawingPreferences.autoClose}
                    onDrawSplineLine={(targetId, endpointId) => {
                      if (editor.isTransactionActive()) return
                      selectLayer(targetId)
                      armSplineDrawing('line', targetId, endpointId)
                    }}
                    onSplineDrawCommit={result => {
                      setSplineDrawKind(null); setToolMode('select'); setSplineDrawTargetId(null); setSplineContinuationPointId(null)
                      if (result) setPendingSplineResult(result)
                    }}
                    splineEdit={splineEdit}
                    geometryEditActive={geometryEdit.active}
                    onExitGeometryEdit={geometryEdit.exit}
                    geometryEditMode={geometryEdit.mode}
                    onEnterGeometryEdit={enterGeometryEditLevel}
                    onMeshSelectionChange={setMeshSelection}
                    onOpenSplineTools={openSplineTools}
                    booleanPreview={booleanPreview.result}
                    outlinePreview={splineBand.worldResult ?? splineOutline.result}
                    splineTangentClipboard={splineTangentClipboard}
                    splineToolActions={splineEditTools({ layer: selectedLayer, scene, mode: splineEdit.mode, active: splineEdit.active, disabled: isPlaying || manualPreview || !!detail.session, busy: editor.isTransactionActive(), controllers: { band: splineBand, offset: splineOutline, chamfer: splineChamfer, fillet: splineFillet }, onOpen: openSplineTools })}
                    chamferPreview={splineChamfer.result}
                    filletPreview={splineFillet.result}
                    onEditOperation={editBooleanOperation}
                    onBooleanPreview={booleanPreview.targets.length >= 2 && !booleanPreview.disabled ? () => { booleanPreview.open(); openSplineTools() } : undefined}
                    snap={snap}
                    onSelectByGeometry={(ids, mode) => {
                      const incoming = new Set(ids)
                      setLayerSelection(previous => combineLayerSelection(previous, incoming, mode))
                    }}
                    selectionContainMode={selectionContainMode}
                    selectionStyle={selectionStyle}
                    transformSpace={transformSpace}
                    fullscreen={fullscreenCanvas}
                    onToggleFullscreen={() => setFullscreenCanvas((v) => !v)}
                    onAfterLayerCommit={autoKeyChangedProps}
                    onAfterCloneDrag={rememberDuplicatePattern}
                    buildLayerCommitCommands={viewportKeyCommands}
                    ghostSettings={ghostSettings}
                    selectedTimeline={selectedTimelineForGhost}
                    selectedKeyframeIds={selectedKfIds}
                    onSelectKeyframes={setSelectedKfIds}
                    onSeekKeyframe={handleSeek}
                    onMotionEditingChange={setMotionKeyEditing}
                    motionControlsHost={motionControlsHost}
                    onOpenMotionControls={() => dock.dispatchRestorePanel('motionKeys', 'properties')}
                    onEditMotionTiming={(layerId) => {
                      selectLayer(layerId)
                      revealTimelineProperty('all')
                      const leaf = findLeafOfPanel(dock.layout, 'timeline')
                      if (leaf) dock.dispatchTab(leaf.id, 'timeline')
                    }}
                    pathPickMode={pathPickMode}
                    onAssignPath={(targetId, pathId) => {
                      assignMotionPathToLayer(targetId, pathId)
                      setPathPickMode(null)
                    }}
                    onExitPathPickMode={() => setPathPickMode(null)}
                    menuHandlers={{
                      addLayer: addContextItem,
                      cut:        cutSelectedLayers,
                      copy:       copySelectedLayers,
                      paste:      pasteLayers,
                      canPaste:   hasClipboard,
                      duplicate:  duplicateSelectedLayer,
                      group:      groupSelected,
                      ungroup:    id => { void ungroupLayer(id ?? selectedLayerId ?? '') },
                      canUngroup: selectedLayer?.type === 'group',
                      deleteLayer: () => deleteLayers(Array.from(selectedLayerIds.size ? selectedLayerIds : selectedLayerId ? [selectedLayerId] : [])),
                      animateProperty: (propPath: string) =>
                        selectedLayerId && keyframeSelectedLayers([propPath]),
                      alignLeft:   () => alignSelected('left'),
                      alignCenter: () => alignSelected('centerX'),
                      alignRight:  () => alignSelected('right'),
                      alignTop:    () => alignSelected('top'),
                      alignMiddle: () => alignSelected('middle'),
                      alignBottom: () => alignSelected('bottom'),
                      // BL-67 — Pick mode: next path clicked on canvas becomes this layer's motion guide.
                      assignMotionPath: selectedLayerId
                        ? () => setPathPickMode({ targetLayerId: selectedLayerId })
                        : undefined,
                      // BL-24 fix: Convert to Spline shape nesnelerinde gösterilmez.
                      // Shape'ler parametrik kalmalı; spline dönüşümü gerekirse ileride
                      // sadece bezierPath layer'ı için ayrı bir akış olur.
                      convertToSpline: () => convertSelectedGeometry('spline'),
                      convertToMesh2D: () => convertSelectedGeometry('mesh2d'),
                      // BL-73 Sprint 6 — Text → editable spline glyph outlines.
                      convertTextToSpline: selectedLayer?.type === 'text' ? convertTextToSpline : undefined,
                      // BL-59 — Clone & Array context-menu entries
                      cloneQuick:    cloneQuick,
                      cloneSettings: openCloneModal,
                      arraySettings: openArrayModal,
                      selectAllInArray: (layerId: string) => {
                        const siblings = getSiblingsInArray(layerId)
                        if (siblings.length <= 1) return
                        replaceLayerSelection(siblings, layerId)
                        toast.info(`Selected ${siblings.length} layers in array`)
                      },
                      isLayerInArray: (layerId: string) =>
                        Boolean(layerMetaById[layerId]?.arrayGroupId),
                      cloneAlignToSelected: (sourceId: string) => {
                        const source = scene.layers.find((l) => l.id === sourceId)
                        if (!source) return
                        const targets = scene.layers.filter(
                          (l) => l.id !== sourceId && selectedLayerIds.has(l.id),
                        )
                        if (targets.length === 0) {
                          toast.warning('Select target layers first (Shift+click to add).')
                          return
                        }
                        const cmd = makeCloneAlignCmd({
                          source,
                          targets,
                          options: defaultCloneAlignOptions(),
                          timeline: getActiveTimeline(),
                          allLayers: scene.layers,
                        })
                        dispatchCommand(cmd)
                        toast.success(
                          `Cloned "${source.name}" to ${targets.length} target${
                            targets.length === 1 ? '' : 's'
                          }`,
                        )
                      },
                      bakeRepeater: (repeaterId: string) => {
                        const repeater = scene.layers.find((l) => l.id === repeaterId)
                        if (!repeater || repeater.type !== 'repeater' || !repeater.repeater) return
                        const source = scene.layers.find((l) => l.id === repeater.repeater!.sourceLayerId)
                        if (!source) {
                          toast.error('Repeater source layer not found')
                          return
                        }
                        const cmd = makeBakeRepeaterCmd(repeater, source)
                        if (!cmd) return
                        dispatchCommand(cmd)
                        toast.success(`Baked "${repeater.name}" — ${repeater.repeater.count} layers`)
                      },
                    }}
                  /></div></div>
                ),
              },
              {
                id: 'stateMachine', title: 'State Machine',
                render: () => (
                  <StateMachinePanel scene={scene} editor={editor} runtime={runtime} />
                ),
              },
              {
                id: 'properties', title: 'Properties',
                render: () => (
                  <div className="flex flex-col h-full bg-gray-900 overflow-hidden">
                    {(selectedLayer?.type === 'spline' || selectedLayer?.type === 'mesh2d') && <div className="mx-3 mt-2 grid gap-2">
                      <button type="button"
                        onClick={() => dock.dispatchRestorePanel('geometryEdit')}
                        className="min-h-9 rounded border border-blue-600 px-3 py-2 text-left text-xs text-blue-200 transition-colors hover:bg-blue-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                        Open Edit
                      </button>
                    </div>}
                    {canCreateShapeBoundaryMesh2D(selectedLayer ?? undefined) && <div className="mx-3 mt-2 grid gap-2">
                      <button type="button"
                        onClick={createMesh2DFromShape}
                        className="min-h-9 rounded border border-cyan-700 bg-cyan-950/20 px-3 py-2 text-left text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                        Create Mesh2D from closed shape
                      </button>
                    </div>}
                    <PropertiesPanel
                      expressionFrame={frame}
                      expressionExternalTime={expressionAuthoringClock}
                      getScene={editor.getScene}
                      isTransactionActive={editor.isTransactionActive}
                      layer={selectedLayer}
                      currentTimeMs={currentTimeMs}
                      selectedTimelineId={selectedTlId}
                      onNormalizeAudio={normalizeAudio}
                      composition={scene.composition}
                      onLayerChange={updateLayer}
                      onCompositionChange={updateComposition}
                      onImportPaintImage={(file, layerId) => { void importPaintImage(file, layerId) }}
                      parameters={scene.parameters}
                      allLayers={scene.layers}
                      allTimelines={scene.timelines.map(t => ({ id: t.id, durationMs: t.durationMs }))}
                      // BL-24 fix: PropertiesPanel'den Convert to Spline butonu kaldırıldı.
                      // Shape'ler parametrik kalır; properties'te geometry params görünür.
                      onConvertToSpline={undefined}
                      scene={scene}
                      parameterWires={scene.parameterWires}
                      onRequestNewWire={wireModal.openForTarget}
                      onEditWire={wireModal.openForEdit}
                      dispatchCommand={dispatchCommand}
                    />
                    {selectedKfIds.size > 0 && (
                      <KeyframeInspector
                        scene={scene}
                        selectedTimelineId={selectedTlId}
                        selectedKfIds={selectedKfIds}
                        editor={editor}
                      />
                    )}
                  </div>
                ),
              },
              {
                id: 'geometryEdit', title: 'Edit',
                render: () => <SplineToolsPanel contained booleanPreview={booleanPreview} showBooleanPreview={!splineEdit.active || booleanPreview.active}
                  lineDrawing={toolMode === 'spline-draw' && splineDrawKind === 'line' ? { autoClose: splineDrawingPreferences.autoClose, onAutoClose: splineDrawingPreferences.setAutoClose } : undefined}>
                <NumericPropertyProvider scene={scene} layerId={selectedLayerId ?? undefined} dispatch={dispatchCommand} getScene={editor.getScene}
                  isTransactionActive={editor.isTransactionActive} timeMs={currentTimeMs} timelineId={selectedTlId ?? undefined} frame={frame} externalTime={expressionAuthoringClock}>
                <GeometryEditPanel key={selectedLayerId ?? 'none'} layer={selectedLayer} selectedPointId={splineEdit.mode === 'point' ? splineEdit.ids[0] ?? null : null}
                  editMode={geometryEdit}
                  meshSelection={meshSelection}
                  onSplineSourceBaked={id => splineEdit.focusResult({ layerId: id, mode: 'object' })}
                  selectedIds={Array.from(isolatedSelectedIds)} conversionDisabled={isPlaying || manualPreview || !!detail.session}
                  splineModeControls={<SplineModeControls controller={splineEdit}
                    disabled={modifierOutputReadOnly(selectedLayer) || isPlaying || manualPreview || !!detail.session || !!selectedLayer?.locked || !!selectedLayer?.hidden || !!selectedLayer?.frozen || !!selectedLayer?.instanceOf} />}
                  selectedPointIds={splineEdit.mode === 'point' ? splineEdit.bank.point : []}
                  selectedObjectIds={splineEdit.mode === 'object' ? splineEdit.bank.object : []}
                  selectedContourIds={splineEdit.mode === 'object' ? Array.from(new Set(splineEdit.bank.object.flatMap(id => selectedLayer?.spline?.subShapes[id]?.contourIds ?? []))) : []}
                  getScene={editor.getScene} getRevision={editor.getRevision} getDocumentSignal={editor.getDocumentSignal}
                  isTransactionActive={editor.isTransactionActive} dispatchCommand={dispatchCommand}
                  onSelectLayer={id => selectLayer(id)} onClearPoint={splineEdit.clear} onLayerChange={updateLayer}
                  splineSourceSettings={selectedLayer?.spline && !selectedLayer.booleanResultFor && splineEdit.layerId === selectedLayer.id ? (
                    <SplineEditInspector tangentClipboard={splineTangentClipboard} modeControls={false} layer={selectedLayer} controller={splineEdit} getScene={editor.getScene} dispatchCommand={dispatchCommand}
                          outline={splineOutline} band={splineBand}
                          chamfer={splineChamfer}
                          fillet={splineFillet}
                          overrides={frame.overrides} disabled={isPlaying || manualPreview || !!detail.session}
                          timeMs={currentTimeMs} onSelectLayer={selectLayer} isTransactionActive={editor.isTransactionActive}
                          drawingLine={toolMode === 'spline-draw' && splineDrawKind === 'line'} autoClose={splineDrawingPreferences.autoClose} onAutoClose={splineDrawingPreferences.setAutoClose}
                          onBeginAttach={() => { setSplineDrawKind(null); setSplineDrawTargetId(null); setSplineContinuationPointId(null); setToolMode('select'); setPanMode(false) }}
                          onDraw={(kind, endpointId) => armSplineDrawing(kind, selectedLayer.id, endpointId)} />
                  ) : undefined} />
                </NumericPropertyProvider></SplineToolsPanel>,
              },
              {
                id: 'motionKeys', title: 'Motion Keys',
                render: () => <MotionKeysPanel active={motionKeyEditing} layerName={selectedLayer?.name} controlsRef={setMotionControlsHost} />,
              },
              {
                id: 'timeline', title: 'Timeline',
                render: () => (
                  <div className="h-full bg-gray-900 overflow-hidden" data-panel="timeline">
                    <TimelinePanel layerScope={layerIsolation.contentScope}
                      scene={scene}
                      authoring={timelineAuthoring}
                      revealRequest={timelineReveal}
                      editor={editor}
                      settings={timelineSettings}
                      onSettingsChange={setTimelineSettings}
                      selectedLayerId={selectedLayerId}
                      selectedLayerIds={selectedLayerIds}
                      selectedTimelineId={selectedTlId}
                      selectedKfIds={selectedKfIds}
                      currentTimeMs={timelineAuthoring.localTimeMs}
                      isPlaying={isPlaying}
                      playbackSpeed={playbackSpeed}
                      onTimeChange={seekAuthoring}
                      onPlayToggle={handlePlayToggle}
                      onSelectTimeline={id => { setMCPTimelineIds(null); selectTimeline(id) }}
                      onSelectKeyframes={setSelectedKfIds}
                      onSelectLayer={selectLayer}
                      onToggleLayerFlag={toggleLayerFlag}
                      onPlaybackSpeedChange={setPlaybackSpeed}
                      onPlaySegment={(tlId, segId, loop) => runtime.playSegment(tlId, segId, loop)}
                      activeSegmentId={runtime.segmentState?.segmentId ?? null}
                      ghostSettings={ghostSettings}
                      onGhostUpdate={updateGhostSettings}
                      onGhostToggle={toggleGhost}
                      onGhostPreset={applyGhostPreset}
                      onEditWire={wireModal.openForEdit}
                      onWireRequest={wireModal.openForTarget}
                      revealProperty={revealProperty}
                      audioControls={<AudioOutputControls scene={scene} timelineId={selectedTlId}
                        documentSignal={importDocument}
                        getState={audioTransport.getState} subscribeMeter={audioTransport.subscribeMeter}
                        onMasterChange={volume => updateComposition({ ...scene.composition, audioVolume: volume })}
                        onMasterMute={muted => updateComposition({ ...scene.composition, audioMuted: muted })} />}
                    />
                  </div>
                ),
              },
              {
                id: 'curveEditor', title: 'Curve Editor',
                render: () => (
                  <div className="h-full min-h-0 overflow-hidden" data-panel="curveEditor">
                  <CurveEditor layerScope={layerIsolation.contentScope}
                    scene={scene}
                    collisionPolicy={timelineAuthoring.collisionPolicy}
                    onCollisionPolicyChange={timelineAuthoring.setCollisionPolicy}
                    editor={editor}
                    selectedLayerId={selectedLayerId}
                    selectedLayerIds={selectedLayerIds}
                    selectedTimelineId={selectedTlId}
                    currentTimeMs={timelineAuthoring.localTimeMs}
                    onTimeChange={seekAuthoring}
                    selectedKfIds={selectedKfIds}
                    onSelectKeyframes={setSelectedKfIds}
                  />
                  </div>
                ),
              },
              {
                id: 'dopeSheet', title: 'Dope Sheet',
                render: () => (
                  <div className="h-full min-h-0 overflow-hidden" data-panel="dopeSheet">
                  <DopeSheetPanel layerScope={layerIsolation.contentScope}
                    scene={scene}
                    collisionPolicy={timelineAuthoring.collisionPolicy}
                    onCollisionPolicyChange={timelineAuthoring.setCollisionPolicy}
                    editor={editor}
                    settings={timelineSettings}
                    onSettingsChange={setTimelineSettings}
                    selectedLayerId={selectedLayerId}
                    selectedLayerIds={selectedLayerIds}
                    selectedTimelineId={selectedTlId}
                    selectedKfIds={selectedKfIds}
                    currentTimeMs={timelineAuthoring.localTimeMs}
                    isPlaying={isPlaying}
                    onTimeChange={seekAuthoring}
                    onSelectKeyframes={setSelectedKfIds}
                    onSelectLayer={selectLayer}
                  />
                  </div>
                ),
              },
              {
                id: 'curveModifiers', title: 'Animation Modifiers',
                render: () => (
                  <CurveModifierStackPanel
                    scene={scene}
                    selectedTimelineId={selectedTlId}
                    selectedKfIds={selectedKfIds}
                    editor={editor}
                  />
                ),
              },
              {
                id: 'parameters', title: 'Parameters',
                render: () => <ParametersPanel scene={scene} editor={editor} />,
              },
              {
                id: 'events', title: 'Events',
                render: () => <EventsPanel scene={scene} editor={editor} />,
              },
              {
                id: 'motionBinding', title: 'Bindings',
                render: () => <MotionBindingPanel scene={scene} editor={editor} />,
              },
              {
                id: 'wiring', title: 'Wires',
                render: () => (
                  <WiringListPanel
                    scene={scene}
                    editor={editor}
                    wireErrors={frame.wireErrors}
                    onEditWire={wireModal.openForEdit}
                    onCreateWire={wireModal.openNew}
                  />
                ),
              },
              {
                id: 'selection', title: 'Select',
                render: () => (
                  <SelectionPanel
                    scene={scene}
                    selectedLayerId={selectedLayerId}
                    onSelectMatched={(ids) => {
                      replaceLayerSelection(ids, null)
                    }}
                  />
                ),
              },
              {
                id: 'runtimePreview', title: 'Preview',
                render: () => <RuntimePreviewPanel scene={scene} runtime={runtime} />,
              },
              {
                id: 'player', title: 'Player',
                render: () => <ChronoPlayerPanel scene={scene} assets={assetCache} />,
              },
              {
                id: 'assets', title: 'Assets',
                render: () => (
                  <AssetsPanel
                    scene={scene}
                    editor={editor}
                    selectedTimelineId={selectedTlId}
                    currentTimeMs={currentTimeMs}
                    onSelectLayer={(id) => selectLayer(id)}
                    onImportFiles={handleImportFiles}
                  />
                ),
              },
              {
                id: 'particles', title: 'Particle',
                render: () => (
                  <ParticlePanel
                    scene={scene}
                    selectedLayer={selectedLayer}
                    onLayerChange={updateLayer}
                  />
                ),
              },
              {
                id: 'physicsSimulations', title: 'Physics',
                render: () => (
                  <PhysicsSimulationsPanel
                    scene={scene}
                    selectedLayerId={selectedLayerId}
                    selectedTimelineId={selectedTlId}
                    currentTimeMs={currentTimeMs}
                    controller={physicsBake}
                    onOpenParticles={() => dock.dispatchRestorePanel('particles')}
                    viewportOverlay={physicsViewportOverlay}
                    onViewportOverlayChange={setPhysicsViewportOverlay}
                  />
                ),
              },
              {
                id: 'jobsBake', title: 'Jobs & Bake',
                render: () => <JobsBakePanel controller={physicsBake} editor={editor} />,
              },
              {
                // BL-76 — Authoring Script REPL (JS host + scene API facade).
                id: 'scriptConsole', title: 'Script',
                render: () => (
                  <ScriptConsolePanel
                    getScene={() => scene}
                    dispatchCommand={dispatchCommand}
                  />
                ),
              },
              {
                id: 'resourceMonitor', title: 'Resources & Performance',
                render: () => <ResourceMonitorPanel scene={scene} assets={assetCache} audio={audioTransport} isPlaying={isPlaying} />,
              },
            ] satisfies PanelDefinition[])
            // Fullscreen canvas: skip the dock entirely and render only the
            // canvas panel as a full-bleed surface. Esc (handled in the
            // useEffect above) restores the normal dock layout.
            if (fullscreenCanvas) {
              const canvasDef = registry.get('canvas')
              return (
                // `fixed inset-0` so the canvas covers the ENTIRE viewport,
                // not just the dock work area — the page header / toolbar
                // is hidden underneath while fullscreen is active.
                <div className="fixed inset-0 z-[100] bg-gray-800">
                  {canvasDef?.render()}
                  <button
                    onClick={() => setFullscreenCanvas(false)}
                    title="Exit fullscreen (Esc)"
                    className="absolute top-3 left-3 z-[110] px-2.5 py-1 text-xs font-mono
                               bg-gray-900/90 border border-gray-700 text-gray-300
                               hover:bg-gray-800 rounded"
                  >
                    ⛶ Exit fullscreen <span className="text-gray-500 ml-1">Esc</span>
                  </button>
                </div>
              )
            }
            return (
              <DockLayout
                node={dock.layout}
                registry={registry}
                onTabSelect={dock.dispatchTab}
                onClosePanel={dock.dispatchClosePanel}
                onResize={dock.dispatchResize}
                onCollapse={dock.dispatchCollapse}
              />
            )
          })()}
          </div>
          {detail.session && <ItemDetailWorkspace key={detail.session.id} session={detail.session} editor={editor}
            timeMs={detailTimeMs} onClose={detail.close} />}
        </div>
      </DockDragProvider>

      {/* ── JSON Modal ─────────────────────────────────────────────── */}
      {displayAvailable && welcome.isOpen && <WelcomeScreen
        composition={scene.composition} layerCount={scene.layers.length}
        showOnStartup={welcome.showOnStartup} onStartupChange={welcome.changeStartup}
        error={welcome.error} onCreate={newScene} onOpenProject={openSceneJson} onContinue={welcome.close}
      />}
      {releaseNotes.isOpen && !welcome.isOpen && <ReleaseNotesDialog onClose={releaseNotes.close} />}

      {showJson && <JsonModal scene={scene} onSaveProject={saveSceneJson} documentSignal={importDocument} onClose={() => setShowJson(false)} />}

      {/* ── Composition Preset Modal ───────────────────────────────── */}
      {showCompModal && (
        <CompositionPresetModal
          assets={scene.assets}
          composition={scene.composition}
          timelineId={selectedTlId || null}
          onApply={updateComposition}
          onClose={() => setShowCompModal(false)}
        />
      )}

      {/* ── Shortcut Help Modal ────────────────────────────────────── */}
      {showHelp && <ShortcutHelpModal initialMode={detail.session?.animation ? '3d' : '2d'} onClose={() => setShowHelp(false)} />}

      {/* ── BL-80 Raster image export (PNG / WEBP / JPEG) ─────────────── */}
      {showRasterExport && (
        <RasterExportDialog
          scene={scene}
          documentSignal={importDocument}
          assets={assetCache}
          timeMs={currentTimeMs}
          onClose={() => setShowRasterExport(false)}
          onExported={(filename, warnings) => {
            if (warnings.length > 0) {
              toast.success(`Exported ${filename}`, { detail: warnings.join(' ') })
            } else {
              toast.success(`Exported ${filename}`)
            }
          }}
          onError={(message) => toast.error('Image export failed', { detail: message })}
        />
      )}

      {/* ── BL-84 SVG (vector) export ─────────────────────────────────── */}
      {showSvgExport && (
        <SVGExportDialog
          scene={scene}
          documentSignal={importDocument}
          timeMs={currentTimeMs}
          onClose={() => setShowSvgExport(false)}
          onExported={(filename, warnings) => {
            if (warnings.length > 0) {
              toast.success(`Exported ${filename}`, { detail: warnings.join(' ') })
            } else {
              toast.success(`Exported ${filename}`)
            }
          }}
          onError={(message) => toast.error('SVG export failed', { detail: message })}
        />
      )}

      {/* ── BL-83 Image sequence export (ZIP) ─────────────────────────── */}
      {showSequenceExport && (
        <SequenceExportDialog
          scene={scene}
          documentSignal={importDocument}
          assets={assetCache}
          onClose={() => setShowSequenceExport(false)}
          onExported={(filename, frameCount, warnings) => {
            const base = `Exported ${filename} (${frameCount} frames)`
            if (warnings.length > 0) toast.success(base, { detail: warnings.join(' ') })
            else toast.success(base)
          }}
          onError={(message) => toast.error('Sequence export failed', { detail: message })}
        />
      )}

      {showRenderSettings && (
        <RenderSettingsDialog
          scene={scene}
          assets={assetCache}
          currentTimeMs={currentTimeMs}
          documentSignal={importDocument}
          onClose={() => setShowRenderSettings(false)}
          onCompleted={(completion, warnings) => {
            const message = completion.backend === 'chorono'
              ? `Opened ${completion.intent === 'still' ? 'current frame' : `${completion.frameCount}-frame video source`} in Chorono Render`
              : `Rendered ${completion.filename ?? (completion.artifact === 'png' ? 'PNG' : 'PNG sequence')} with the built-in renderer`
            toast.success(message, warnings.length ? { detail: warnings.join(' ') } : undefined)
          }}
          onError={(message) => toast.error('Render failed', { detail: message })}
        />
      )}

      {/* ── Import from URL (BL-09) ──────────────────────────────────── */}
      {importUrlDocument === importDocument && !importDocument.aborted && (
        <ImportUrlModal
          onImport={(url) => { if (!importUrlDocument?.aborted && importUrlDocument === editor.getDocumentSignal()) void importAnyUrl(url) }}
          onClose={() => setImportUrlDocument(null)}
        />
      )}

      {/* ── Import preflight preview (BL-09) ──────────────────────────── */}
      {pendingImport && pendingImport.document === importDocument && !importDocument.aborted && (
        <ImportPreviewModal
          fileName={pendingImport.file.name}
          preflight={pendingImport.preflight}
          onConfirm={() => { if (!pendingImport.document.aborted && pendingImport.document === editor.getDocumentSignal()) void importAnyFile(pendingImport.file); setPendingImport(null) }}
          onCancel={() => setPendingImport(null)}
        />
      )}

      {/* ── Sprite sheet grid import (BL-07b) ─────────────────────────── */}
      {pendingSprite && pendingSprite.document === importDocument && !importDocument.aborted && (
        <SpriteSheetImportModal
          file={pendingSprite.file}
          onImport={(opts) => { if (!pendingSprite.document.aborted && pendingSprite.document === editor.getDocumentSignal()) void importSpriteSheet(pendingSprite.file, opts) }}
          onClose={() => setPendingSprite(null)}
        />
      )}

      {/* ── BL-59 Clone Modal ──────────────────────────────────────── */}
      {cloneModalSource && (
        <CloneModal
          source={cloneModalSource}
          sourceCount={cloneModalIds.length}
          hasAnimationOnSource={cloneModalIds.some(id => { const layer = scene.layers.find(item => item.id === id); return layer ? sourceHasAnimation(layer, true) : false })}
          onApply={handleCloneApply}
          onClose={() => { setCloneModalSource(null); setCloneModalIds([]); setCloneModalScene(null) }}
        />
      )}

      {/* Array controls and viewport share one pinned source/solution. */}
      {arrayAuthoring.active && <ArrayModal authoring={arrayAuthoring} />}

      {/* ── BL-05: Wire Parameter modal (formula-driven parameter wiring) ── */}
      {wireModal.isOpen && (
        <WireParameterModal
          scene={scene}
          editor={editor}
          sourceOverrides={frame.wireSourceOverrides} paramValues={frame.paramValues}
          existingWire={wireModal.editWire}
          preFilledTarget={wireModal.newTarget}
          onClose={wireModal.close}
        />
      )}

      {/* ── Toast notifications (lives above everything) ───────────── */}
      {pendingAgentHandoff && <AgentHandoffDialog
        key={`${pendingAgentHandoff.context.sessionId}:${pendingAgentHandoff.intent}:${pendingAgentHandoff.context.timeMs}`}
        intent={pendingAgentHandoff.intent}
        context={pendingAgentHandoff.context}
        onCopy={detail => copyAgentHandoff(pendingAgentHandoff.context, pendingAgentHandoff.intent, detail)}
        onClose={() => setPendingAgentHandoff(null)}
      />}
      <ToastContainer />
    </div>
  )
}

// ── Helper: dotted-path numeric reader for Layer property comparison ───────
// Used by the auto-key pipeline to detect which animatable fields actually
// changed between two Layer snapshots so we only emit keyframes for those.
function readNumber(obj: unknown, path: string): number | undefined {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p]
    } else { return undefined }
  }
  return typeof cur === 'number' ? cur : undefined
}
