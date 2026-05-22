'use client'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { Layer, ChronoScene, TimelineSettings } from '@/lib/types'
import { DEFAULT_TIMELINE_SETTINGS } from '@/lib/types'
import {
  emptyScene,
  newTimeline,
  cloneLayerForDuplicate,
} from '@/lib/defaults'
import { layerRegistry } from '@/lib/registry'
import { computeTimelineCycleEnd, hasInfinitePlayback } from '@/lib/evaluator'
import { useEditorState }      from './hooks/useEditorState'
import { usePlayback }         from './hooks/usePlayback'
import { useKeyboard }         from './hooks/useKeyboard'
import type { TimelineProperty } from './hooks/useKeyboard'
import type { ShortcutContext } from '@/lib/shortcuts'
import { useSnapSettings }     from './hooks/useSnapSettings'
import { useKeyframeClipboard } from './hooks/useKeyframeClipboard'
import { useAssetCache }       from './hooks/useAssetCache'
import { useImport }           from './hooks/useImport'
import { useVideoPlaybackSync } from './hooks/useVideoPlaybackSync'
import { useAudioEngine }      from './hooks/useAudioEngine'
import { useInteractiveRuntime } from './hooks/useInteractiveRuntime'
import { useTimelineGhost }     from '@/components/timeline/hooks/useTimelineGhost'
import { useFileVersioning } from './hooks/useFileVersioning'
import { FileVersioningControl } from '@/components/FileVersioningControl'
import {
  makeAddLayerCmd, makeDeleteLayerCmd, makeUpdateLayerCmd, makeToggleLayerCmd,
  makeDuplicateLayerCmd, makeMoveLayerCmd,
  makeBulkUpdateLayersCmd, makeBulkToggleFlagCmd,
  makeIsolateLayersCmd, makeShowAllLayersCmd,
} from '@/lib/editor/commands-layer'
import { makeBulkDeleteKfCmd, makeKeyframeLayerSnapshotCmd, makeAddKfCmd, type KfDeletion } from '@/lib/editor/commands-keyframe'
import { makeAddLayerToTimelineCmd, makeRemoveLayerFromTimelineCmd } from '@/lib/editor/commands-timeline'
import { nextKfId } from '@/lib/defaults'
import { makeConvertToSplineCmd } from '@/lib/editor/commands-convert'
import type { SplinePrimitiveKind } from '@/lib/types/spline'

