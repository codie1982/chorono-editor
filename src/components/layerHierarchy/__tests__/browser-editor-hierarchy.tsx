import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { DEFAULT_TIMELINE_GHOST_SETTINGS, DEFAULT_TIMELINE_SETTINGS } from '@/lib/types/editor'
import type { ChronoScene, Layer } from '@/lib/types'
import { useEditorState } from '@/app/hooks/useEditorState'
import { makeSetSubtreeFlagCmd } from '@/lib/editor/branches/SubtreeCommands'
import { makeBulkToggleFlagCmd } from '@/lib/editor/commands-layer'
import { makeMoveLayerInTreeCmd } from '@/lib/editor/branches/HierarchyCommands'
import { attributeSourceChange } from '@/lib/editor/authoring/Attribution'
import SceneExplorerPanel from '@/components/sceneExplorer/SceneExplorerPanel'
import TimelinePanel from '@/components/TimelinePanel'
import CurveEditor from '@/components/timeline/CurveEditor'
import DopeSheetPanel from '@/components/dope-sheet/DopeSheetPanel'
import { checkEditorHierarchy } from './checkEditorHierarchy'

/** Isolated source with 500 roots, out-of-order nesting, explicit timeline
 * membership, foreign audio and one manually authored animation. No user's
 * editor, assets, file handles, bridge or network connection is used. */
function fixture(): ChronoScene {
  const scene = emptyScene(), timeline = newTimeline()
  timeline.id = 'acceptance'; timeline.autoplay = false
  const layer = (id: string, parentId?: string): Layer => ({ ...newRectLayer(), id, name: id, parentId, ...(id === 'root-0' ? { type: 'group' } : {}) })
  scene.layers = Array.from({ length: 500 }, (_, i) => layer(`root-${i}`))
  scene.layers.splice(350, 0, layer('child', 'inner'), { ...layer('outer'), type: 'group' },
    { ...layer('inner', 'outer'), type: 'group' }, layer('other-child', 'root-450'))
  scene.layers.push({ ...layer('foreign-audio'), type: 'audio', audio: { assetId: 'foreign-asset', timelineId: 'other-timeline' } })
  timeline.layerIds = scene.layers.filter(item => item.id !== 'foreign-audio').map(item => item.id)
  timeline.tracks = ['child', 'outer', 'other-child'].map(id => ({ target: `layers.${id}.${id === 'outer' ? 'opacity' : 'transform.x'}`, keyframes: [
    { id: `${id}-start`, timeMs: 0, value: 19, easing: { type: 'easeOut' } },
    { id: `${id}-end`, timeMs: 1000, value: 91, easing: { type: 'hold' } },
  ] }))
  scene.timelines = [timeline]
  return attributeSourceChange(scene, { ...scene, layers: scene.layers.map(item => item.id === 'child'
    ? { ...item, name: 'Clock hands · 09:05', transform: { ...item.transform, x: 91 } } : item) },
  { actor: { kind: 'human' }, transactionId: 'manual-fixture' })
}
const initialScene = fixture()

/** Real source/history owner and real production panels share one selection.
 * Test controls use the same commands/callbacks as the page integration. */
