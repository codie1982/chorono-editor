import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Asset, ChronoScene } from '@/lib/types'
import { DEFAULT_TIMELINE_SETTINGS } from '@/lib/types'
import { DEFAULT_TIMELINE_GHOST_SETTINGS } from '@/lib/types/editor'
import { newAudioLayer } from '@/lib/defaults'
import { useEditorState } from '@/app/hooks/useEditorState'
import { makeMoveLayerCmd, makeMoveLayerToCmdWithSnapshot, makeToggleLayerCmd, makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import SceneExplorerPanel from '@/components/sceneExplorer/SceneExplorerPanel'
import LayerPanel from '@/components/LayerPanel'
import DopeSheetPanel from '@/components/dope-sheet/DopeSheetPanel'
import TimelinePanel from '@/components/TimelinePanel'
import AssetsPanel from '@/components/panels/AssetsPanel'
import { runUIWindowChecks } from './runUIWindowChecks'
import { installResizeObserverProbe } from './resizeObserverProbe'

const VIEWS = ['Scene Explorer', 'Layers', 'Dope Sheet', 'Timeline', 'Assets'] as const
type View = typeof VIEWS[number]
const readObservers = installResizeObserverProbe()

/** Isolated test host with the real editor command/history/transaction hooks.
 * Uses immutable prepared fixtures, never a connected editor or its localStorage.
 * File import and scene creation are deliberately unavailable in this harness;
 * unsupported controls throw rather than pretend to succeed. */
function Host({ input, audioAsset }: { input: ChronoScene; audioAsset: Asset }) {
  const editor = useEditorState(input), scene = editor.scene
  const [view, setView] = useState<View | 'None'>('Scene Explorer'), [narrow, setNarrow] = useState(false)
  const [selected, setSelected] = useState<string | null>(null), [selectedIds, setSelectedIds] = useState(new Set<string>())
  const [keys, setKeys] = useState(new Set<string>()), [time, setTime] = useState(0)
  const [settings, setSettings] = useState(DEFAULT_TIMELINE_SETTINGS)
  const [ghost, setGhost] = useState(DEFAULT_TIMELINE_GHOST_SETTINGS)
  const [running, setRunning] = useState(false), [report, setReport] = useState<unknown>(null)
  const timeline = scene.timelines[0]
  const select = (id: string | null, shift = false) => {
    setSelected(id)
    setSelectedIds(previous => { const next = shift ? new Set(previous) : new Set<string>(); if (id) next.add(id); return next })
  }
  const rename = (id: string, name: string) => {
    const layer = scene.layers.find(layer => layer.id === id)
    if (layer) editor.dispatchCommand(makeUpdateLayerCmd(id, { name }, layer))
  }
  const toggle = (id: string, field: 'locked' | 'hidden' | 'solo' | 'pinned') => editor.dispatchCommand(makeToggleLayerCmd(id, field))
  const unsupported = () => { throw new Error('This control is outside the isolated UI regression scope') }
  const move = (id: string, parentId: string | undefined, to: number) => {
    const command = makeMoveLayerToCmdWithSnapshot(scene, id, parentId, to)
    if (command) editor.dispatchCommand(command)
  }
  const width = narrow ? 340 : view === 'Scene Explorer' || view === 'Layers' || view === 'Assets' ? 480 : 1120
  /** Stress-only source variants, fed through real editor reset/history rather
   * than a hidden production bridge. Source keys remain individually editable. */
  const loadGlyphs = (coincident = false, audio = false) => {
    const layer = audio ? newAudioLayer(audioAsset.id, input.timelines[0].durationMs) : input.layers[0]
    if (layer.audio) layer.audio = { ...layer.audio, loop: true }
    const keyframes = Array.from({ length: 42000 }, (_, i) => ({ id: `ui-key-${i}`,
      timeMs: coincident ? input.timelines[0].durationMs / 2 : i * input.timelines[0].durationMs / 41999,
      value: (i % 1000) / 999, easing: { type: 'linear' as const } }))
    editor.resetScene({ ...input, layers: [layer], assets: audio ? [audioAsset] : input.assets,
      timelines: [{ ...input.timelines[0], layerIds: [layer.id], tracks: [{
        target: `layers.${layer.id}.${audio ? 'audio.volume' : 'opacity'}`, keyframes }] }] })
    select(null); setKeys(new Set()); setTime(0)
  }
  return <div className="p-4 text-gray-200">
    <h1 className="text-xl mb-2">UI virtualization regression</h1>
    <p className="text-sm text-gray-400 mb-3">Prepared 3000-layer fixture · real editor commands · isolated test session</p>
    <div className="flex flex-wrap gap-2 mb-3">
      {VIEWS.map(item => <button key={item} data-switch-view={item} className="px-3 py-1 border rounded"
        aria-pressed={view === item} onClick={() => setView(item)}>{item}</button>)}
      <button data-action="last" onClick={() => select(scene.layers[scene.layers.length - 1].id)}>Select last layer</button>
      <button data-action="all" onClick={() => { setSelectedIds(new Set(scene.layers.map(layer => layer.id)))
        setKeys(new Set(timeline.tracks.flatMap(track => track.keyframes.map(key => key.id)))) }}>Select all</button>
      <button data-action="clear" onClick={() => { select(null); setKeys(new Set()) }}>Clear selection</button>
      <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
      <button data-action="resize" onClick={() => setNarrow(value => !value)}>Resize panel</button>
      <button data-action="seek" onClick={() => setTime(value => value ? 0 : timeline.durationMs / 2)}>Seek</button>
      <button data-action="dense" onClick={() => {
        const source = input.layers[0], mask = { ...input.layers[1], id: 'ui-mask-source' }
        const masks = Array.from({ length: 1000 }, (_, i) => ({ id: `ui-mask-${i}`, maskLayerId: mask.id,
          mode: 'add' as const, opacity: 1, feather: 0 }))
        const tracks = masks.map((_, index) => ({ ...input.timelines[0].tracks[0], target: `layers.${source.id}.masks.${index}.opacity`,
          keyframes: input.timelines[0].tracks[0].keyframes.map(key => ({ ...key, id: `${key.id}-${index}` })) }))
        editor.resetScene({ ...input, layers: [{ ...source, masks }, mask], timelines: [{ ...input.timelines[0], tracks }] })
        select(null); setKeys(new Set()); setTime(0)
      }}>Dense track fixture</button>
      <button data-action="glyphs" onClick={() => loadGlyphs()}>42000 key fixture</button>
      <button data-action="overlap" onClick={() => loadGlyphs(true)}>Coincident key fixture</button>
      <button data-action="audio-keys" onClick={() => loadGlyphs(false, true)}>Audio key fixture</button>
      <button data-action="restore" onClick={() => { editor.resetScene(input); select(null); setKeys(new Set()); setTime(0) }}>Restore fixture</button>
      <button data-action="unmount" onClick={() => setView('None')}>Unmount panel</button>
      <button data-action="checks" disabled={running} onClick={async () => {
        setRunning(true)
        try { setReport(await runUIWindowChecks(document, scene.layers.map(layer => layer.id), readObservers)) }
        catch (error) { setReport({ passed: false, error: String(error) }) }
        finally { setRunning(false) }
      }}>Run checks</button>
    </div>
    <pre id="ui-state" className="text-xs mb-2">{JSON.stringify({ view, layers: scene.layers.length, assets: scene.assets.length,
      tracks: timeline.tracks.length, keyCount: timeline.tracks.reduce((n, track) => n + track.keyframes.length, 0),
      selected, selectedCount: selectedIds.size, selectedKeys: keys.size, revision: editor.getRevision(), time })}</pre>
    <div id="ui-pane" data-view={view} className="border border-gray-700" style={{ width, height: 520 }}>
      {view === 'Scene Explorer' && <SceneExplorerPanel layers={scene.layers} timeline={timeline} selectedId={selected}
        selectedIds={selectedIds} onSelect={select} onRename={rename} onToggleFlag={toggle} onMoveInTree={move} />}
      {view === 'Layers' && <LayerPanel layers={scene.layers} selectedId={selected} selectedIds={selectedIds}
        onSelect={select} onRename={rename} onToggleFlag={toggle} onMoveInTree={move} onAdd={unsupported}
        onAddImage={unsupported} onAddVideo={unsupported} onAddAudio={unsupported} onDelete={unsupported}
        onReorder={(from, to) => editor.dispatchCommand(makeMoveLayerCmd(scene.layers[from].id, from, to))} />}
      {view === 'Dope Sheet' && <DopeSheetPanel scene={scene} editor={editor} settings={settings} onSettingsChange={setSettings}
        selectedLayerId={selected} selectedTimelineId={timeline.id} selectedKfIds={keys} currentTimeMs={time} isPlaying={false}
        onTimeChange={setTime} onSelectKeyframes={setKeys} onSelectLayer={select} />}
      {view === 'Timeline' && <TimelinePanel scene={scene} editor={editor} settings={settings} onSettingsChange={setSettings}
        selectedLayerId={selected} selectedLayerIds={selectedIds} selectedTimelineId={timeline.id} selectedKfIds={keys}
        currentTimeMs={time} isPlaying={false} playbackSpeed={1} onTimeChange={setTime} onPlayToggle={unsupported}
        onSelectTimeline={unsupported} onSelectKeyframes={setKeys} onSelectLayer={select} onToggleLayerFlag={toggle}
        onPlaybackSpeedChange={unsupported} ghostSettings={ghost} onGhostUpdate={patch => setGhost(previous => ({ ...previous, ...patch }))}
        onGhostToggle={() => setGhost(previous => ({ ...previous, enabled: !previous.enabled }))}
        onGhostPreset={unsupported} />}
      {view === 'Assets' && <AssetsPanel scene={scene} editor={editor} selectedTimelineId={timeline.id} onSelectLayer={select} />}
    </div>
    <pre id="ui-report" className="mt-3 text-xs whitespace-pre-wrap">{report ? JSON.stringify(report, null, 2) : running ? 'Running…' : 'Ready'}</pre>
  </div>
}

/** Loads portable inputs only. The inventory fan-out is synthetic test data
 * sharing one PNG source, not an authored/saved project or decoded-media cache. */
async function main() {
  const [scene, media, mixed]: ChronoScene[] = await Promise.all(['vector-visible', 'shared-image', 'mixed'].map(async id => {
    const response = await fetch(`${id}.chorono.json`)
    if (!response.ok) throw new Error(`Missing prepared UI fixture: ${id}`)
    return response.json()
  }))
  const sample = media.assets[0]
  const input = { ...scene, assets: Array.from({ length: 3000 }, (_, index) => ({ ...sample,
    id: index ? `${sample.id}-${index}` : sample.id, name: `Shared thumbnail ${index + 1}` })) }
  const audioAsset = mixed.assets.find(asset => asset.type === 'audio')
  if (!audioAsset) throw new Error('Missing prepared audio UI fixture')
  createRoot(document.getElementById('app')!).render(<Host input={input} audioAsset={audioAsset} />)
}
void main().catch(error => { document.getElementById('app')!.textContent = String(error) })
