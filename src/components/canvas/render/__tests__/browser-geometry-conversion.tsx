import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import SceneCanvas from '@/components/SceneCanvas'
import GeometryEditPanel from '@/components/editorGeometry/GeometryEditPanel'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { Layer } from '@/lib/types'
import { prepareGeometryConversion, type ConversionTarget } from '@/lib/editor/commands-geometry-conversion'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { containsMesh2DPoint } from '@/lib/geometry/mesh2d/Mesh2DGeometryQueries'

/** Synthetic, unpersisted frame-with-hole plus separate island. Every command
 * and canvas/panel below is production code; no connected document is touched. */
function rectangle(id: string, x: number, y: number, width: number, height: number): Layer {
  const layer = newRectLayer()
  return { ...layer, id, name: id, size: { width, height },
    transform: { ...layer.transform, x, y, anchorX: 0, anchorY: 0 },
    style: { fill: { type: 'solid', color: '#3B82F6', opacity: 100 }, cornerRadius: 0,
      stroke: { width: 2, color: '#172554' } } }
}
const layers = [rectangle('top', 100, 100, 200, 30), rectangle('bottom', 100, 270, 200, 30),
  rectangle('left', 100, 130, 30, 140), rectangle('right', 270, 130, 30, 140), rectangle('island', 380, 100, 80, 80)]
const rounded = rectangle('rounded', 500, 300, 180, 130)
rounded.style = { ...rounded.style, cornerRadius: 25 }
const base = emptyScene()
const initial = { ...base, composition: { ...base.composition, width: 800, height: 500 }, layers: [...layers, rounded] }
const assets = new Map()

/** Visual acceptance host: native undo, multi-selection, modifier controls,
 * mesh stroke/hole painting and portable source all use the normal contracts. */
function Subject() {
  const editor = useEditorState(initial), snap = useSnapSettings()
  const [selected, setSelected] = useState(layers.map(layer => layer.id))
  const ids = useMemo(() => new Set(selected), [selected])
  const layer = editor.scene.layers.find(item => item.id === selected[0]) ?? null
  const convert = (target: ConversionTarget) => {
    const plan = prepareGeometryConversion(editor.getScene(), selected, target)
    editor.dispatchCommand(plan.command); setSelected([plan.layerId])
  }
  const spline = layer?.spline, mesh = layer?.mesh2d
  const hole = mesh ? !containsMesh2DPoint(mesh.geometry, 100, 100) && containsMesh2DPoint(mesh.geometry, 10, 100) : null
  return <main className="h-screen bg-gray-900 text-xs text-gray-100">
    <nav className="flex gap-4 p-3">
      <button onClick={() => setSelected(editor.scene.layers.filter(layer => layer.id !== 'rounded').map(layer => layer.id))}>Select frame and island</button>
      <button onClick={() => setSelected(['rounded'])}>Select rounded shape</button>
      <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
    </nav>
    <output aria-label="Conversion acceptance" className="block px-3 pb-3">
      Type {layer?.type} · Elements {spline ? Object.keys(spline.subShapes).length : '—'} ·
      Contours {spline ? Object.keys(spline.contours).length : mesh?.boundaryRings?.length ?? '—'} ·
      Hole {hole === null ? 'pending' : hole ? 'PASS' : 'FAIL'} · Modifiers {layer?.geometryConversion?.stages.length ?? 0}
    </output>
    <div className="flex h-[calc(100vh-80px)]">
      <section className="min-w-0 flex-1"><SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap} timeMs={0}
        menuHandlers={{ convertToSpline: () => convert('spline'), convertToMesh2D: () => convert('mesh2d') }}
        selectedLayerId={selected[0] ?? null} selectedLayerIds={ids} isPlaying={false} toolMode="select"
        onSelectLayer={(id, shift) => setSelected(previous => !id ? [] : shift ? Array.from(new Set([...previous, id])) : [id])} /></section>
      <aside className="w-[400px] border-l border-gray-700">
        <GeometryEditPanel key={`${layer?.id}:${layer?.type}`} layer={layer} selectedIds={selected}
          getScene={editor.getScene} getRevision={editor.getRevision} getDocumentSignal={editor.getDocumentSignal}
          isTransactionActive={editor.isTransactionActive} dispatchCommand={editor.dispatchCommand}
          onSelectLayer={id => setSelected([id])} selectedPointId={null} onClearPoint={() => {}}
          onLayerChange={next => { const before = editor.getScene().layers.find(item => item.id === next.id)!; editor.dispatchCommand(makeUpdateLayerCmd(next.id, next, before)) }} />
      </aside>
    </div>
  </main>
}

document.body.style.margin = '0'
createRoot(document.getElementById('app')!).render(<Subject />)
