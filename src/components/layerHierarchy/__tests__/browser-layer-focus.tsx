import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { DEFAULT_TIMELINE_SETTINGS, DEFAULT_TIMELINE_GHOST_SETTINGS } from '@/lib/types/editor'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useLayerIsolation } from '@/app/hooks/useLayerIsolation'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { useSelectionTimelineReveal } from '../useSelectionTimelineReveal'
import { LayerIsolationBar } from '../LayerFocusControls'
import type { TimelineRevealRequest } from '@/lib/timeline/hierarchy/TimelineRevealRequest'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import LayerPanel from '@/components/LayerPanel'
import TimelinePanel from '@/components/TimelinePanel'
import SceneCanvas from '@/components/SceneCanvas'
import { checkLayerFocus } from './checkLayerFocus'

/** Hundreds of offscreen Timeline rows plus a visible nested family. Source
 * solo/hidden flags expose accidental persistence and ancestor clipping. */
function fixture() {
  const scene = emptyScene(), timeline = { ...newTimeline(), id: 'active', autoplay: false, durationMs: 1000 }
  const group = { ...newRectLayer(), id: 'family', name: 'Manual family · 09:05', type: 'group' as const }
  group.transform.x = 35; group.transform.y = 30
  const child = { ...newRectLayer(), id: 'child', name: 'Editable child', parentId: group.id }
  child.size = { width: 90, height: 65 }; child.style = { ...child.style, fill: { type: 'solid' as const, color: '#ef4444' } }
  const hidden = { ...newRectLayer(), id: 'hidden', name: 'Hidden child', parentId: group.id, hidden: true }
  const outside = { ...newRectLayer(), id: 'outside', name: 'Outside blue card', solo: true }
  outside.transform.x = 220; outside.transform.y = 100; outside.size = { width: 80, height: 65 }
  const rows = Array.from({ length: 250 }, (_, i) => ({ ...newRectLayer(), id: `row-${i}`, name: `Row ${i}`, hidden: true }))
  scene.layers = [...rows, outside, group, child, hidden]
  timeline.layerIds = scene.layers.map(layer => layer.id)
  timeline.tracks = [{ target: 'layers.child.transform.x', keyframes: [
    { id: 'manual-start', timeMs: 0, value: child.transform.x, easing: { type: 'easeOut' } },
    { id: 'mid-x-200', timeMs: 200, value: 50, easing: { type: 'linear' } },
    { id: 'mid-x-700', timeMs: 700, value: 150, easing: { type: 'linear' } },
    { id: 'manual-end', timeMs: 1000, value: 200, easing: { type: 'hold' } },
  ] }, { target: 'layers.child.transform.y', keyframes: [
    { id: 'mid-y-300', timeMs: 300, value: 30, easing: { type: 'linear' } },
    { id: 'mid-y-600', timeMs: 600, value: 80, easing: { type: 'linear' } },
  ] }, { target: 'layers.outside.opacity', keyframes: [
    { id: 'outside-start', timeMs: 100, value: 1, easing: { type: 'linear' } },
    { id: 'outside-end', timeMs: 900, value: .5, easing: { type: 'hold' } },
  ] }]
  return { ...scene, composition: { ...scene.composition, width: 400, height: 280 }, timelines: [timeline] }
}
const initial = fixture()

/** Uses actual Layers/Timeline/Canvas and their source/history owners. No live
 * editor, MCP connection or user's source is loaded by this acceptance page. */
