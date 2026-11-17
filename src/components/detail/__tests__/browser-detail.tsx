import { useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useLayerIsolation } from '@/app/hooks/useLayerIsolation'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { useItemDetail, useInactiveDetailSurface } from '../useItemDetail'
import { ItemDetailWorkspace } from '../ItemDetailWorkspace'
import { emptyScene, newRectLayer, newTimeline, newBezierPathLayer } from '@/lib/defaults'
import { newModelLayer } from '@/lib/model3d/source/modelDefaults'
import { triangleDocument } from '@/lib/model3d/__tests__/fixtures'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import SceneCanvas from '@/components/SceneCanvas'
import LayerPanel from '@/components/LayerPanel'
import { checkItemDetail } from './checkItemDetail'
import { checkModelClips } from './checkModelClips'

/** Actual source/dock-like parent and production detail UI. Local fixture bytes
 * only: never reads/writes a user scene, session recovery or MCP connection.
 */
function fixture() {
  const source = emptyScene(), shape = { ...newRectLayer(), id: 'card', name: 'Card · manual', size: { width: 100, height: 70 } }
  shape.transform.x = 50; shape.transform.y = 60
  const model = newModelLayer('robot', 'robot-source', 'Robot detail'); model.transform.x = 200; model.transform.y = 30; model.size = { width: 160, height: 160 }
  const path = { ...newBezierPathLayer(), id: 'path', name: 'Curve detail', path: { closed: false, anchors: [{ x: 10, y: 10 }, { x: 110, y: 100 }] } }
  return { ...source, composition: { ...source.composition, width: 400, height: 250 }, layers: [shape, model, path],
    assets: [{ id: 'robot-source', type: 'model3d' as const, name: 'Triangle.gltf', url: `data:model/gltf+json;base64,${btoa(JSON.stringify(triangleDocument()))}` }],
    timelines: [{ ...newTimeline(), id: 'main', autoplay: false, layerIds: ['card'], tracks: [{ target: 'layers.card.transform.x',
      keyframes: [{ id: 'manual-outer-key', timeMs: 0, value: 50, easing: { type: 'linear' as const } }] }] }] }
}
let current: EditorStateReturn

/** The fixture keeps the main viewport mounted and inert, as page.tsx does.
 * State observations below are DOM/source evidence, not a second UI model.
 */
function Host() {
  const main = useEditorState(fixture()), detail = useItemDetail(main)
  const [selected, setSelected] = useState<string | null>('card'), [report, setReport] = useState('Ready')
  const ids = useMemo(() => new Set(selected ? [selected] : []), [selected])
  const background = useInactiveDetailSurface<HTMLDivElement>(!!detail.session)
  const assets = useAssetCache(main.scene.assets, { managed: true }), snap = useSnapSettings({ persist: false })
  const isolation = useLayerIsolation(main.scene, main.getDocumentSignal())
  useLayoutEffect(() => { current = main })
  const select = (id: string | null) => setSelected(id)
  const noop = () => {}
  return <div style={{ height: 760 }} className="flex flex-col bg-gray-950 text-gray-200">
    <div className="flex gap-3 p-2"><button id="run-detail" onClick={async () => setReport(await checkItemDetail())}>Run detail acceptance</button>
      <button id="run-model-clips" onClick={async () => setReport(await checkModelClips())}>Run model clip acceptance</button>
      <button id="external-edit" onClick={() => { const layer = main.getScene().layers[0]; main.dispatchCommand(makeUpdateLayerCmd(layer.id, { name: 'Manual update while detail open' }, layer)) }}>External source edit</button>
      <button id="reset-document" onClick={() => main.resetScene(fixture())}>Replace document</button>
      <button id="main-undo" onClick={main.undo}>Main Undo</button><button id="main-redo" onClick={main.redo}>Main Redo</button>
    </div>
    <pre id="detail-report" className="text-xs whitespace-pre-wrap">{report}</pre>
    <output id="detail-state" data-open={String(!!detail.session)} data-revision={main.getRevision()} data-undo={main.committedHistory.past.length}
      data-selection={selected ?? ''} data-isolated={String(isolation.active)} />
    <textarea aria-label="Fixture committed source" id="detail-source" readOnly value={JSON.stringify(main.committedScene)} style={{ height: 50 }} />
    <div className="flex-1 min-h-0 relative">
      <div ref={background} id="main-detail-background" className="h-full flex" style={{ visibility: detail.session ? 'hidden' : undefined }}>
        <div style={{ width: 275 }}><LayerPanel layers={main.scene.layers} selectedId={selected} selectedIds={ids} onSelect={select} onAdd={noop}
          onAddImage={noop} onAddVideo={noop} onAddAudio={noop} onDelete={noop} onReorder={noop} onToggleFlag={noop} onRename={noop}
          onEditContent={detail.open} onIsolateLayers={isolation.enter} onIsolateSelection={() => isolation.enter(Array.from(ids))}
          onExitIsolation={isolation.exit} isolationActive={isolation.active} /></div>
        <div className="flex-1 min-w-0"><SceneCanvas scene={main.scene} displayScene={isolation.scene} editor={main} timeMs={0} assets={assets} snap={snap}
          selectedLayerId={selected} selectedLayerIds={ids} onSelectLayer={select} onEditContent={detail.open} onIsolateContent={isolation.enter} /></div>
      </div>
      {detail.session && <ItemDetailWorkspace key={detail.session.id} session={detail.session} editor={main} timeMs={0} onClose={detail.close} />}
    </div>
    <button id="open-model-detail" onClick={() => detail.open('robot')}>Open model detail</button>
    <button id="open-path-detail" onClick={() => detail.open('path')}>Open path detail</button>
  </div>
}

/** Expose only a source owner to the local acceptance routine. */
export function fixtureEditor() { return current }
createRoot(document.getElementById('app')!).render(<Host />)
