import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ProjectMenu from '../ProjectMenu'
import ExportMenu from '../ExportMenu'
import SceneCanvas from '../../SceneCanvas'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { emptyScene, newSplineLayerFromData, newTimeline } from '@/lib/defaults'
import { createPolylineSpline } from '@/lib/spline'
import { LayerIsolationBar } from '../../layerHierarchy/LayerFocusControls'
import type { ToolMode } from '../ToolGroup'

/** Real toolbar/Canvas integration on a synthetic source, without autosave,
 * filesystem writes or a user editor bridge. Visible counters verify action
 * routing; JSON source/history makes pointer/undo preservation reviewable. */
function Host() {
  const initial = useRef((() => {
    const scene = emptyScene(); scene.composition = { ...scene.composition, width: 480, height: 320 }
    const layer = newSplineLayerFromData(createPolylineSpline([{ x: 0, y: 0 }, { x: 80, y: 0 }], false), { name: 'Editable spline', x: 120, y: 120, openPath: true })
    scene.layers = [{ ...layer, id: 'spline' }]
    const timeline = newTimeline(); scene.timelines = [{ ...timeline, id: 'intro', durationMs: 1000, layerIds: ['spline'], tracks: [{ target: 'layers.spline.opacity', keyframes: [
      { id: 'manual-0', timeMs: 0, value: 1, easing: { type: 'hold' } }, { id: 'manual-1', timeMs: 1000, value: .6, easing: { type: 'linear' } },
    ] }] }]
    return scene
  })())
  const editor = useEditorState(initial.current), scene = editor.scene, assets = useAssetCache(scene.assets), snap = useSnapSettings()
  const [selected, setSelected] = useState<string | null>('spline'), [mode, setMode] = useState<ToolMode>('select')
  const [action, setAction] = useState('None'), [calls, setCalls] = useState(0)
  const choose = (name: string) => () => { setAction(name); setCalls(value => value + 1) }
  const [supported, setSupported] = useState(true)
  const [hostHeight, setHostHeight] = useState(600), [blockHost, setBlockHost] = useState(false), [isolated, setIsolated] = useState(false)
  return <main className="min-h-screen bg-gray-950 text-gray-100 p-4">
    <header className="flex items-center gap-2 mb-4">
      <h1 className="mr-auto">Toolbar and spline interaction acceptance</h1>
      <ProjectMenu mounted state={supported ? 'no-directory' : 'unsupported'} directoryName={null} lastSavedAt={null} snapshotCount={0}
        isSupported={supported} onPickDirectory={choose('Folder')} onSaveSnapshot={choose('Version')} onSaveSceneJson={choose('Save')}
        onCopySceneJson={choose('Copy')} onInspectJson={choose('Inspect')} />
      <button onClick={choose('Preview')}>Preview</button>
      <ExportMenu onExportRuntime={choose('Runtime')} onExportImage={choose('Image')} onExportSvg={choose('SVG')} onExportSequence={choose('Sequence')} onExportHtml={choose('HTML')} />
    </header>
    <div className="flex gap-3 mb-3">
      <button onClick={() => setHostHeight(height => height === 600 ? 360 : 600)}>Resize Canvas host</button>
      <button onClick={() => setBlockHost(value => !value)}>Toggle block host</button>
      <button onClick={() => setIsolated(value => !value)}>Toggle isolation bar</button>
      <button onClick={() => setSelected(null)}>Clear selection</button>
      <button onClick={() => setSelected('spline')}>Select spline</button>
      <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
      <button onClick={() => setSupported(value => !value)}>Toggle folder support</button>
      <button onClick={() => { const layer = editor.getScene().layers[0]; editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { name: `${layer.name} edited` }, layer)) }}>External edit</button>
    </div>
    <p role="status">Last action: {action} · Calls: {calls} · Tool: {mode}</p>
    <div data-testid="canvas-layout-host" style={{ height: hostHeight }} className="flex min-h-0 border border-gray-700 mt-2">
      <div className="h-full min-h-0 flex flex-1 flex-col">
        <LayerIsolationBar count={isolated ? 1 : 0} onExit={() => setIsolated(false)} />
        <div className={`${blockHost ? '' : 'flex'} flex-1 min-h-0 min-w-0`}>
      <SceneCanvas scene={scene} editor={editor} timeMs={0} selectedLayerId={selected}
        selectedLayerIds={new Set(selected ? [selected] : [])} assets={assets} onSelectLayer={id => setSelected(id)}
        selectedTimeline={scene.timelines[0]} toolMode={mode} onToolModeChange={setMode} snap={snap}
        splineDrawKind={mode === 'spline-draw' ? 'line' : null} splineAppendTargetId={selected}
        onDrawSplineLine={id => { setSelected(id); setMode('spline-draw') }} onSplineDrawCommit={() => setMode('select')} />
        </div>
      </div>
    </div>
    <pre id="source" className="text-xs whitespace-pre-wrap mt-4">{JSON.stringify(scene, null, 2)}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