function Host() {
  const editor = useEditorState(initialScene), scene = editor.scene
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState(new Set<string>())
  const [keys, setKeys] = useState(new Set<string>())
  const [settings, setSettings] = useState(DEFAULT_TIMELINE_SETTINGS)
  const [time, setTime] = useState(0), [tick, setTick] = useState(0), [report, setReport] = useState('Ready')
  const select = (id: string | null, additive = false) => {
    setSelectedId(id)
    setSelectedIds(previous => additive && id ? new Set(previous).add(id) : new Set(id ? [id] : []))
  }
  const noop = () => {}
  return <main className="p-3 bg-gray-950 text-gray-200 min-h-screen">
    <h1 className="text-lg">E−1.3 · Shared editor hierarchy acceptance</h1>
    <nav className="flex gap-2 flex-wrap py-2 text-xs">
      {['root-0', 'root-499', 'outer', 'child', 'foreign-audio'].map(id =>
        <button className="bg-gray-700 px-2 py-1" key={id} data-select={id} onClick={() => select(id)}>Select {id}</button>)}
      <button data-action="both" onClick={() => { setSelectedId('child'); setSelectedIds(new Set(['child', 'other-child'])) }}>Select both branches</button>
      <button data-action="tick" onClick={() => setTick(value => value + 1)}>Render tick</button>
      <button data-action="undo" onClick={editor.undo}>Undo</button>
      <button data-action="redo" onClick={editor.redo}>Redo</button>
      <button data-action="reparent" onClick={() => {
        const command = makeMoveLayerInTreeCmd(editor.getScene(), 'inner', 'root-0', 1)
        if (command) editor.dispatchCommand(command)
      }}>Reparent selected path</button>
      <button className="bg-blue-700 px-2 py-1" onClick={async () => {
        setReport('Running'); setReport(JSON.stringify(await checkEditorHierarchy(editor.getScene), null, 2))
      }}>Run hierarchy checks</button>
    </nav>
    <output className="text-xs">Selected: {selectedId ?? 'none'} · {selectedIds.size} layers · tick {tick} · revision {editor.getRevision()}</output>
    <div className="grid gap-3 my-2" style={{ gridTemplateColumns: '420px minmax(680px,1fr)' }}>
      <section data-panel="Explorer" style={{ height: 510 }} className="min-h-0 border border-gray-700">
        <SceneExplorerPanel layers={scene.layers} timeline={scene.timelines[0]} selectedId={selectedId} selectedIds={selectedIds}
          onSelect={(id, shift, meta) => select(id, shift || meta)} onRename={noop} onToggleFlag={noop} onMoveInTree={noop}
          onSetSubtreeFlag={(roots, field, value) => { const command = makeSetSubtreeFlagCmd(editor.getScene(), roots, field, value); if (command) editor.dispatchCommand(command) }} />
      </section>
      <section data-panel="Timeline" style={{ height: 510 }} className="min-h-0 border border-gray-700">
        <TimelinePanel scene={scene} editor={editor} settings={settings} onSettingsChange={setSettings}
          selectedLayerId={selectedId} selectedLayerIds={selectedIds} selectedTimelineId="acceptance" currentTimeMs={time}
          isPlaying={false} playbackSpeed={1} onTimeChange={setTime} onPlayToggle={noop} onSelectTimeline={noop}
          onSelectKeyframes={setKeys} selectedKfIds={keys} onSelectLayer={select}
          onToggleLayerFlag={(id, field) => editor.dispatchCommand(makeBulkToggleFlagCmd([id], field, !editor.getScene().layers.find(item => item.id === id)?.[field]))}
          onPlaybackSpeedChange={noop} ghostSettings={DEFAULT_TIMELINE_GHOST_SETTINGS} onGhostUpdate={noop} onGhostToggle={noop} onGhostPreset={noop} />
      </section>
      <section data-panel="Dope" style={{ height: 240 }} className="min-h-0 border border-gray-700">
        <DopeSheetPanel scene={scene} editor={editor} settings={settings} onSettingsChange={setSettings}
          selectedLayerId={selectedId} selectedLayerIds={selectedIds} selectedTimelineId="acceptance" selectedKfIds={keys}
          currentTimeMs={time} isPlaying={false} onTimeChange={setTime} onSelectKeyframes={setKeys} onSelectLayer={select} />
      </section>
      <section data-panel="Curve" style={{ height: 240 }} className="min-h-0 border border-gray-700">
        <CurveEditor scene={scene} editor={editor} selectedLayerId={selectedId} selectedLayerIds={selectedIds}
          selectedTimelineId="acceptance" currentTimeMs={time} onTimeChange={setTime} selectedKfIds={keys} onSelectKeyframes={setKeys} />
      </section>
    </div>
    <pre id="hierarchy-report" className="text-xs whitespace-pre-wrap">{report}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
