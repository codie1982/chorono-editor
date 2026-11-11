import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorSessionBoundary } from '../EditorSessionBoundary'
import { LocalRecoveryStatus } from '../LocalRecoveryStatus'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useSceneSessionRecovery } from '@/app/hooks/useSceneSessionRecovery'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import SceneCanvas from '../../SceneCanvas'
import { emptyScene, newRectLayer, newImageLayer, newTimeline } from '@/lib/defaults'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { makeUpdateKfValueCmd } from '@/lib/editor/commands-keyframe'
import { assetSourcePool } from '@/lib/asset/sources'
import { sceneSourceData } from '@/lib/format/scene/sceneSourceData'
import { decodeCheckpoint, JOURNAL_PREFIX } from '@/lib/editor/persistence/recovery/SessionCheckpoint'
import type { BrowserRecoverySession } from '@/lib/editor/persistence/recovery/browserSessionRecovery'
import { checkRecoveryStore } from './checkRecoveryStore'

/** Real state, storage, source ownership and Canvas, on a separate origin/database.
 * Buttons arrange source transitions through production commands, never a user
 * editor connection. Native reload proves the complete boot/restore boundary. */
function fixture() {
  const scene = emptyScene(), layer = newRectLayer()
  layer.id = 'hero'; layer.name = 'Manual object'; layer.opacity = 1
  layer.transform.x = 80; layer.transform.y = 60; scene.layers = [layer]
  scene.composition.width = 400; scene.composition.height = 280
  const timeline = newTimeline(); timeline.id = 'custom-animation'; timeline.durationMs = 1000
  timeline.layerIds = ['hero']; timeline.tracks = [{ target: 'layers.hero.transform.x', keyframes: [
    { id: 'manual-key-0', timeMs: 0, value: 80, easing: { type: 'easeOut' }, tangentMode: 'aligned' },
    { id: 'manual-key-1', timeMs: 1000, value: 180, easing: { type: 'linear' } },
  ] }]; scene.timelines = [timeline]; return scene
}
function Host({ session }: { session: BrowserRecoverySession }) {
  const editor = useEditorState(session.scene ?? fixture()), recovery = useSceneSessionRecovery(editor, session)
  const scene = editor.scene, assets = useAssetCache(scene.assets), snap = useSnapSettings()
  const [message, setMessage] = useState('Ready')
  const move = () => { const layer = editor.getScene().layers[0]; editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { transform: { ...layer.transform, x: layer.transform.x + 17.5, y: 94.25 } }, layer)) }
  const editKey = () => { const key = editor.getScene().timelines[0].tracks[0].keyframes[1]; editor.dispatchCommand(makeUpdateKfValueCmd('custom-animation', 'layers.hero.transform.x', key.id, key.value, 905)) }
  const preview = () => { editor.beginTransaction(); const source = editor.getScene(); editor.previewTransaction({ ...source, layers: source.layers.map((layer, index) => index ? layer : { ...layer, transform: { ...layer.transform, x: 777 } }) }) }
  const media = () => {
    const lease = assetSourcePool.create(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#22c55e"/></svg>'], { type: 'image/svg+xml' }))
    const image = newImageLayer('media', 40, 40); image.id = 'image'; image.name = 'Local image'; image.transform.x = 290
    editor.dispatchCommand({ label: 'Import local media', execute: source => ({ ...source, assets: [{ id: 'media', name: 'Local image', type: 'image', url: lease.url, runtime: { objectUrl: lease.url } }], layers: [...source.layers.filter(item => item.id !== 'image'), image] }), undo: () => scene })
  }
  const check = async () => {
    const durable = decodeCheckpoint(await session.store.read(session.id)), raw = session.storage?.getItem(JOURNAL_PREFIX + session.id)
    const journal = raw ? decodeCheckpoint(JSON.parse(raw)) : null
    setMessage(JSON.stringify({ durableKeys: durable ? JSON.parse(durable.json).timelines[0].tracks[0].keyframes : null,
      durableX: durable ? JSON.parse(durable.json).layers[0].transform.x : null, journalX: journal ? JSON.parse(journal.json).layers[0].transform.x : null,
      committedX: editor.getCommittedScene().layers[0].transform.x }))
  }
  return <main className="bg-gray-950 text-gray-200 min-h-screen p-4">
    <h1>Local session recovery acceptance</h1><LocalRecoveryStatus status={recovery} />
    <output id="slot">Session slot: {session.id}</output><output id="restored">{session.restored ? 'Restored workspace' : 'Fresh workspace'}</output>
    <nav className="flex flex-wrap gap-4 text-sm py-4">
      <button onClick={() => window.open(location.href, '_blank')}>Duplicate test tab</button>
      <button onClick={move}>Move object</button><button onClick={editKey}>Edit key</button>
      <button onClick={preview}>Begin drag preview</button><button onClick={() => editor.cancelTransaction()}>Cancel drag</button>
      <button onClick={() => { const base = editor.getCommittedScene(), layer = base.layers[0]; editor.commitTransaction(makeUpdateLayerCmd(layer.id, { transform: { ...layer.transform, x: 333 } }, layer)) }}>Commit drag</button>
      <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button><button onClick={media}>Import local media</button>
      <button onClick={() => editor.dispatchCommand({ label: 'Add guide', execute: source => ({ ...source, editorGuides: { version: 1, guides: [{ id: 'manual-guide', axis: 'v', position: 127.5 }] } }), undo: () => scene })}>Add guide</button>
      <button onClick={() => editor.resetScene(fixture())}>New document</button><button onClick={check}>Inspect checkpoint</button>
      <button onClick={async () => setMessage(JSON.stringify(await checkRecoveryStore()))}>Run storage checks</button>
    </nav>
    <div className="flex h-[450px]"><SceneCanvas scene={scene} editor={editor} timeMs={0} selectedTimeline={scene.timelines[0]}
      selectedLayerId="hero" selectedLayerIds={new Set(['hero'])} onSelectLayer={() => {}} assets={assets} snap={snap} /></div>
    <pre id="checkpoint" className="text-xs">{message}</pre><pre id="source" className="text-xs whitespace-pre-wrap">{JSON.stringify(sceneSourceData(scene))}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<StrictMode><EditorSessionBoundary databaseName="chorono-recovery-acceptance">{session => <Host session={session} />}</EditorSessionBoundary></StrictMode>)
