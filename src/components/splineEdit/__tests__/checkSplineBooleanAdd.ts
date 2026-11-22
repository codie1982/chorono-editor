import { flushSync } from 'react-dom'
import { emptyScene, newSplineLayerFromData } from '@/lib/defaults'
import { createRectangleSpline } from '@/lib/spline'
import { evaluateBooleanOperation } from '@/lib/booleanOperations/evaluateOperation'
import { flattenClosedPath } from '@/lib/geometry/flattenClosedPath'
import { ringArea } from '@/lib/geometry/boolean/rings'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { current, frames, canvas, client, pointer, click, choose, key, assert, equal, pickExplorerRow } from './splineHarness'

/** Full native Boolean Add → re-edit → append → Merge/point edit → Separate
 * acceptance. Analytic rectangle areas validate the shared solver independently
 * of the UI recipe labels. Only the disposable fixture source is replaced. */
export async function checkSplineBooleanAdd(): Promise<string> {
  const scene = emptyScene(); scene.composition = { ...scene.composition, width: 640, height: 420 }
  scene.layers = [200, 250, 350].map((x, index) => ({ ...newSplineLayerFromData(createRectangleSpline({ width: 100, height: 100 }), { x, y: 150, name: ['Target A', 'Input B', 'Input C'][index] }), id: ['boolean-a', 'boolean-b', 'boolean-c'][index] }))
  flushSync(() => { current().editor.resetScene(scene); current().select('boolean-a'); current().setTime(0); current().setTool('select') })
  await frames(); await click('Spline object mode')
  assert(document.querySelector<HTMLSelectElement>('[aria-label="Spline add operation"]')?.value === 'union', 'Add Spline must default to Union')
  const initial = structuredClone(current().editor.getScene())
  await click('Add existing splines'); await pickExplorerRow('boolean-b')
  const owner = () => { const found = current().editor.getScene().layers.find(layer => layer.booleanOperation); assert(found, 'The native pick did not create a Boolean recipe'); return found }
  const id = owner().id
  const assertTarget = () => assert(current().selected === 'boolean-a' && current().controller.attaching, 'Boolean pick lost its active target')
  assertTarget()
  for (const source of initial.layers) equal(current().editor.getScene().layers.find(layer => layer.id === source.id)?.spline, source.spline, 'Non-destructive Boolean replaced original spline geometry')
  const checkArea = (expected: number) => {
    const result = evaluateBooleanOperation(current().editor.getScene(), owner().booleanOperation!).result
    const area = result.path.commands.length ? Math.abs(flattenClosedPath(result.path, .25, 20000, 1000).reduce((sum, ring) => sum + ringArea(ring), 0)) : 0
    assert(Math.abs(area - expected) < 1e-6, `Incorrect ${owner().booleanOperation!.operation} area: ${area}`)
  }
  checkArea(15000)
  for (const [mode, area] of [['subtract', 5000], ['intersect', 5000], ['xor', 10000], ['union', 15000]] as const) {
    await choose('Spline add operation', mode); checkArea(area); assertTarget()
    assert(owner().id === id, 'Changing operation created a second Boolean group')
  }
  const beforeAppend = structuredClone(current().editor.getScene())
  const sourceHit = client({ x: 350, y: 100 })
  pointer(canvas(), 'pointerdown', sourceHit); await frames(); pointer(window, 'pointerup', sourceHit); await frames()
  assert(owner().booleanOperation!.inputs.length === 3 && owner().id === id, 'Viewport Add did not extend the existing recipe')
  checkArea(25000); assertTarget()
  const appended = structuredClone(current().editor.getScene())
  await click('Undo'); equal(current().editor.getScene(), beforeAppend, 'Appending an input was not one Undo')
  await click('Redo'); equal(current().editor.getScene(), appended, 'Append Redo failed')
  parseSceneJson(JSON.stringify(appended))
  const outputId = owner().booleanOperation!.resultLayerId
  await click('Merge Paths')
  const baked = structuredClone(current().editor.getScene())
  assert(current().selected === outputId && !baked.layers.some(layer => layer.booleanOperation || layer.booleanResultFor), 'Merge did not select ordinary editable spline geometry')
  assert(!baked.layers.some(layer => initial.layers.some(source => source.id === layer.id)), 'Merge left fully consumed input layers visible')
  const output = baked.layers.find(layer => layer.id === outputId)!, point = Object.values(output.spline!.points)[0]
  assert(Object.values(output.spline!.subShapes).every(sub => sub.editable), 'Merged spline remains generated/read-only')
  await click('Spline point mode')
  const p = client(resolveLayerWorldMatrix(output, baked).applyToPoint(point))
  pointer(canvas(), 'pointerdown', p); await frames(); pointer(window, 'pointerup', p); await frames()
  key('ArrowRight'); await frames()
  const edited = current().editor.getScene().layers.find(layer => layer.id === outputId)!
  assert(edited.spline!.points[point.id].x === point.x + 1, 'Merged result did not accept native point editing')
  equal(edited.transform, output.transform, 'Merged point editing changed object transform')
  await click('Undo'); equal(current().editor.getScene(), baked, 'Point edit was not one Undo')
  await click('Undo'); equal(current().editor.getScene(), appended, 'Merge Undo did not restore recipe and original sources')
  flushSync(() => current().select('boolean-a')); await frames(); await click('Spline object mode')
  await click('Separate Inputs')
  assert(!current().editor.getScene().layers.some(layer => layer.booleanOperation || layer.booleanResultFor), 'Separate did not release the recipe')
  for (const source of initial.layers) equal(current().editor.getScene().layers.find(layer => layer.id === source.id)?.spline, source.spline, 'Separate lost original geometry')
  await click('Undo'); equal(current().editor.getScene(), appended, 'Separate was not one Undo')
  await choose('Spline add operation', 'xor'); await click('Add existing splines')
  return 'Boolean Add defaults to Union; Explorer and viewport use one recipe; Union/Subtract/Intersect/XOR satisfy area identities, preserve original sources, re-edit and append with Undo/Redo. Merge produces editable points; Separate and Undo restore original inputs.'
}