function Host() {
  const editor = useEditorState(initial), scene = editor.scene
  const [primary, setPrimary] = useState<string | null>(null), [ids, setIds] = useState(new Set<string>())
  const [time, setTime] = useState(0)
  const [keys, setKeys] = useState(new Set<string>()), [settings, setSettings] = useState(DEFAULT_TIMELINE_SETTINGS)
  const [request, setRequest] = useState<TimelineRevealRequest | null>(null), [report, setReport] = useState('Ready')
  const isolation = useLayerIsolation(scene, editor.getDocumentSignal()), assets = useAssetCache(scene.assets), snap = useSnapSettings({ persist: false })
  const select = (id: string | null, additive = false) => { setPrimary(id); setIds(previous => id ? additive ? new Set(previous).add(id) : new Set([id]) : new Set()); setRequest(null) }
  const reveal = (id?: string) => setRequest(previous => ({ nonce: (previous?.nonce ?? 0) + 1, timelineId: 'active', layerIds: id ? [id] : Array.from(ids), primaryId: id ?? primary }))
  useSelectionTimelineReveal({ selectedId: primary, selectedIds: ids, timelineId: 'active', documentSignal: editor.getDocumentSignal(), editor, enabled: true, onReveal: reveal })
  const noop = () => {}
  return <main className="p-3 bg-gray-950 text-gray-200 min-h-screen">
    <h1 className="text-lg">Layers · automatic Timeline reveal, compact tools</h1>
    <nav className="flex gap-3 text-xs py-2">
      <button data-action="reset" onClick={() => { isolation.exit(); editor.resetScene(initial); setKeys(new Set()); setTime(0); select(null) }}>Reset fixture</button>
      <button data-action="edit-child" onClick={() => { const child = editor.getScene().layers.find(layer => layer.id === 'child')!; editor.dispatchCommand(makeUpdateLayerCmd(child.id, { transform: { ...child.transform, y: child.transform.y + 10 } }, child)) }}>Edit child +10 y</button>
      <button data-action="clear-selection" onClick={() => select(null)}>Clear object selection</button>
      <button data-action="seed-keys" onClick={() => setKeys(new Set(['manual-start', 'outside-start']))}>Seed inside/outside key selection</button>
      <button data-action="undo" onClick={editor.undo}>Undo</button>
      <button data-action="replace" onClick={() => editor.resetScene({ ...initial })}>Replace document</button>
      <button className="bg-blue-700 px-2 py-1" onClick={async () => { setReport('Running'); setReport(JSON.stringify(await checkLayerFocus(editor), null, 2)) }}>Run layer focus checks</button>
    </nav>
    <output id="focus-state" className="text-xs" data-time={time} data-keys={Array.from(keys).join(',')} data-reveal={request?.nonce ?? 0} data-isolated={String(isolation.active)} data-selection={primary ?? ''} data-visible={isolation.scene.layers.filter(layer => !layer.hidden && layer.type !== 'group' && layer.type !== 'audio').map(layer => layer.id).join(',')}>
      Selection: {primary ?? 'none'} · isolation: {isolation.active ? 'on' : 'off'} · revision {editor.getRevision()}
    </output>
    <div className="grid gap-3 my-3" style={{ gridTemplateColumns: '310px minmax(650px,1fr) 470px' }}>
      <section data-panel="Layers" style={{ height: 650 }} className="border border-gray-700 min-h-0">
        <LayerPanel layerScope={isolation.contentScope} layers={scene.layers} selectedId={primary} selectedIds={ids} onSelect={select} onAdd={noop}
          onAddImage={noop} onAddVideo={noop} onAddAudio={noop} onDelete={noop} onReorder={noop} onToggleFlag={noop} onRename={noop}
          onIsolateLayers={isolation.enter} onIsolateSelection={() => isolation.enter(Array.from(ids))} onExitIsolation={isolation.exit} isolationActive={isolation.active} />
      </section>
      <section data-panel="Timeline" style={{ height: 650 }} className="border border-gray-700 min-h-0">
        <TimelinePanel layerScope={isolation.contentScope} scene={scene} editor={editor} settings={settings} onSettingsChange={setSettings}
          selectedLayerId={primary} selectedLayerIds={ids} selectedTimelineId="active" selectedKfIds={keys} currentTimeMs={time}
          isPlaying={false} playbackSpeed={1} onTimeChange={setTime} onPlayToggle={noop} onSelectTimeline={noop} onSelectKeyframes={setKeys}
          onSelectLayer={select} onToggleLayerFlag={noop} onPlaybackSpeedChange={noop} revealRequest={request}
          ghostSettings={DEFAULT_TIMELINE_GHOST_SETTINGS} onGhostUpdate={noop} onGhostToggle={noop} onGhostPreset={noop} />
      </section>
      <section data-panel="Canvas" style={{ height: 650 }} className="border border-gray-700 min-h-0 flex flex-col">
        <LayerIsolationBar count={isolation.roots.length} onExit={isolation.exit} />
        <div className="flex-1 min-h-0"><SceneCanvas scene={scene} displayScene={isolation.scene} editor={editor} assets={assets} snap={snap}
          timeMs={time} selectedLayerId={primary} selectedLayerIds={ids} onSelectLayer={select} /></div>
      </section>
    </div><pre id="focus-report" className="text-xs whitespace-pre-wrap">{report}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
