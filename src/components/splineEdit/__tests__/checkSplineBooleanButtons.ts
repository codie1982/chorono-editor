import { flushSync } from 'react-dom'
import { emptyScene, newSplineLayerFromData } from '@/lib/defaults'
import { createRectangleSpline, mergeSplineData, translateSplineData } from '@/lib/spline'
import { evaluateBooleanOperation } from '@/lib/booleanOperations/evaluateOperation'
import { projectBooleanOperations } from '@/lib/booleanOperations/projectOperations'
import { flattenClosedPath } from '@/lib/geometry/flattenClosedPath'
import { ringArea } from '@/lib/geometry/boolean/rings'
import { current, frames, click, canvas, client, pointer, assert, equal, pickExplorerRow, raster } from './splineHarness'

/** Real operation buttons must apply the current Object selection immediately.
 * + then extends that same retained-input recipe from this spline or Explorer.
 * Tests source preservation, area identities, boundary topology and native Undo. */
export async function checkSplineBooleanButtons(): Promise<string> {
  const data = [0, 50, 220].map(x => translateSplineData(createRectangleSpline({ width: 100, height: 100 }), x, 0)).reduce(mergeSplineData)
  Object.values(data.subShapes).forEach((object, index) => { object.name = `Area ${index + 1}` })
  const target = { ...newSplineLayerFromData(data, { name: 'Compound areas', x: 180, y: 190 }), id: 'button-target' }
  const external = { ...newSplineLayerFromData(createRectangleSpline({ width: 60, height: 60 }), { x: 520, y: 190, name: 'External area' }), id: 'button-external' }
  const scene = { ...emptyScene(), layers: [target, external] }; scene.composition = { ...scene.composition, width: 640, height: 420, backgroundColor: '#ffffff' }
  const ids = Object.keys(data.subShapes)
  const owner = () => current().editor.getScene().layers.find(layer => layer.booleanOperation)!
  const checkArea = (expected: number) => {
    const evaluation = evaluateBooleanOperation(current().editor.getScene(), owner().booleanOperation!)
    const area = Math.abs(flattenClosedPath(evaluation.result.path, .25, 20000, 1000).reduce((sum, ring) => sum + ringArea(ring), 0))
    assert(Math.abs(area - expected) < 1e-6, `Direct ${owner().booleanOperation!.operation} produced ${area}, expected ${expected}`)
    return evaluation
  }
  for (const [operation, area] of [['Union', 15000], ['Subtract', 5000], ['Intersect', 5000], ['XOR', 10000]] as const) {
    flushSync(() => { current().editor.resetScene(structuredClone(scene)); current().select(target.id); current().setTime(0); current().setTool('select') }); await frames()
    await click('Spline object mode'); await click('Select spline object Area 1')
    const second = document.querySelector<HTMLButtonElement>('[aria-label="Select spline object Area 2"]')!
    flushSync(() => second.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))); await frames()
    equal(current().controller.ids, ids.slice(0, 2), 'Object UI did not keep a two-Object selection')
    const before = structuredClone(current().editor.getScene())
    await click(`Spline operation ${operation}`)
    assert(owner()?.booleanOperation?.inputs.length === 2, `${operation} button only selected a policy instead of applying`)
    assert(document.querySelector(`[aria-label="Spline operation ${operation}"]`)?.getAttribute('aria-pressed') === 'true', 'Operation toggle did not announce its active state')
    const result = checkArea(area)
    if (operation === 'Union') assert(Object.keys(result.spline.contours).length === 1, 'Union retained interior overlap edges')
    equal(current().editor.getScene().layers.find(layer => layer.id === target.id)!.spline, data, 'Operation button replaced original Béziers')
    assert(projectBooleanOperations(current().editor.getScene()).layers.find(layer => layer.id === target.id)!.spline!.subShapes[ids[2]], 'Operation consumed an unselected Object')
    const applied = structuredClone(current().editor.getScene())
    await click('Undo'); equal(current().editor.getScene(), before, 'Direct operation was not one Undo')
    await click('Redo'); equal(current().editor.getScene(), applied, 'Direct operation Redo changed IDs or sources')
  }
  await click('Spline operation Union')
  const beforePick = structuredClone(current().editor.getScene()), recipeId = owner().id
  await click('Add existing splines')
  const hit = client({ x: 400, y: 140 })
  pointer(canvas(), 'pointerdown', hit); await frames(); pointer(window, 'pointerup', hit); await frames()
  assert(owner().id === recipeId && owner().booleanOperation!.inputs.length === 3, '+ did not add another Object from the same spline')
  checkArea(25000)
  await click('Undo'); equal(current().editor.getScene(), beforePick, 'Same-spline + pick was not one Undo')
  await click('Redo'); await pickExplorerRow(external.id)
  assert(owner().id === recipeId && owner().booleanOperation!.inputs.length === 4, 'Explorer + pick did not extend the active operation')
  checkArea(28600)
  await click('Add existing splines'); await click('Done')
  assert((await raster()).some(value => value !== 255), 'Final union did not render its black outer stroke')
  return 'Union/Subtract/Intersect/XOR buttons immediately apply two selected Objects with one Undo/Redo. Union produces one exterior contour, keeps unselected Objects and original sources; + adds same-spline Objects and Explorer splines to that same recipe. Final raster shows the solved outer strokes.'
}
