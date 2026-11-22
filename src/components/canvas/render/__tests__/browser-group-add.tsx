import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import SceneCanvas from '@/components/SceneCanvas'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newRectLayer, newSplineLayerFromPrimitive } from '@/lib/defaults'
import { makeGroupSiblingLayersCmd } from '@/lib/editor/branches/HierarchyCommands'
import { createLayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { unionBounds } from '@/lib/geometry/boundsMath'
import { createLayerSelection, toggleLayerSelection } from '@/lib/selection/layerSelection'

const a = { ...newRectLayer(), id: 'shape', name: 'Shape', size: { width: 160, height: 90 } }
a.transform = { ...a.transform, x: 130, y: 140, anchorX: 80, anchorY: 45, rotationDeg: 15 }
const b = newSplineLayerFromPrimitive('rectangle', { width: 150, height: 110 })!
b.id = 'spline'; b.name = 'Spline'; b.transform = { ...b.transform, x: 480, y: 310, rotationDeg: -10 }
const source = { ...emptyScene(), layers: [a, b] }
const boundsFor = createLayerWorldBoundsResolver(source)
const bounds = unionBounds(boundsFor(a), boundsFor(b))!
const expectedCenter = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
const initial = new Map(source.layers.map(layer => [layer.id, resolveLayerWorldMatrix(layer, source).toArray()]))
const assets = new Map()

/** Isolated production canvas/command acceptance. All source is synthetic and
 * independent of the connected editor, project persistence and user selection.
 * DOM evidence compares world placement and pivot against the pre-group frame. */
function Subject() {
  const editor = useEditorState(source), snap = useSnapSettings()
  const [selection, setSelection] = useState(() => createLayerSelection(['shape', 'spline']))
  const [addition, setAddition] = useState('none')
  const ids = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds])
  const group = () => {
    const command = makeGroupSiblingLayersCmd(editor.getScene(), Array.from(ids))
    if (!command) return
    editor.dispatchCommand(command); setSelection(createLayerSelection([command.groupId]))
  }
  const wrapper = editor.scene.layers.find(layer => layer.type === 'group')
  const unchanged = source.layers.every(layer => {
    const next = editor.scene.layers.find(item => item.id === layer.id)!
    return resolveLayerWorldMatrix(next, editor.scene).toArray().every((value, i) => Math.abs(value - initial.get(layer.id)![i]) < 1e-7)
  })
  const pivot = wrapper ? resolveLayerWorldMatrix(wrapper, editor.scene).applyToPoint({ x: wrapper.transform.anchorX, y: wrapper.transform.anchorY }) : null
  const centered = pivot && Math.hypot(pivot.x - expectedCenter.x, pivot.y - expectedCenter.y) < 1e-7
  return <main style={{ background: '#111827', color: 'white', height: '100vh', fontFamily: 'sans-serif' }}>
    <nav style={{ display: 'flex', gap: 20, padding: 12 }}>
      <button onClick={() => setSelection(createLayerSelection(['shape', 'spline']))}>Select both</button>
      <button onClick={group}>Group selection</button><button onClick={editor.undo}>Undo</button>
      <button onClick={editor.redo}>Redo</button>
    </nav>
    <output aria-label="Group acceptance" style={{ display: 'block', padding: 12 }}>
      Placement {unchanged ? 'PASS' : 'FAIL'} · Center {wrapper ? centered ? 'PASS' : 'FAIL' : 'pending'} ·
      Pivot {pivot ? `${pivot.x.toFixed(3)}, ${pivot.y.toFixed(3)}` : 'none'} · Add {addition}
    </output>
    <section data-panel="canvas" style={{ display: 'flex', height: 'calc(100vh - 100px)' }}>
      <SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap} timeMs={0}
        selectedLayerId={selection.primaryId} selectedLayerIds={ids} isPlaying={false} toolMode="select"
        onSelectLayer={(id, shift) => setSelection(previous => !id ? createLayerSelection([])
          : shift ? toggleLayerSelection(previous, id) : createLayerSelection([id]))}
        onAddLayerKind={setAddition} menuHandlers={{ group }} />
    </section>
  </main>
}

document.body.style.margin = '0'
createRoot(document.getElementById('app')!).render(<Subject />)
