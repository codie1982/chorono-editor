import { useEffect, useState } from 'react'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { useInteractiveRuntime } from '@/app/hooks/useInteractiveRuntime'
import { useImport } from '@/app/hooks/useImport'
import { useTimelineGhost } from '@/components/timeline/hooks/useTimelineGhost'
import { DEFAULT_TIMELINE_SETTINGS } from '@/lib/types/editor'
import { makeAddLayerCmd, makeDeleteLayerCmd, makeUpdateLayerCmd, makeToggleLayerCmd, makeMoveLayerCmd, makeMoveLayerToCmd } from '@/lib/editor/commands-layer'
import { layerRegistry } from '@/lib/registry'
import type { Composition, Layer } from '@/lib/types'
import type { ToolMode } from '@/components/TopToolbar/ToolGroup'
import { createDocumentationScene } from './fixture'

/** Isolated production editor/history and ephemeral selection/playback state.
 * The host origin owns snap/ghost preferences; no application persistence,
 * recovery, file versioning, MCP bridge or user scene is mounted here. */
export function useDocumentationState(initialSelection = 'card') {
  const [initial] = useState(() => createDocumentationScene(initialSelection === 'spline'))
  const editor = useEditorState(initial), scene = editor.scene
  const assets = useAssetCache(scene.assets), snap = useSnapSettings(), ghost = useTimelineGhost()
  const runtime = useInteractiveRuntime(scene)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelection)
  const [selectedIds, setSelectedIds] = useState(new Set([initialSelection]))
  const [selectedKfIds, setSelectedKfIds] = useState(new Set(['card-x-1']))
  const [timelineId, setTimelineId] = useState('intro')
  const [settings, setSettings] = useState(DEFAULT_TIMELINE_SETTINGS)
  const [timeMs, setTimeMs] = useState(600), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1)
  const [tool, setTool] = useState<ToolMode>('select')
  const [containMode, setContainMode] = useState<'inside' | 'touching'>('inside')
  const imports = useImport({ dispatchCommand: editor.dispatchCommand, onSelectLayer: id => select(id),
    selectedTimelineId: timelineId, currentTimeMs: timeMs, getDocumentSignal: editor.getDocumentSignal })
  useEffect(() => {
    if (!playing) return
    let frame = 0, previous = performance.now()
    const tick = (now: number) => { const elapsed = now - previous; previous = now
      setTimeMs(value => (value + elapsed * speed) % (scene.timelines.find(t => t.id === timelineId)?.durationMs ?? 2400))
      frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
  }, [playing, speed, timelineId, scene.timelines])
  /** Selection is host state; production commands still own every source edit. */
  function select(id: string | null, additive = false) {
    setSelectedId(id); setSelectedIds(previous => new Set(id ? additive ? [...Array.from(previous), id] : [id] : []))
  }
  /** Commit a complete layer through the same reversible command as the app. */
  function updateLayer(layer: Layer) {
    const before = editor.getScene().layers.find(item => item.id === layer.id)
    if (before) editor.dispatchCommand(makeUpdateLayerCmd(layer.id, layer, before))
  }
  /** Composition form adapter; snapshots preserve undo and contain only data. */
  function updateComposition(composition: Composition) {
    const before = editor.getScene().composition
    editor.dispatchCommand({ label: 'Edit composition', execute: value => ({ ...value, composition }), undo: value => ({ ...value, composition: before }) })
  }
  /** Use the authoritative production layer registry, including its defaults. */
  function addLayer(kind: string) {
    const definition = layerRegistry.get(kind)
    if (!definition) return false
    const layer = definition.createDefault(); editor.dispatchCommand(makeAddLayerCmd(layer)); select(layer.id); return true
  }
  const toggleFlag = (id: string, flag: 'locked' | 'hidden' | 'solo' | 'pinned') => editor.dispatchCommand(makeToggleLayerCmd(id, flag))
  const rename = (id: string, name: string) => { const layer = editor.getScene().layers.find(item => item.id === id); if (layer) updateLayer({ ...layer, name }) }
  const remove = (id: string) => { const layer = editor.getScene().layers.find(item => item.id === id); if (layer) editor.dispatchCommand(makeDeleteLayerCmd(layer)) }
  return { editor, scene, assets, snap, ghost, runtime, imports, selectedId, selectedIds, select, selectedKfIds, setSelectedKfIds,
    timelineId, setTimelineId, settings, setSettings, timeMs, setTimeMs, playing, setPlaying, speed, setSpeed,
    tool, setTool, containMode, setContainMode, updateLayer, updateComposition, addLayer, toggleFlag, rename, remove,
    reorder: (from: number, to: number) => { const layer = editor.getScene().layers[from]; if (layer) editor.dispatchCommand(makeMoveLayerCmd(layer.id, from, to)) },
    moveInTree: (id: string, parent: string | undefined, index: number) => editor.dispatchCommand(makeMoveLayerToCmd(id, parent, index)),
    layer: scene.layers.find(item => item.id === selectedId) ?? null,
    timeline: scene.timelines.find(item => item.id === timelineId) ?? null }
}

export type DocumentationState = ReturnType<typeof useDocumentationState>
