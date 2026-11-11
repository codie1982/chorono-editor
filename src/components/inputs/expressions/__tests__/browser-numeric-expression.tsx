import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@/lib/modes/bootstrap'
import PropertiesPanel from '@/components/PropertiesPanel'
import SchemaPanel from '@/components/PropertiesPanel/SchemaPanel'
import SceneCanvas from '@/components/SceneCanvas'
import { NumericPropertyProvider } from '../NumericPropertyContext'
import { EditorSessionBoundary } from '@/components/editorSession/EditorSessionBoundary'
import { SessionOutputProvider, useSessionIdentity } from '@/components/editorSession/SessionOutputContext'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useSceneSessionRecovery } from '@/app/hooks/useSceneSessionRecovery'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { sceneSourceData } from '@/lib/format/scene/sceneSourceData'
import { makeSessionProject, readSessionProject } from '@/lib/editor/session/SessionProject'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import type { BrowserRecoverySession } from '@/lib/editor/persistence/recovery/browserSessionRecovery'

/** Isolated source/data origin. Tests production state, inspector, schema,
 * renderer and local recovery without mutating an editor/MCP user session. */
function fixture() {
  const scene = emptyScene(), layer = { ...newRectLayer(), id: 'hero', name: 'Editable card' }
  scene.layers = [layer, { ...newRectLayer(), id: 'other', name: 'Other object', transform: { ...layer.transform, x: 280 } }]
  scene.composition.width = 500; scene.composition.height = 300
  scene.timelines = [{ id: 'animation', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: 'layers.hero.transform.x', keyframes: [{ id: 'manual-key', timeMs: 0, value: 40, easing: { type: 'linear' } }] }] }]
  return scene
}
/** Public visible controls arrange concurrency/save scenarios through native
 * commands; no private window test handles or synthetic DOM event dispatch. */
function Host({ session }: { session: BrowserRecoverySession }) {
  const editor = useEditorState(session.scene ?? fixture(), session.history), recovery = useSceneSessionRecovery(editor, session)
  const [schema, setSchema] = useState(false), [selected, select] = useState('hero'), [project, setProject] = useState('')
  const identity = useSessionIdentity()!, scene = editor.scene, layer = scene.layers.find(item => item.id === selected)!
  const assets = useAssetCache(scene.assets), snap = useSnapSettings()
  const update = (next: typeof layer) => editor.dispatchCommand(makeUpdateLayerCmd(layer.id, next, layer))
  useEffect(() => {
    const concurrent = (event: KeyboardEvent) => {
      if (event.key === 'F9') { event.preventDefault(); select(value => value === 'hero' ? 'other' : 'hero'); return }
      if (event.key !== 'F8') return; event.preventDefault()
      const current = editor.getScene().layers[0]
      editor.dispatchCommand(makeUpdateLayerCmd(current.id, { size: { ...current.size!, width: current.size!.width + 10 } }, current))
    }
    window.addEventListener('keydown', concurrent, true)
    return () => window.removeEventListener('keydown', concurrent, true)
  }, [editor.getScene, editor.dispatchCommand])
  return <main className="min-h-screen bg-gray-950 p-3 text-gray-100">
    <h1>Numeric input expression acceptance</h1><p className="text-xs text-gray-400">F8 edits the source; F9 changes selection, including while a formula dialog is open.</p>
    <output id="counts">{JSON.stringify({ undo: editor.getCommittedHistory().past.length, redo: editor.getCommittedHistory().future.length, recovery: recovery.state, sessionId: identity.id })}</output>
    <nav className="my-3 flex gap-4 text-xs">
      <button onClick={editor.undo} disabled={!editor.canUndo}>Undo</button><button onClick={editor.redo} disabled={!editor.canRedo}>Redo</button>
      <button onClick={() => setSchema(value => !value)}>{schema ? 'Properties inspector' : 'Schema inspector'}</button>
      <button onClick={() => { const source = editor.getScene(), current = source.layers[0]; editor.dispatchCommand(makeUpdateLayerCmd(current.id, { size: { ...current.size!, width: current.size!.width + 10 } }, current)) }}>External width +10</button>
      <button onClick={() => select(value => value === 'hero' ? 'other' : 'hero')}>Switch selection</button>
      <button onClick={() => setProject(JSON.stringify(makeSessionProject(editor.getCommittedHistory(), identity.id)))}>Prepare project</button>
      <button onClick={() => { const opened = readSessionProject(parseSceneJson(project)); identity.adopt(opened.sessionId!); editor.resetHistory(opened.history) }}>Open project</button>
      <button onClick={() => { identity.adopt(crypto.randomUUID()); editor.resetScene(fixture()) }}>Reset test document</button>
    </nav>
    <div className="flex h-[620px] gap-4">
      <div className="flex min-w-0 flex-1"><SceneCanvas scene={scene} editor={editor} assets={assets} snap={snap} timeMs={0} selectedLayerId={selected} onSelectLayer={id => { if (id) select(id) }} /></div>
      <div className="flex w-[420px] flex-col overflow-auto border border-gray-700">
        {schema ? <NumericPropertyProvider scene={scene} layerId={layer.id} dispatch={editor.dispatchCommand} getScene={editor.getScene} isTransactionActive={editor.isTransactionActive}>
          <SchemaPanel layer={layer} onLayerChange={update} />
        </NumericPropertyProvider> : <PropertiesPanel layer={layer} composition={scene.composition} scene={scene} allLayers={scene.layers} dispatchCommand={editor.dispatchCommand}
          getScene={editor.getScene} isTransactionActive={editor.isTransactionActive} onLayerChange={update} onCompositionChange={() => {}} />}
      </div>
    </div>
    <label className="block text-xs">Project JSON<textarea aria-label="Project JSON" value={project} onChange={event => setProject(event.target.value)} className="h-14 w-full bg-gray-900" /></label>
    <pre id="source" className="whitespace-pre-wrap text-xs">{JSON.stringify(sceneSourceData(scene))}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<StrictMode><EditorSessionBoundary databaseName="chorono-numeric-expression-acceptance">{session =>
  <SessionOutputProvider sessionId={session.id}><Host session={session} /></SessionOutputProvider>
}</EditorSessionBoundary></StrictMode>)