/** Maps Add-Layer menu kinds → spline primitive kinds for draw mode (BL-73). */
const SPLINE_MENU_TO_KIND: Record<string, SplinePrimitiveKind> = {
  splineCircle: 'circle', splineLine: 'line', splineRect: 'rectangle',
  splineEllipse: 'ellipse', splineArc: 'arc', splineDonut: 'donut',
  splineNGon: 'ngon', splineStar: 'star',
}
import { ANIMATION_PRESETS } from '@/lib/timeline/presets'
import LayerPanel      from '@/components/LayerPanel'
import SceneExplorerPanel from '@/components/sceneExplorer/SceneExplorerPanel'
import SceneCanvas     from '@/components/SceneCanvas'
import PropertiesPanel from '@/components/PropertiesPanel'
import SplinePointInspector from '@/components/SplinePointInspector'
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
import ImportUrlModal    from '@/components/modals/ImportUrlModal'
import ImportPreviewModal from '@/components/modals/ImportPreviewModal'
import { IMPORT_ACCEPT } from '@/lib/import/acceptFormats'
import type { ImportPreflight } from '@/lib/import/types'
import ToolGroup, {
  type ToolMode, type SelectionContainMode,
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
import AssetsPanel         from '@/components/panels/AssetsPanel'
import SnapPanel               from '@/components/panels/SnapPanel'
import StateMachinePanel       from '@/components/panels/StateMachinePanel'
import KeyboardShortcutsPanel  from '@/components/panels/KeyboardShortcutsPanel'
import ScriptConsolePanel      from '@/components/panels/ScriptConsolePanel'
import ParticlePanel       from '@/components/particles/ParticlePanel'
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
import AIPanel                from '@/components/AIPanel'
import { makeCloneCmd, makeArrayCmd, makeCloneAlignCmd } from '@/lib/editor/commands-clone'
import { makeConvertToRepeaterCmd, makeBakeRepeaterCmd } from '@/lib/editor/commands-repeater'
import { defaultCloneAlignOptions } from '@/lib/clone/CloneAlign'
import { targetsLayer } from '@/lib/timeline/TrackTargetParser'
// ── Mode system bootstrap ─────────────────────────────────────────────────────
import '@/lib/modes/bootstrap'
import { modeRegistry } from '@/lib/modes'
import type { EditorMode } from '@/lib/core/EditorMode'

// ── Demo scene shown on first load ────────────────────────────────────────────

function makeDemoScene(): ChronoScene {
  const s = emptyScene()

  const card: Layer = {
    id: 'card', name: 'Card', type: 'shape', shape: 'rect',
    transform: { x: 40, y: 60, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 140, anchorY: 60 },
    opacity: 0,
    style: { fill: { type: 'solid', color: '#3B82F6' }, cornerRadius: 16 },
    size: { width: 280, height: 120 },
  }
  const label: Layer = {
    id: 'label', name: 'Label', type: 'text',
    // Anchor at the visual centre of "Chorono" @22px (rough text bbox)
    transform: { x: 130, y: 128, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 42, anchorY: 13 },
    opacity: 0,
    // BL-72: text layers carry a measured `size` so the SelectionFrame renders
    // and tracks the glyphs. Edits re-measure via PropertiesPanel.updateText.
    size: { width: 84, height: 26 },
    text: { value: 'Chorono', fontSize: 22, color: '#FFFFFF' },
  }
  s.layers = [card, label]

  const tl = newTimeline()
  Object.assign(tl, { id: 'intro', durationMs: 600, autoplay: true, layerIds: ['card', 'label'] })
  tl.tracks = [
    {
      target: 'layers.card.opacity',
      keyframes: [
        { id: 'k1', timeMs: 0,   value: 0, easing: { type: 'easeOut' as const } },
        { id: 'k2', timeMs: 600, value: 1, easing: { type: 'linear'  as const } },
      ],
    },
    {
      target: 'layers.card.transform.y',
      keyframes: [
        { id: 'k3', timeMs: 0,   value: 90, easing: { type: 'easeOut' as const } },
        { id: 'k4', timeMs: 600, value: 60, easing: { type: 'linear'  as const } },
      ],
    },
    {
      target: 'layers.label.opacity',
      keyframes: [
        { id: 'k5', timeMs: 200, value: 0, easing: { type: 'easeOut' as const } },
        { id: 'k6', timeMs: 600, value: 1, easing: { type: 'linear'  as const } },
      ],
    },
  ]
  s.timelines = [tl]
  return s
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BuilderPage() {
  // ── Active editor mode ────────────────────────────────────────────────────
  // Currently always '2danimation'. When a mode selector UI lands, this will
  // drive descriptor lookup for panels / tools / renderer.
  const [currentMode] = useState<EditorMode>('2danimation')
  const modeDescriptor = modeRegistry.get(currentMode)

  // ── Central scene state with history + transactions ──────────────────────
  const editor = useEditorState(makeDemoScene())
  const {
    scene, canUndo, canRedo, dispatchCommand, resetScene, undo, redo,
    layerMetaById, getSiblingsInArray,
  } = editor

  // ── File versioning (browser-based scene persistence) ────────────────────
  // Writes scene to a user-chosen folder via the File System Access API:
  //  - {name}.json          → "current" file, overwritten on change (500ms)
  //  - {name}_TIMESTAMP.json → version snapshots (every 10 min + manual)
  // No server / MongoDB / Git — pure browser file output.
  const fileVersioning = useFileVersioning(scene, {
    interval_ms: 500,
    fallback_ms: 10000,
    snapshot_ms: 600000, // 10 minutes
    baseName: scene.composition.id || 'scene',
  })

  // ── Local UI selection / modal state (not part of scene history) ─────────
  const [selectedLayerId,  setSelectedLayer]  = useState<string | null>('card')
  /** BL-73 — when true, spline primitives append to the selected spline layer
   *  instead of starting a new one (3ds Max "Start New Shape" off). */
  const [splineAppendMode, setSplineAppendMode] = useState(false)
  /** BL-73 — active spline primitive being drawn (null = not drawing). */
  const [splineDrawKind, setSplineDrawKind] = useState<SplinePrimitiveKind | null>(null)
  /** BL-73 Sprint 5 — selected spline point id (mirrored from SceneCanvas) for the point inspector. */
  const [splinePointId, setSplinePointId] = useState<string | null>(null)
  /** Multi-layer selection — primary is selectedLayerId, extras live here. */
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(() => new Set(['card']))
  const [selectedTlId,     setSelectedTl]    = useState<string>('intro')
  const [showJson,        setShowJson]      = useState(false)
  const [showCompModal,   setShowCompModal] = useState(false)
  // BL-05: WireParameterModal state — opened by PropertiesPanel 🔗, WiringListPanel, etc.
  const wireModal = useWireModal()
  const [showHelp,        setShowHelp]      = useState(false)
  const [showAI,          setShowAI]        = useState(false)

  // BL-59 — Clone & Array modals. Source layer is captured at open time
  // so re-selection during the modal session doesn't change the target.
  const [cloneModalSource, setCloneModalSource] = useState<Layer | null>(null)
  const [arrayModalSource, setArrayModalSource] = useState<Layer | null>(null)

  // ── Dock layout (drag-droppable panel tiling) ────────────────────────────
  // The id list must enumerate EVERY panel the registry exposes — the
  // validator rejects a saved tree containing any id outside this set
  // AND requires every id here to be present in the tree. Keep in sync
  // with the registry below.
  const dock = useDockLayout([
    'layers', 'sceneExplorer', 'canvas', 'stateMachine', 'properties', 'timeline', 'curveEditor', 'dopeSheet',
    'curveModifiers',
    'parameters', 'events', 'motionBinding', 'wiring', 'selection', 'runtimePreview', 'assets', 'snap',
    'particles', 'shortcuts',
  ])

  // ── SM sub-mod toggle (BL-09) ────────────────────────────────────────────
  // The State Machine panel shares the canvas leaf as a tab. The toolbar
  // toggle (and Cmd+Shift+M) just switches the active tab — no separate "mode"
  // system. `smModeActive` reflects whichever leaf currently hosts the panel.
  const smLeaf = findLeafOfPanel(dock.layout, 'stateMachine')
  const smModeActive = !!smLeaf && smLeaf.panels[smLeaf.activeIndex] === 'stateMachine'
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
  /** UUID-based keyframe multi-selection — survives drag, persists across renders */
  const [selectedKfIds,   setSelectedKfIds] = useState<Set<string>>(() => new Set())
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
  const assetCache = useAssetCache(scene.assets)

  // Active timeline's work area confines playback to a sub-range when set.
  const activeWorkArea = useMemo(() => {
    const tl = scene.timelines.find((t) => t.id === selectedTlId)
    return { inMs: tl?.workAreaInMs, outMs: tl?.workAreaOutMs }
  }, [scene.timelines, selectedTlId])

  // ── Playback loop ────────────────────────────────────────────────────────
  const {
    currentTimeMs, isPlaying, playbackSpeed,
    handlePlayToggle, handleSeek, setPlaybackSpeed,
  } = usePlayback({
    maxDuration, wrapAtEnd,
    workAreaInMs: activeWorkArea.inMs,
    workAreaOutMs: activeWorkArea.outMs,
  })

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

  // ── Video sync: keep each <video> element in step with the playhead ──────
  useVideoPlaybackSync({ scene, assetCache, currentTimeMs, isPlaying, playbackSpeed })

  // ── Audio engine: separate from canvas (Web Audio API) ───────────────────
  useAudioEngine({ scene, currentTimeMs, isPlaying, playbackSpeed })

  // ── Interactive runtime: parameters / events / segments preview ──────────
  // Ephemeral state — never touches scene tree or undo history. Drives the
  // four "Interactive" panels and the canvas's runtime preview overlay.
  const runtime = useInteractiveRuntime(scene)
  // Per-frame evaluation: merges timeline + binding + param overrides and
  // dispatches lifecycle / trigger events. Re-runs whenever the playhead or
  // any runtime input changes.
  const frame = useMemo(
    () => runtime.evaluateFrame(currentTimeMs),
    // We deliberately include paramValues so slider edits cause a re-eval.
    // runtime.segmentTick increments on every animation frame while a
    // segment is playing — without it the segment freezes at startMs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, currentTimeMs, runtime.paramValues, runtime.segmentState, runtime.segmentTick, runtime.smTestTick],
  )

  /**
   * Click → replace selection. Shift+click → toggle in/out. Keeps the most
   * recently clicked layer as the primary (for PropertiesPanel + keyframe ops).
   */
  const selectLayer = useCallback((id: string | null, shiftHeld = false) => {
    if (id == null) {
      setSelectedLayer(null)
      setSelectedLayerIds(new Set())
      return
    }
    if (!shiftHeld) {
      setSelectedLayer(id)
      setSelectedLayerIds(new Set([id]))
      return
    }
    setSelectedLayerIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    setSelectedLayer(id)
  }, [])

  // ── Universal import pipeline (BL-04–06) ─────────────────────────────────
  // Routes any File through ImportManager → atomic command → dispatch.
  // SVG, Lottie and Chorono-scene imports flow through here; legacy media
  // handlers below still exist for the existing per-type file inputs.
  const {
    importFile: importAnyFile,
    importFiles: importAnyFiles,
    importUrl: importAnyUrl,
    importFromClipboard: importAnyClipboard,
    preview: previewImport,
  } = useImport({
    dispatchCommand,
    onSelectLayer: (id) => selectLayer(id),
  })

  const [showImportUrl, setShowImportUrl] = useState(false)
  // Single-file imports show a preflight preview before committing.
  const [pendingImport, setPendingImport] = useState<{ file: File; preflight: ImportPreflight } | null>(null)

  const handleImportFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 1) {
      const preflight = await previewImport(list[0])
      if (preflight) { setPendingImport({ file: list[0], preflight }); return }
      // Preflight failed — fall back to a direct import attempt.
      void importAnyFile(list[0])
      return
    }
    void importAnyFiles(list)
  }, [previewImport, importAnyFile, importAnyFiles])

  // Programmatic file picker for the File menu "Import File…" entry.
  const openImportPicker = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = IMPORT_ACCEPT
    input.onchange = () => {
      if (input.files && input.files.length > 0) void handleImportFiles(input.files)
    }
    input.click()
  }, [handleImportFiles])

  // ── Layer commands ───────────────────────────────────────────────────────
  // Layer creation is fully registry-driven: every kind looks up its
  // LayerDefinition and calls createDefault(). Adding a new shape no longer
  // requires touching this switch — just register a new LayerDefinition.
  const addLayer = useCallback((kind: string) => {
    // BL-73 — Spline primitives are mouse-drawn, not instantly placed. Clicking
    // one enters draw mode; the canvas handles the create/append gesture.
    const splineKind = SPLINE_MENU_TO_KIND[kind]
    if (splineKind) {
      setSplineDrawKind(splineKind)
      setToolMode('spline-draw')
      return
    }

    const def = layerRegistry.get(kind)
    if (!def) {
      console.warn(`addLayer: unknown layer kind "${kind}"`)
      return
    }
    const l = def.createDefault()
    dispatchCommand(makeAddLayerCmd(l))
    selectLayer(l.id)
    // BL-66: paths start empty — auto-switch to Pen tool so the next click
    // on the canvas places the first anchor.
    if (kind === 'bezierPath' || kind === 'motionPath') {
      setToolMode('pen')
    }
  }, [dispatchCommand, selectLayer])

  // BL-73 Sprint 6 — Convert a text layer into editable spline glyph outlines.
  // Async: lazily fetches + parses the font (opentype.js) before building the
  // granular spline data, then adds it as a new spline layer at the text's pos.
  const convertTextToSpline = useCallback(async () => {
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (layer?.type !== 'text' || !layer.text?.value) return
    try {
      const data = await textToSplineData(layer.text.value, layer.text.fontSize ?? 48)
      if (!data) { toast.info('No drawable glyphs to convert'); return }
      const splineLayer = newSplineLayerFromData(data, {
        name: `${layer.name} Outlines`,
        x: layer.transform.x,
        y: layer.transform.y,
      })
      dispatchCommand(makeAddLayerCmd(splineLayer))
      selectLayer(splineLayer.id)
    } catch (err) {
      toast.error('Text → Spline failed: ' + (err as Error).message)
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

  const deleteLayer = useCallback((id: string) => {
    const layer = scene.layers.find((l) => l.id === id)
    if (!layer) return
    dispatchCommand(makeDeleteLayerCmd(layer))
    if (selectedLayerId === id) selectLayer(null)
  }, [scene.layers, selectedLayerId, dispatchCommand, selectLayer])

  // Which panel last received a pointer-down. Lets the global Delete shortcut
  // act in-context: in the timeline it strips the layer's animation, elsewhere
  // (canvas / layer list) it deletes the layer itself.
  const activePanelRef = useRef<'canvas' | 'timeline' | 'layers' | null>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const inTimeline = !!(e.target as HTMLElement | null)?.closest?.('[data-panel="timeline"]')
      activePanelRef.current = inTimeline ? 'timeline' : 'canvas'
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [])

  // Maps the last-focused panel to a shortcut context so the same key can do
  // different things in the canvas vs the timeline (e.g. S = Scale tool on the
  // canvas, Show Scale track in the timeline). Stable identity (reads a ref).
  const getShortcutContext = useCallback(
    (): ShortcutContext => (activePanelRef.current === 'timeline' ? 'timeline' : 'canvas'),
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
    dispatchCommand(makeToggleLayerCmd(id, field))
  }, [dispatchCommand])

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
    import('@/lib/editor/commands-layer').then(({ makeMoveLayerToCmdWithSnapshot }) => {
      const cmd = makeMoveLayerToCmdWithSnapshot(scene, draggedId, newParentId, toIndex)
      if (cmd) dispatchCommand(cmd)
    })
  }, [scene, dispatchCommand])

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

    // Both are leaves → wrap them in a fresh group via the existing command.
    const { makeGroupCmd } = await import('@/lib/editor/commands-group')
    const cmd = makeGroupCmd([draggedId, targetId])
    dispatchCommand(cmd)
    selectLayer(cmd.groupId)
  }, [scene.layers, dispatchCommand, moveLayerInTree, selectLayer])

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

  const duplicateSelectedLayer = useCallback(() => {
    if (!selectedLayerId) return
    const orig = scene.layers.find((l) => l.id === selectedLayerId)
    if (!orig) return
    const next = cloneLayerForDuplicate(orig)
    // Offset slightly so the duplicate is visible on canvas + later on timeline
    next.transform = { ...next.transform, x: next.transform.x + 20, y: next.transform.y + 20 }
    if (next.startMs != null) next.startMs += 100
    if (next.endMs   != null) next.endMs   += 100
    dispatchCommand(makeDuplicateLayerCmd(orig, next))
    selectLayer(next.id)
  }, [scene.layers, selectedLayerId, dispatchCommand, selectLayer])

  // ── BL-59 — Clone & Array System ──────────────────────────────────────────
  //
  // Three entry points:
  //   • cloneQuick     — one new layer, default offset, no modal. Acts like
  //                       a richer "Duplicate" that also copies animation.
  //   • openCloneModal — opens CloneModal for count + offset + anim toggle.
  //   • openArrayModal — opens ArrayModal (Linear/Grid/Radial).
  //
  // All three resolve the active timeline via `selectedTlId` so cloned
  // animation tracks live alongside the source's existing tracks.

  const getActiveTimeline = useCallback(() => {
    return scene.timelines.find((tl) => tl.id === selectedTlId) ?? null
  }, [scene.timelines, selectedTlId])

  const sourceHasAnimation = useCallback((source: Layer): boolean => {
    const tl = getActiveTimeline()
    if (!tl) return false
    return tl.tracks.some((t) => targetsLayer(t.target, source.id))
  }, [getActiveTimeline])

  const cloneQuick = useCallback(() => {
    if (!selectedLayerId) return
    const source = scene.layers.find((l) => l.id === selectedLayerId)
    if (!source) return
    const cmd = makeCloneCmd({
      source,
      count: 1,
      offsetX: 20,
      offsetY: 20,
      timeline: getActiveTimeline(),
      allLayers: scene.layers,
      duplicateAnimation: true,
    })
    dispatchCommand(cmd)
    // Select the first new clone so subsequent transforms target it.
    const firstNewId = cmd.result.suggestedSelection[0]
    if (firstNewId) selectLayer(firstNewId)
  }, [
    selectedLayerId,
    scene.layers,
    getActiveTimeline,
    dispatchCommand,
    selectLayer,
  ])

  const openCloneModal = useCallback(() => {
    if (!selectedLayerId) return
    const source = scene.layers.find((l) => l.id === selectedLayerId)
    if (!source) return
    setCloneModalSource(source)
  }, [selectedLayerId, scene.layers])

  const openArrayModal = useCallback(() => {
    if (!selectedLayerId) return
    const source = scene.layers.find((l) => l.id === selectedLayerId)
    if (!source) return
    setArrayModalSource(source)
  }, [selectedLayerId, scene.layers])

  const handleCloneApply = useCallback((params: {
    count: number
    offsetX: number
    offsetY: number
    duplicateAnimation: boolean
    mode: import('@/lib/clone/CloneTypes').CloneMode
  }) => {
    if (!cloneModalSource) return
    const cmd = makeCloneCmd({
      source: cloneModalSource,
      count: params.count,
      offsetX: params.offsetX,
      offsetY: params.offsetY,
      timeline: getActiveTimeline(),
      allLayers: scene.layers,
      duplicateAnimation: params.duplicateAnimation,
      mode: params.mode,
    })
    dispatchCommand(cmd)
    const firstNewId = cmd.result.suggestedSelection[0]
    if (firstNewId) selectLayer(firstNewId)
    toast.success(
      `Cloned "${cloneModalSource.name}" — ${cmd.result.createdLayerIds.length} new ${params.mode === 'instance' ? 'instance' : 'layer'}${
        cmd.result.createdLayerIds.length === 1 ? '' : 's'
      }`,
    )
  }, [cloneModalSource, getActiveTimeline, scene.layers, dispatchCommand, selectLayer])

  const handleArrayApply = useCallback((
    settings: import('@/lib/array/ArrayTypes').ArraySettings,
    asRepeater: boolean,
  ) => {
    if (!arrayModalSource) return

    // BL-59 Phase 2 — Non-destructive Repeater Modifier path.
    if (asRepeater) {
      const cmd = makeConvertToRepeaterCmd({
        source: arrayModalSource,
        settings,
      })
      if (cmd) {
        dispatchCommand(cmd)
        toast.success(
          `Converted "${arrayModalSource.name}" to a Repeater Modifier (non-destructive)`,
        )
        return
      }
      toast.warning('Repeater rendering not supported for this pattern — falling back to Array.')
    }

    const cmd = makeArrayCmd({
      source: arrayModalSource,
      settings,
      timeline: getActiveTimeline(),
      allLayers: scene.layers,
    })
    dispatchCommand(cmd)
    const firstNewId = cmd.result.suggestedSelection[0]
    if (firstNewId) selectLayer(firstNewId)
    toast.success(
      `Array "${arrayModalSource.name}" — ${cmd.result.createdLayerIds.length} new layer${
        cmd.result.createdLayerIds.length === 1 ? '' : 's'
      }`,
    )
  }, [arrayModalSource, getActiveTimeline, scene.layers, dispatchCommand, selectLayer])

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
    for (const id of ids) deleteLayer(id)
  }, [copySelectedLayers, selectedLayerIds, selectedLayerId, deleteLayer])

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
    dispatchCommand(makeKeyframeLayerSnapshotCmd(selectedTlId, next, currentTimeMs, toKey))
  }, [selectedTlId, currentTimeMs, dispatchCommand, isAutoKeyActive, scene.timelines])

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
  const keyframeSelectedLayers = useCallback((properties: string[]) => {
    if (!selectedTlId || properties.length === 0) return
    const ids = selectedLayerIds.size > 0
      ? Array.from(selectedLayerIds)
      : (selectedLayerId ? [selectedLayerId] : [])
    for (const id of ids) {
      const layer = scene.layers.find((l) => l.id === id)
      if (!layer) continue
      dispatchCommand(makeKeyframeLayerSnapshotCmd(selectedTlId, layer, currentTimeMs, properties))
    }
  }, [scene.layers, selectedLayerIds, selectedLayerId, selectedTlId, currentTimeMs, dispatchCommand])

  // ── Group / Ungroup (Cmd+G / Cmd+Shift+G) ────────────────────────────────
  const groupSelected = useCallback(async () => {
    const ids = selectedLayerIds.size > 0
      ? Array.from(selectedLayerIds)
      : (selectedLayerId ? [selectedLayerId] : [])
    if (ids.length === 0) return
    const { makeGroupCmd } = await import('@/lib/editor/commands-group')
    const cmd = makeGroupCmd(ids)
    dispatchCommand(cmd)
    selectLayer(cmd.groupId)
    setSelectedLayerIds(new Set([cmd.groupId]))
  }, [selectedLayerIds, selectedLayerId, dispatchCommand, selectLayer])

  // ── Tool mode (Select / Pan / Pen) — driven by top toolbar ──────────────
  const [toolMode, setToolMode] = useState<ToolMode>('select')

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

  // ── Snap settings — lifted from SceneCanvas so the dockable SnapPanel
  //    and the in-canvas SnapMenu share one source of truth. ─────────────
  const snap = useSnapSettings()

  // ── Manual preview-mode toggle (so user can test draggable / tappable
  //    layers without setting up segments / clicking the Preview tab) ──────
  const [manualPreview, setManualPreview] = useState(false)
  // BL-80 — raster image export dialog visibility.
  const [showRasterExport, setShowRasterExport] = useState(false)

  // ── Scene JSON helpers (used by FileMenu) ────────────────────────────────
  const saveSceneJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${scene.composition.id || 'scene'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [scene])

  const copySceneJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(scene, null, 2))
      toast.success('Scene JSON copied to clipboard')
    } catch (err) {
      toast.error('Clipboard write failed', { detail: (err as Error).message })
      console.warn('Clipboard write failed:', err)
    }
  }, [scene])

  const openSceneJson = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        resetScene(parsed)
        selectLayer(null)
        handleSeek(0)
        toast.success(`Loaded scene from ${file.name}`)
      } catch (err) {
        toast.error('Failed to load scene', { detail: (err as Error).message })
      }
    }
    input.click()
  }, [resetScene, selectLayer, handleSeek])

  const newScene = useCallback(() => {
    if (!confirm('Start a new empty scene? Unsaved changes will be lost.')) return
    resetScene(emptyScene())
    selectLayer(null)
    handleSeek(0)
  }, [resetScene, selectLayer, handleSeek])

  // ── Runtime JSON export — runs validator + optimizer + triggers download ─
  const exportRuntimeJson = useCallback(async () => {
    try {
      const { defaultRuntimeExporter, RuntimeExportError } = await import('@/lib/export')
      const pkg = defaultRuntimeExporter.export(scene)
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `chorono-runtime-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Runtime JSON exported', {
        detail: pkg.warnings.length > 0
          ? `${pkg.warnings.length} warning(s) — check console`
          : `${scene.layers.length} layers, ${scene.timelines.length} timelines`,
      })
      if (pkg.warnings.length > 0) {
        console.info(`Runtime export: ${pkg.warnings.length} warning(s)`, pkg.warnings)
      }
    } catch (err: any) {
      if (err?.name === 'RuntimeExportError') {
        const errMsg = err.validation.errors.map((e: any) => '• ' + e.message).join('\n')
        toast.error('Runtime export validation failed', { detail: errMsg, duration: 8000 })
        console.error('Runtime export validation failed:', err.validation)
      } else {
        toast.error('Runtime export error', { detail: err?.message ?? String(err) })
        console.error('Runtime export error:', err)
      }
    }
  }, [scene])

  const ungroupSelected = useCallback(async () => {
    if (!selectedLayerId) return
    const target = scene.layers.find(l => l.id === selectedLayerId)
    if (!target || target.type !== 'group') return
    const { makeUngroupCmd } = await import('@/lib/editor/commands-group')
    const cmd = makeUngroupCmd(scene, selectedLayerId)
    if (cmd) dispatchCommand(cmd)
  }, [scene, selectedLayerId, dispatchCommand])

  const updateComposition = useCallback((comp: typeof scene.composition) => {
    const prev = scene
    dispatchCommand({
      label: 'Update Composition',
      execute: (s) => ({ ...s, composition: comp }),
      undo:    () => prev,
    })
  }, [scene, dispatchCommand])

  // ── Keyframe clipboard (Cmd+C / Cmd+V) ──────────────────────────────────
  const clipboard = useKeyframeClipboard({
    scene, selectedKfIds, selectedTimelineId: selectedTlId,
    currentTimeMs, dispatchCommand,
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
    if (selectedKfIds.size === 0) return false
    const items: KfDeletion[] = []
    for (const tl of scene.timelines) {
      for (const track of tl.tracks) {
        for (const kf of track.keyframes) {
          if (selectedKfIds.has(kf.id)) {
            items.push({ timelineId: tl.id, target: track.target, kf })
          }
        }
      }
    }
    if (items.length === 0) return false
    dispatchCommand(makeBulkDeleteKfCmd(items))
    setSelectedKfIds(new Set())
    return true
  }, [selectedKfIds, scene.timelines, dispatchCommand])

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
    if (!selectedLayerId) return
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    const tl = scene.timelines.find((t) => t.id === selectedTlId)
    if (!layer || !tl) return
    const paths = TIMELINE_PROP_PATHS[prop]
    const TOL = 1 // ms — treat a keyframe within 1ms of the playhead as "here"
    const existing: KfDeletion[] = []
    let allKeyed = true
    for (const path of paths) {
      const target = `layers.${layer.id}.${path}`
      const track = tl.tracks.find((t) => t.target === target)
      const kf = track?.keyframes.find((k) => Math.abs(k.timeMs - currentTimeMs) <= TOL)
      if (kf) existing.push({ timelineId: tl.id, target, kf })
      else allKeyed = false
    }
    if (allKeyed && existing.length > 0) {
      dispatchCommand(makeBulkDeleteKfCmd(existing)) // toggle OFF
    } else {
      dispatchCommand(makeKeyframeLayerSnapshotCmd(tl.id, layer, currentTimeMs, paths)) // toggle ON
    }
  }, [selectedLayerId, scene.layers, scene.timelines, selectedTlId, currentTimeMs, dispatchCommand, TIMELINE_PROP_PATHS])

  // P/S/R/T/U — reveal a property in the timeline (filters track rows to that
  // property; 'all' shows only animated tracks). The nonce makes each press
  // distinct so the TimelinePanel effect re-fires (and toggles) every time.
  const [revealProperty, setRevealProperty] =
    useState<{ prop: TimelineProperty | 'all'; nonce: number } | null>(null)
  const revealTimelineProperty = useCallback((prop: TimelineProperty | 'all') => {
    setRevealProperty((prev) => ({ prop, nonce: (prev?.nonce ?? 0) + 1 }))
  }, [])

  // J / K — seek to the previous / next keyframe time across the selected
  // layer's tracks on the active timeline.
  const seekToKeyframe = useCallback((direction: 'prev' | 'next') => {
    if (!selectedLayerId) return
    const tl = scene.timelines.find((t) => t.id === selectedTlId)
    if (!tl) return
    const prefix = `layers.${selectedLayerId}.`
    const times = new Set<number>()
    for (const track of tl.tracks) {
      if (!track.target.startsWith(prefix)) continue
      for (const kf of track.keyframes) times.add(kf.timeMs)
    }
    if (times.size === 0) return
    const sorted = Array.from(times).sort((a, b) => a - b)
    const next = direction === 'next'
      ? sorted.find((t) => t > currentTimeMs + 0.5)
      : [...sorted].reverse().find((t) => t < currentTimeMs - 0.5)
    if (next !== undefined) handleSeek(next)
  }, [selectedLayerId, scene.timelines, selectedTlId, currentTimeMs, handleSeek])

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useKeyboard({
    onUndo: undo,
    onRedo: redo,
    onPlayToggle: handlePlayToggle,
    onStepBack:    (frames) => handleSeek(Math.max(0, currentTimeMs - (frames * 1000) / frameRate)),
    onStepForward: (frames) => handleSeek(Math.min(maxDuration, currentTimeMs + (frames * 1000) / frameRate)),
    onDeleteSelected: () => {
      // Prefer deleting selected keyframes (timeline focus) over the layer.
      if (deleteSelectedKeyframes()) return
      if (!selectedLayerId) return
      // In the timeline, Delete clears the layer's animation but keeps the
      // object; in the canvas / layer list it deletes the layer itself.
      if (activePanelRef.current === 'timeline') deleteLayerAnimation(selectedLayerId)
      else deleteLayer(selectedLayerId)
    },
    onDuplicateSelected: duplicateSelectedLayer,
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
    onToolChange:      setToolMode,
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
      { id: 'timeline',       title: 'Timeline',       render: () => null },
      { id: 'curveEditor',    title: 'Curve Editor',   render: () => null },
      { id: 'dopeSheet',      title: 'Dope Sheet',     render: () => null },
      { id: 'curveModifiers', title: 'Modifiers',      render: () => null },
      { id: 'parameters',     title: 'Parameters',     render: () => null },
      { id: 'events',         title: 'Events',         render: () => null },
      { id: 'motionBinding',  title: 'Bindings',       render: () => null },
      { id: 'wiring',         title: 'Wires',          render: () => null },
      { id: 'selection',      title: 'Select',         render: () => null },
      { id: 'runtimePreview', title: 'Preview',        render: () => null },
      { id: 'assets',         title: 'Assets',         render: () => null },
      { id: 'snap',           title: 'Snap',           render: () => null },
      { id: 'particles',      title: 'Particle',       render: () => null },
      { id: 'scriptConsole',  title: 'Script',         render: () => null },
      { id: 'shortcuts',      title: 'Shortcuts',      render: () => null },
    ]
    return makeRegistry(defs)
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200 overflow-hidden">

      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 bg-gray-900 shrink-0">
        <FileMenu
          filename={scene.composition.id}
          onRename={(next) => updateComposition({ ...scene.composition, id: next })}
          onNewScene={newScene}
          onImportFile={openImportPicker}
          onImportUrl={() => setShowImportUrl(true)}
          onImportClipboard={() => { void importAnyClipboard() }}
          onOpenSceneJson={openSceneJson}
          onSaveSceneJson={saveSceneJson}
          onExportRuntime={exportRuntimeJson}
          onExportImage={() => setShowRasterExport(true)}
          onCopySceneJson={copySceneJson}
          onShowShortcuts={() => setShowHelp(true)}
          onResetLayout={dock.resetLayout}
          panelRegistry={panelRegistry}
          dockLayout={dock.layout}
          onRestorePanel={dock.dispatchRestorePanel}
        />

        <div className="w-px h-6 bg-gray-700 mx-1" />

        <ToolGroup
          mode={toolMode}
          onChange={setToolMode}
          penAuto={!!(scene.layers.find(l => l.id === selectedLayerId)?.type === 'path')}
          containMode={selectionContainMode}
          onContainModeChange={setSelectionContainMode}
        />

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* ── Animation / State-Machine sub-mod (BL-09) ──────────────────── */}
        <div className="flex items-center rounded bg-gray-800 p-0.5" title="Toggle State Machine view (Cmd+Shift+M)">
          <button
            onClick={() => { if (smModeActive) toggleSMMode() }}
            className={`px-2 py-1 text-xs rounded ${!smModeActive ? 'bg-gray-600 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
          >
            ● Animation
          </button>
          <button
            onClick={() => { if (!smModeActive) toggleSMMode() }}
            className={`px-2 py-1 text-xs rounded ${smModeActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            ◇ SM
          </button>
        </div>

        {/* ── Spline creation mode (BL-73) ───────────────────────────────── */}
        <div className="flex items-center rounded bg-gray-800 p-0.5" title="Spline: start a new layer, or append the next spline primitive into the selected spline layer">
          <button
            onClick={() => setSplineAppendMode(false)}
            className={`px-2 py-1 text-xs rounded ${!splineAppendMode ? 'bg-gray-600 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
          >
            ↳ New Spline
          </button>
          <button
            onClick={() => setSplineAppendMode(true)}
            disabled={selectedLayer?.type !== 'spline'}
            title={selectedLayer?.type !== 'spline' ? 'Select a spline layer to enable append mode' : 'Append next spline primitive into selected layer'}
            className={`px-2 py-1 text-xs rounded disabled:opacity-40 disabled:cursor-not-allowed ${splineAppendMode ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            ⊕ Append
          </button>
        </div>

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

        {/* ── Group / Ungroup ────────────────────────────────────────────────
            Always rendered (so the toolbar layout doesn't reflow as the
            selection changes) but disabled when not actionable. Group needs
            2+ selected layers; Ungroup needs the primary selection to be
            a group layer. */}
        <div className="w-px h-6 bg-gray-700 mx-1" />
        <button
          onClick={groupSelected}
          disabled={selectedLayerIds.size < 2}
          title="Group selected (Cmd+G)"
          className="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300
                     disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <span className="text-[11px]">▣</span>
          <span>Group</span>
        </button>
        <button
          onClick={ungroupSelected}
          disabled={selectedLayer?.type !== 'group'}
          title="Ungroup (Cmd+Shift+G) — animations preserved"
          className="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300
                     disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <span className="text-[11px]">⊟</span>
          <span>Ungroup</span>
        </button>

        <span className="text-xs text-gray-500 font-mono ml-auto">
          {scene.composition.width}×{scene.composition.height}
          {' · '}{scene.layers.length} layers
          {' · '}{scene.timelines.length} timelines
        </span>

        {/* File versioning: choose folder + auto-save + timestamped snapshots */}
        <FileVersioningControl
          mounted={fileVersioning.mounted}
          state={fileVersioning.state}
          directoryName={fileVersioning.directoryName}
          lastSavedAt={fileVersioning.lastSavedAt}
          snapshotCount={fileVersioning.snapshotCount}
          isSupported={fileVersioning.isSupported}
          onPickDirectory={fileVersioning.pickDirectory}
          onSaveSnapshot={fileVersioning.saveSnapshotNow}
        />

        {/* Preview Mode toggle — when ON, draggable/tappable layers respond
            interactively on the canvas (no segment / preview tab needed). */}
        <button
          onClick={() => setManualPreview(v => !v)}
          title={manualPreview
            ? 'Exit preview — back to editing'
            : 'Enter preview — draggable / tappable layers become interactive on the canvas'}
          className={`px-3 py-1.5 text-xs rounded font-medium transition-colors flex items-center gap-1.5
            ${manualPreview
              ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
        >
          {manualPreview ? <>⏹ Exit Preview</> : <>▶ Preview</>}
        </button>

        {/* AI Planner toggle — chat panel for natural-language animation control */}
        <button
          onClick={() => setShowAI((v) => !v)}
          title="AI Planner (right side chat panel)"
          className={`px-3 py-1.5 text-xs rounded font-medium transition-colors flex items-center gap-1.5
            ${showAI
              ? 'bg-purple-500 hover:bg-purple-400 text-white'
              : 'bg-purple-700 hover:bg-purple-600 text-white'}`}
        >
          🤖 AI
        </button>

        {/* Panel registry is created below — passed here via context/props */}
        {/* Primary export — rest live inside FileMenu */}
        <button
          onClick={() => setShowJson(true)}
          title="Inspect raw scene JSON"
          className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
        >
          {'{ }'} JSON
        </button>
        <button
          onClick={exportRuntimeJson}
          title="Validate scene + emit lean runtime JSON for Android/iOS/Web players"
          className="px-3 py-1.5 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
        >
          ⤓ Runtime
        </button>
      </header>

      {/* ── Dockable work area ─────────────────────────────────────── */}
      <DockDragProvider onDrop={dock.dispatchDrop}>
        <div ref={dockContainerRef} className="flex-1 min-h-0 relative">
          {!fullscreenCanvas && <DockOuterEdges containerRef={dockContainerRef} />}
          {(() => {
            const registry = makeRegistry([
              {
                id: 'layers', title: 'Layers',
                render: () => (
                  <LayerPanel
                    layers={scene.layers}
                    selectedId={selectedLayerId}
                    selectedIds={selectedLayerIds}
                    onSelect={selectLayer}
                    onAdd={addLayer}
                    onAddImage={addImageLayerFromFile}
                    onAddVideo={addVideoLayerFromFile}
                    onImportSvg={importSvgFile}
                    onAddAudio={addAudioLayerFromFile}
                    onDelete={deleteLayer}
                    onReorder={reorderLayer}
                    onMoveInTree={moveLayerInTree}
                    onGroupWith={groupLayersByDrop}
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
                    onDuplicate={(layerId) => {
                      const orig = scene.layers.find((l) => l.id === layerId)
                      if (!orig) return
                      const next = cloneLayerForDuplicate(orig)
                      next.transform = { ...next.transform, x: next.transform.x + 20, y: next.transform.y + 20 }
                      if (next.startMs != null) next.startMs += 100
                      if (next.endMs   != null) next.endMs   += 100
                      dispatchCommand(makeDuplicateLayerCmd(orig, next))
                    }}
                  />
                ),
              },
              {
                // BL-52 — Scene Explorer (column-aware successor to LayerPanel).
                // Kept side-by-side with LayerPanel so users can A/B during the
                // foundation phase. BL-58 will remove the old LayerPanel entry.
                id: 'sceneExplorer', title: 'Scene Explorer',
                render: () => (
                  <SceneExplorerPanel
                    layers={scene.layers}
                    timeline={selectedTimelineForGhost}
                    selectedId={selectedLayerId}
                    selectedIds={selectedLayerIds}
                    onSelect={(id, shift, _meta) => selectLayer(id, shift)}
                    onRename={renameLayer}
                    onToggleFlag={toggleLayerFlag}
                    onMoveInTree={moveLayerInTree}
                    onGroupWith={groupLayersByDrop}
                    onClearSelection={() => selectLayer(null)}
                    contextHandlers={{
                      // Rename re-uses the inline editor — selecting the
                      // layer first lets the panel know which row to put
                      // into edit mode (handled inside the panel via key).
                      rename: (id) => { selectLayer(id); /* panel's "rename" entry triggers F2-style edit in BL-58 polish */ },
                      duplicate: (id) => {
                        const orig = scene.layers.find((l) => l.id === id)
                        if (!orig) return
                        const next = cloneLayerForDuplicate(orig)
                        next.transform = { ...next.transform, x: next.transform.x + 20, y: next.transform.y + 20 }
                        if (next.startMs != null) next.startMs += 100
                        if (next.endMs   != null) next.endMs   += 100
                        dispatchCommand(makeDuplicateLayerCmd(orig, next))
                      },
                      deleteLayers: (ids) => ids.forEach((id) => deleteLayer(id)),
                      groupLayers: (ids) => {
                        if (ids.length === 0) return
                        // groupSelected uses the selection state directly,
                        // so make sure it matches what the menu opened on.
                        setSelectedLayerIds(new Set(ids))
                        setSelectedLayer(ids[0])
                        groupSelected()
                      },
                      ungroupGroup: (id) => {
                        if (selectedLayerId !== id) selectLayer(id)
                        ungroupSelected()
                      },
                      setColorLabel: (ids, color) => {
                        dispatchCommand(makeBulkUpdateLayersCmd(ids, { colorLabel: color ?? undefined }, color ? 'Set color label' : 'Clear color label'))
                      },
                      bulkToggleFlag: (ids, field, nextValue) => {
                        dispatchCommand(makeBulkToggleFlagCmd(ids, field, nextValue))
                      },
                      isolate: (ids) => dispatchCommand(makeIsolateLayersCmd(ids)),
                      showAll: () => dispatchCommand(makeShowAllLayersCmd()),
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
                  <SceneCanvas
                    scene={scene}
                    editor={editor}
                    timeMs={currentTimeMs}
                    selectedLayerId={selectedLayerId}
                    selectedLayerIds={selectedLayerIds}
                    assets={assetCache}
                    onSelectLayer={(id) => selectLayer(id)}
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
                    onPanModeChange={(next) => setToolMode(next ? 'pan' : 'select')}
                    toolMode={toolMode}
                    onToolModeChange={setToolMode}
                    splineDrawKind={splineDrawKind}
                    splineAppendTargetId={
                      splineAppendMode && selectedLayer?.type === 'spline' ? selectedLayerId : null
                    }
                    onSplineDrawCommit={() => { setSplineDrawKind(null); setToolMode('select') }}
                    onSplinePointSelected={setSplinePointId}
                    snap={snap}
                    onSelectByGeometry={(ids, mode) => {
                      // BL-60 Faz 3 — canvas selection tools commit. Plain
                      // drag replaces selection; Shift adds; Alt subtracts.
                      let next: Set<string>
                      if (mode === 'replace') {
                        next = new Set(ids)
                      } else if (mode === 'add') {
                        next = new Set(selectedLayerIds)
                        ids.forEach((id) => next.add(id))
                      } else {
                        next = new Set(selectedLayerIds)
                        ids.forEach((id) => next.delete(id))
                      }
                      setSelectedLayerIds(next)
                      const first = next.values().next().value
                      setSelectedLayer(first ?? null)
                    }}
                    selectionContainMode={selectionContainMode}
                    fullscreen={fullscreenCanvas}
                    onToggleFullscreen={() => setFullscreenCanvas((v) => !v)}
                    onAfterLayerCommit={autoKeyChangedProps}
                    ghostSettings={ghostSettings}
                    selectedTimeline={selectedTimelineForGhost}
                    pathPickMode={pathPickMode}
                    onAssignPath={(targetId, pathId) => {
                      assignMotionPathToLayer(targetId, pathId)
                      setPathPickMode(null)
                    }}
                    onExitPathPickMode={() => setPathPickMode(null)}
                    menuHandlers={{
                      cut:        cutSelectedLayers,
                      copy:       copySelectedLayers,
                      paste:      pasteLayers,
                      canPaste:   hasClipboard,
                      duplicate:  duplicateSelectedLayer,
                      group:      groupSelected,
                      ungroup:    ungroupSelected,
                      canUngroup: selectedLayer?.type === 'group',
                      deleteLayer: () => selectedLayerId && deleteLayer(selectedLayerId),
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
                      convertToSpline: undefined,
                      // BL-73 Sprint 6 — Text → editable spline glyph outlines.
                      convertTextToSpline: selectedLayer?.type === 'text' ? convertTextToSpline : undefined,
                      // BL-59 — Clone & Array context-menu entries
                      cloneQuick:    cloneQuick,
                      cloneSettings: openCloneModal,
                      arraySettings: openArrayModal,
                      selectAllInArray: (layerId: string) => {
                        const siblings = getSiblingsInArray(layerId)
                        if (siblings.length <= 1) return
                        setSelectedLayerIds(new Set(siblings))
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
                  />
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
                    <PropertiesPanel
                      layer={selectedLayer}
                      composition={scene.composition}
                      onLayerChange={updateLayer}
                      onCompositionChange={updateComposition}
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
                    {selectedLayer?.type === 'spline' && splinePointId && (
                      <SplinePointInspector
                        layer={selectedLayer}
                        pointId={splinePointId}
                        dispatchCommand={dispatchCommand}
                      />
                    )}
                    {selectedKfIds.size > 0 && (
                      <KeyframeInspector
                        scene={scene}
                        selectedKfIds={selectedKfIds}
                        editor={editor}
                      />
                    )}
                  </div>
                ),
              },
              {
                id: 'timeline', title: 'Timeline',
                render: () => (
                  <div className="h-full bg-gray-900 overflow-hidden" data-panel="timeline">
                    <TimelinePanel
                      scene={scene}
                      editor={editor}
                      settings={timelineSettings}
                      onSettingsChange={setTimelineSettings}
                      selectedLayerId={selectedLayerId}
                      selectedLayerIds={selectedLayerIds}
                      selectedTimelineId={selectedTlId}
                      selectedKfIds={selectedKfIds}
                      currentTimeMs={currentTimeMs}
                      isPlaying={isPlaying}
                      playbackSpeed={playbackSpeed}
                      onTimeChange={handleSeek}
                      onPlayToggle={handlePlayToggle}
                      onSelectTimeline={setSelectedTl}
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
                    />
                  </div>
                ),
              },
              {
                id: 'curveEditor', title: 'Curve Editor',
                render: () => (
                  <CurveEditor
                    scene={scene}
                    editor={editor}
                    selectedLayerId={selectedLayerId}
                    selectedTimelineId={selectedTlId}
                    currentTimeMs={currentTimeMs}
                    onTimeChange={handleSeek}
                    selectedKfIds={selectedKfIds}
                    onSelectKeyframes={setSelectedKfIds}
                  />
                ),
              },
              {
                id: 'dopeSheet', title: 'Dope Sheet',
                render: () => (
                  <DopeSheetPanel
                    scene={scene}
                    editor={editor}
                    settings={timelineSettings}
                    onSettingsChange={setTimelineSettings}
                    selectedLayerId={selectedLayerId}
                    selectedTimelineId={selectedTlId}
                    selectedKfIds={selectedKfIds}
                    currentTimeMs={currentTimeMs}
                    isPlaying={isPlaying}
                    onTimeChange={handleSeek}
                    onSelectKeyframes={setSelectedKfIds}
                    onSelectLayer={selectLayer}
                  />
                ),
              },
              {
                id: 'curveModifiers', title: 'Modifiers',
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
                      // Mirror the multi-select flow used by the lasso: set
                      // selectedLayerIds + bump primary to the first hit.
                      setSelectedLayerIds(ids)
                      const first = ids.values().next().value
                      if (first) setSelectedLayer(first)
                    }}
                  />
                ),
              },
              {
                id: 'runtimePreview', title: 'Preview',
                render: () => <RuntimePreviewPanel scene={scene} runtime={runtime} />,
              },
              {
                id: 'assets', title: 'Assets',
                render: () => (
                  <AssetsPanel
                    scene={scene}
                    editor={editor}
                    onSelectLayer={(id) => selectLayer(id)}
                    onImportFiles={handleImportFiles}
                  />
                ),
              },
              {
                id: 'snap', title: 'Snap',
                render: () => <SnapPanel snap={snap} />,
              },
              {
                id: 'shortcuts', title: 'Shortcuts',
                render: () => <KeyboardShortcutsPanel />,
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
                // BL-76 — Authoring Script REPL (JS host + scene API facade).
                id: 'scriptConsole', title: 'Script',
                render: () => (
                  <ScriptConsolePanel
                    getScene={() => scene}
                    dispatchCommand={dispatchCommand}
                  />
                ),
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
      </DockDragProvider>

      {/* ── JSON Modal ─────────────────────────────────────────────── */}
      {showJson && <JsonModal scene={scene} onClose={() => setShowJson(false)} />}

      {/* ── Composition Preset Modal ───────────────────────────────── */}
      {showCompModal && (
        <CompositionPresetModal
          composition={scene.composition}
          onApply={updateComposition}
          onClose={() => setShowCompModal(false)}
        />
      )}

      {/* ── Shortcut Help Modal ────────────────────────────────────── */}
      {showHelp && <ShortcutHelpModal onClose={() => setShowHelp(false)} />}

      {/* ── BL-80 Raster image export (PNG / WEBP / JPEG) ─────────────── */}
      {showRasterExport && (
        <RasterExportDialog
          scene={scene}
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

      {/* ── Import from URL (BL-09) ──────────────────────────────────── */}
      {showImportUrl && (
        <ImportUrlModal
          onImport={(url) => { void importAnyUrl(url) }}
          onClose={() => setShowImportUrl(false)}
        />
      )}

      {/* ── Import preflight preview (BL-09) ──────────────────────────── */}
      {pendingImport && (
        <ImportPreviewModal
          fileName={pendingImport.file.name}
          preflight={pendingImport.preflight}
          onConfirm={() => { void importAnyFile(pendingImport.file); setPendingImport(null) }}
          onCancel={() => setPendingImport(null)}
        />
      )}

      {/* ── BL-59 Clone Modal ──────────────────────────────────────── */}
      {cloneModalSource && (
        <CloneModal
          source={cloneModalSource}
          hasAnimationOnSource={sourceHasAnimation(cloneModalSource)}
          onApply={handleCloneApply}
          onClose={() => setCloneModalSource(null)}
        />
      )}

      {/* ── BL-59 Array Modal ──────────────────────────────────────── */}
      {arrayModalSource && (
        <ArrayModal
          source={arrayModalSource}
          hasAnimationOnSource={sourceHasAnimation(arrayModalSource)}
          allLayers={scene.layers}
          onApply={handleArrayApply}
          onClose={() => setArrayModalSource(null)}
        />
      )}

      {/* ── AI Planner side panel ──────────────────────────────────── */}
      {showAI && (
        <AIPanel
          scene={scene}
          dispatchCommand={dispatchCommand}
          currentTimeMs={currentTimeMs}
          selectedLayerId={selectedLayerId}
          selectedTimelineId={selectedTlId}
          onClose={() => setShowAI(false)}
        />
      )}

      {/* ── BL-05: Wire Parameter modal (formula-driven parameter wiring) ── */}
      {wireModal.isOpen && (
        <WireParameterModal
          scene={scene}
          editor={editor}
          existingWire={wireModal.editWire}
          preFilledTarget={wireModal.newTarget}
          onClose={wireModal.close}
        />
      )}

      {/* ── Toast notifications (lives above everything) ───────────── */}
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
