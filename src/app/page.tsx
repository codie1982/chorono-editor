'use client'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { Layer, ChronoScene, TimelineSettings } from '@/lib/types'
import { DEFAULT_TIMELINE_SETTINGS } from '@/lib/types'
import {
  emptyScene, newRectLayer, newCircleLayer, newTextLayer,
  newImageLayer, newVideoLayer, newAudioLayer, newTimeline,
  newPathStrokeLayer,
  cloneLayerForDuplicate,
} from '@/lib/defaults'
import { computeTimelineCycleEnd, hasInfinitePlayback } from '@/lib/evaluator'
import { useEditorState }      from './hooks/useEditorState'
import { usePlayback }         from './hooks/usePlayback'
import { useKeyboard }         from './hooks/useKeyboard'
import { useKeyframeClipboard } from './hooks/useKeyframeClipboard'
import { useAssetCache }       from './hooks/useAssetCache'
import { useVideoPlaybackSync } from './hooks/useVideoPlaybackSync'
import { useAudioEngine }      from './hooks/useAudioEngine'
import { useInteractiveRuntime } from './hooks/useInteractiveRuntime'
import {
  makeAddLayerCmd, makeDeleteLayerCmd, makeUpdateLayerCmd, makeToggleLayerCmd,
  makeDuplicateLayerCmd, makeMoveLayerCmd,
} from '@/lib/editor/commands-layer'
import { makeBulkDeleteKfCmd, type KfDeletion } from '@/lib/editor/commands-keyframe'
import { ANIMATION_PRESETS } from '@/lib/timeline/presets'
import LayerPanel      from '@/components/LayerPanel'
import SceneCanvas     from '@/components/SceneCanvas'
import PropertiesPanel from '@/components/PropertiesPanel'
import TimelinePanel   from '@/components/TimelinePanel'
import JsonModal       from '@/components/JsonModal'
import KeyframeInspector from '@/components/panels/KeyframeInspector'
import ParametersPanel     from '@/components/panels/ParametersPanel'
import EventsPanel         from '@/components/panels/EventsPanel'
import MotionBindingPanel  from '@/components/panels/MotionBindingPanel'
import RuntimePreviewPanel from '@/components/panels/RuntimePreviewPanel'
import DockLayout       from '@/components/dock/DockLayout'
import DockOuterEdges   from '@/components/dock/DockOuterEdges'
import { DockDragProvider } from '@/components/dock/dragContext'
import { useDockLayout } from '@/components/dock/useDockLayout'
import { makeRegistry, type PanelDefinition } from '@/components/dock/registry'
import CompositionPresetModal from '@/components/modals/CompositionPresetModal'
import ShortcutHelpModal      from '@/components/modals/ShortcutHelpModal'

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
    transform: { x: 130, y: 128, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 42, anchorY: 11 },
    opacity: 0,
    text: { value: 'Chorono', fontSize: 22, color: '#FFFFFF' },
  }
  s.layers = [card, label]

  const tl = newTimeline()
  Object.assign(tl, { id: 'intro', durationMs: 600, autoplay: true })
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
  // ── Central scene state with history + transactions ──────────────────────
  const editor = useEditorState(makeDemoScene())
  const { scene, canUndo, canRedo, dispatchCommand, resetScene, undo, redo } = editor

  // ── Local UI selection / modal state (not part of scene history) ─────────
  const [selectedLayerId,  setSelectedLayer]  = useState<string | null>('card')
  /** Multi-layer selection — primary is selectedLayerId, extras live here. */
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(() => new Set(['card']))
  const [selectedTlId,     setSelectedTl]    = useState<string>('intro')
  const [showJson,        setShowJson]      = useState(false)
  const [showCompModal,   setShowCompModal] = useState(false)
  const [showHelp,        setShowHelp]      = useState(false)

  // ── Dock layout (drag-droppable panel tiling) ────────────────────────────
  // The id list is the contract validated against the persisted tree —
  // mismatches reset back to the default layout (recovery from corrupt state).
  const dock = useDockLayout(['layers', 'canvas', 'properties', 'timeline'])
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

  // ── Asset cache: loads images/videos referenced in scene.assets ──────────
  const assetCache = useAssetCache(scene.assets)

  // ── Playback loop ────────────────────────────────────────────────────────
  const {
    currentTimeMs, isPlaying, playbackSpeed,
    handlePlayToggle, handleSeek, setPlaybackSpeed,
  } = usePlayback({ maxDuration, wrapAtEnd })

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, currentTimeMs, runtime.paramValues, runtime.segmentState],
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

  // ── Layer commands ───────────────────────────────────────────────────────
  const addLayer = useCallback((kind: 'rect' | 'circle' | 'text' | 'pathStroke') => {
    const l =
        kind === 'rect'        ? newRectLayer()
      : kind === 'circle'      ? newCircleLayer()
      : kind === 'pathStroke'  ? newPathStrokeLayer()
      :                          newTextLayer()
    dispatchCommand(makeAddLayerCmd(l))
    selectLayer(l.id)
  }, [dispatchCommand, selectLayer])

  /**
   * Probe an asset file via a hidden element to get its natural dimensions
   * and duration, then wrap the asset + layer creation in one undo step.
   */
  const probeAndAddMedia = useCallback((
    file: File,
    kind: 'image' | 'video' | 'audio',
  ) => {
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const url     = URL.createObjectURL(file)
    const prev    = scene

    const commit = (info: { width?: number; height?: number; durationMs?: number }) => {
      const layer =
        kind === 'image' ? newImageLayer(assetId, info.width ?? 200, info.height ?? 150)
      : kind === 'video' ? newVideoLayer(assetId, info.width ?? 320, info.height ?? 180, info.durationMs)
      :                    newAudioLayer(assetId, info.durationMs)

      dispatchCommand({
        label: `Add ${kind}`,
        execute: (s) => ({
          ...s,
          assets: [...s.assets, {
            id: assetId, name: file.name, type: kind, url,
            width: info.width, height: info.height, durationMs: info.durationMs,
          }],
          layers: [...s.layers, layer],
        }),
        // Asset cache hook revokes blob URL automatically when scene.assets shrinks
        undo: () => prev,
      })
      selectLayer(layer.id)
    }

    if (kind === 'image') {
      const img = new Image()
      img.onload  = () => commit({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => { URL.revokeObjectURL(url); console.error('image load failed:', file.name) }
      img.src = url
      return
    }

    if (kind === 'video') {
      const v = document.createElement('video')
      v.preload  = 'metadata'
      v.muted    = true
      v.onloadedmetadata = () => commit({
        width: v.videoWidth, height: v.videoHeight,
        durationMs: Number.isFinite(v.duration) ? v.duration * 1000 : undefined,
      })
      v.onerror = () => { URL.revokeObjectURL(url); console.error('video load failed:', file.name) }
      v.src = url
      return
    }

    // audio
    const a = document.createElement('audio')
    a.preload  = 'metadata'
    a.onloadedmetadata = () => commit({
      durationMs: Number.isFinite(a.duration) ? a.duration * 1000 : undefined,
    })
    a.onerror = () => { URL.revokeObjectURL(url); console.error('audio load failed:', file.name) }
    a.src = url
  }, [scene, dispatchCommand, selectLayer])

  const addImageLayerFromFile = useCallback((file: File) => probeAndAddMedia(file, 'image'), [probeAndAddMedia])
  const addVideoLayerFromFile = useCallback((file: File) => probeAndAddMedia(file, 'video'), [probeAndAddMedia])
  const addAudioLayerFromFile = useCallback((file: File) => probeAndAddMedia(file, 'audio'), [probeAndAddMedia])

  const deleteLayer = useCallback((id: string) => {
    const layer = scene.layers.find((l) => l.id === id)
    if (!layer) return
    dispatchCommand(makeDeleteLayerCmd(layer))
    if (selectedLayerId === id) selectLayer(null)
  }, [scene.layers, selectedLayerId, dispatchCommand, selectLayer])

  const toggleLayerFlag = useCallback((id: string, field: 'locked' | 'hidden' | 'solo') => {
    dispatchCommand(makeToggleLayerCmd(id, field))
  }, [dispatchCommand])

  const reorderLayer = useCallback((from: number, to: number) => {
    if (from === to) return
    const layer = scene.layers[from]
    if (!layer) return
    dispatchCommand(makeMoveLayerCmd(layer.id, from, to))
  }, [scene.layers, dispatchCommand])

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

  const updateLayer = useCallback((next: Layer) => {
    const prev = scene.layers.find((l) => l.id === next.id)
    if (!prev) return
    dispatchCommand(makeUpdateLayerCmd(next.id, next, prev))
  }, [scene.layers, dispatchCommand])

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
      if (selectedLayerId) deleteLayer(selectedLayerId)
    },
    onDuplicateSelected: duplicateSelectedLayer,
    onCopy:  () => clipboard.copySelected(),
    onPaste: () => {
      const pastedIds = clipboard.pasteAtPlayhead()
      if (pastedIds.size > 0) setSelectedKfIds(pastedIds)
    },
    onShowHelp: () => setShowHelp(true),
    frameRate,
  })

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200 overflow-hidden">

      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-700 bg-gray-900 shrink-0">
        <span className="text-blue-400 text-lg">🎬</span>
        <span className="font-semibold text-sm text-gray-100">Chorono Builder</span>
        <span className="text-xs text-gray-500 font-mono">v0.1</span>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        <input
          type="text"
          value={scene.composition.id}
          onChange={(e) => updateComposition({ ...scene.composition, id: e.target.value })}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200
                     focus:outline-none focus:border-blue-500 w-32"
          placeholder="composition id"
        />
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

        <span className="text-xs text-gray-500 font-mono ml-auto">
          {scene.composition.width}×{scene.composition.height}
          {' · '}{scene.layers.length} layers
          {' · '}{scene.timelines.length} timelines
        </span>

        <button
          onClick={() => setShowJson(true)}
          className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
        >
          {'{ }'} Export JSON
        </button>

        <button
          onClick={dock.resetLayout}
          title="Reset panel layout to default"
          className="px-2.5 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-400 font-medium"
        >
          ⊞ Reset
        </button>

        <button
          onClick={() => setShowHelp(true)}
          title="Keyboard shortcuts (Cmd+/)"
          className="px-2.5 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-400 font-medium"
        >
          ?
        </button>

        <button
          onClick={() => {
            resetScene(emptyScene())
            selectLayer(null)
            handleSeek(0)
          }}
          className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-400"
        >
          Clear
        </button>
      </header>

      {/* ── Dockable work area ─────────────────────────────────────── */}
      <DockDragProvider onDrop={dock.dispatchDrop}>
        <div ref={dockContainerRef} className="flex-1 min-h-0 relative">
          <DockOuterEdges containerRef={dockContainerRef} />
          <DockLayout
            node={dock.layout}
            registry={makeRegistry([
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
                    onAddAudio={addAudioLayerFromFile}
                    onDelete={deleteLayer}
                    onReorder={reorderLayer}
                    onToggleFlag={toggleLayerFlag}
                    onApplyStagger={applyStaggeredPreset}
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
                    assets={assetCache}
                    onSelectLayer={(id) => selectLayer(id)}
                    overrides={frame.overrides}
                    paramValues={frame.paramValues}
                    previewMode={!!runtime.segmentState}
                    onLayerClickInPreview={(layerId) =>
                      runtime.fireEvent({ type: 'click', layerId })
                    }
                  />
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
                    />
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
                  <div className="h-full bg-gray-900 overflow-hidden">
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
                    />
                  </div>
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
                id: 'runtimePreview', title: 'Preview',
                render: () => <RuntimePreviewPanel scene={scene} runtime={runtime} />,
              },
            ] satisfies PanelDefinition[])}
            onTabSelect={dock.dispatchTab}
            onResize={dock.dispatchResize}
          />
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
    </div>
  )
}
