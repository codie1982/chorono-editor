import { flushSync } from 'react-dom'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { MeshComponentSelection } from '@/lib/geometry/mesh2d/selection/MeshComponentSelection'
import { current, reset, frames, click, key, fixture, pointer, canvas, client, assert, equal } from './splineHarness'

/** Native registry digits, real controls, vertex/edge gestures, fresh ghost and
 * one-Undo same-Edit-Mesh updates. Form fields must retain numeric input. */
export async function checkGeometryEditShortcuts(): Promise<string> {
  await reset()
  const splineBefore = structuredClone(current().editor.getScene())
  for (const [keyName, mode] of [['1', 'point'], ['2', 'edge'], ['3', 'object']] as const) {
    key(keyName); await frames()
    assert(current().controller.active && current().controller.mode === mode, `${keyName} did not enter Spline ${mode}`)
    assert(document.querySelector(`[aria-label="Spline ${mode} mode"]`)?.getAttribute('aria-pressed') === 'true', 'Spline button did not reflect the shortcut')
  }
  equal(current().editor.getScene(), splineBefore, 'Edit entry changed source/history')
  const mesh = newStructuredGridMesh2DLayer(); mesh.id = 'keyboard-mesh'
  mesh.transform = { ...mesh.transform, x: 140, y: 100, rotationDeg: 12 }
  const scene = { ...fixture(), layers: [mesh], timelines: [] }
  flushSync(() => { current().editor.resetScene(scene); current().select(mesh.id); current().setTool('select') }); await frames()
  key('1'); await frames()
  assert(current().geometryEdit.active && current().geometryEdit.mode === 'point', '1 did not enter Mesh Point')
  const layer = () => current().editor.getScene().layers.find(item => item.id === mesh.id)!
  const before = structuredClone(current().editor.getScene()), matrix = resolveLayerWorldMatrix(layer(), before)
  const model = new MeshComponentSelection(layer().mesh2d!.geometry, matrix), chosen = model.points[0]
  const start = client(chosen), end = { x: start.x + 2, y: start.y + 1 }
  pointer(canvas(), 'pointerdown', start); pointer(window, 'pointermove', end); await frames(); pointer(window, 'pointerup', end); await frames()
  const edited = structuredClone(current().editor.getScene()), originalGeometry = before.layers[0].mesh2d!.geometry
  const positions = layer().mesh2d!.geometry.positions
  assert(positions.some((value, index) => Math.floor(index / 2) === 0 && Math.abs(value - originalGeometry.positions[index]) > 1e-6), 'Point mode did not move its chosen vertex')
  positions.forEach((value, index) => { if (Math.floor(index / 2) !== 0) assert(value === originalGeometry.positions[index], 'Point mode moved an unselected vertex') })
  equal(layer().transform, before.layers[0].transform, 'Mesh Point edited real TRS')
  const ghost = document.querySelector('[data-edit-ghost]')?.getAttribute('d')
  assert(ghost, 'Mesh shortcut entry did not capture the original ghost')
  await click('Undo'); equal(current().editor.getScene(), before, 'Point drag was not one Undo')
  await click('Redo'); equal(current().editor.getScene(), edited, 'Point Redo changed source')
  key('2'); await frames()
  assert(current().geometryEdit.mode === 'edge' && document.querySelector('[aria-label="Mesh edge selection"]'), '2 did not enter Mesh Edge')
  const edgeModel = new MeshComponentSelection(layer().mesh2d!.geometry, matrix), edge = edgeModel.edges.find(edge => edge.a === 0 || edge.b === 0)!
  const a = edgeModel.points[edge.a], b = edgeModel.points[edge.b], hit = client({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  pointer(canvas(), 'pointerdown', hit); pointer(window, 'pointerup', hit); await frames(); key('ArrowRight'); await frames()
  assert(layer().modifierStack!.modifiers.filter(record => record.type === 'meshTransform').length === 1, 'Mesh Edge made another Edit Mesh')
  assert(document.querySelector('[data-edit-ghost]')?.getAttribute('d') === ghost, 'Changing selection levels reset the initial ghost')
  key('3'); await frames(); assert(current().geometryEdit.mode === 'face', '3 did not enter Mesh Face')
  assert(document.querySelector('[data-mesh-vertices]'), 'Mesh vertices are hidden in Face mode')
  key('Escape'); await frames()
  if (current().geometryEdit.active) { key('Escape'); await frames() }
  assert(!current().geometryEdit.active, 'Escape did not leave Mesh Edit')
  key('1'); await frames()
  assert(document.querySelector('[data-edit-ghost]')?.getAttribute('d') !== ghost, 'Re-entry did not take a fresh geometry ghost')
  const input = document.createElement('input'); document.body.append(input); input.focus()
  flushSync(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))); await frames()
  assert(current().geometryEdit.mode === 'point', 'Digit in a text input changed Edit mode'); input.remove()
  await reset()
  return '1/2/3 enter Spline Point/Edge/Object and Mesh Vertex/Edge/Face; Mesh vertices/edges transform in one Edit Mesh, fixed TRS/ghost and separate Undo. Re-entry refreshes ghost; numeric inputs retain keys.'
}
