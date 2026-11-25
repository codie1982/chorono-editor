import { flushSync } from 'react-dom'
import { emptyScene, newSplineLayerFromData } from '@/lib/defaults'
import { createRectangleSpline, mergeSplineData, translateSplineData, splineToPathDefinition } from '@/lib/spline'
import { flattenClosedPath } from '@/lib/geometry/flattenClosedPath'
import { ringArea } from '@/lib/geometry/boolean/rings'
import { current, frames, click, key, canvas, client, pointer, assert, equal, pickExplorerRow, raster } from './splineHarness'

/** Default area actions publish editable geometry immediately, preserving
 * only unselected sources; no recipe group or generated child leaks to the UI. */
export async function checkSplineBooleanButtons(): Promise<string> {
  const data = [0, 50, 220].map(x => translateSplineData(createRectangleSpline({ width: 100, height: 100 }), x, 0)).reduce(mergeSplineData)
  Object.values(data.subShapes).forEach((object, index) => { object.name = `Area ${index + 1}` })
  const target = { ...newSplineLayerFromData(data, { name: 'Compound areas', x: 180, y: 190 }), id: 'button-target' }
  const external = { ...newSplineLayerFromData(createRectangleSpline({ width: 60, height: 60 }), { x: 520, y: 190, name: 'External area' }), id: 'button-external' }
  const scene = { ...emptyScene(), layers: [target, external] }; scene.composition = { ...scene.composition, width: 640, height: 420, backgroundColor: '#ffffff' }
  const selected = () => current().editor.getScene().layers.find(layer => layer.id === current().selected)!
  const checkArea = (expected: number) => {
    const path = splineToPathDefinition(selected().spline!)
    const area = Math.abs(flattenClosedPath(path, .25, 20000, 1000).reduce((sum, ring) => sum + ringArea(ring), 0))
    assert(Math.abs(area - expected) < 1e-6, `Editable Boolean area ${area}, expected ${expected}`)
  }
  for (const [operation, area] of [['Subtract', 5000], ['Intersect', 5000], ['XOR', 10000], ['Union', 15000]] as const) {
    flushSync(() => { current().editor.resetScene(structuredClone(scene)); current().select(target.id); current().setTime(0); current().setTool('select') }); await frames()
    key('3'); await frames(); await click('Select spline object Area 1')
    const second = document.querySelector<HTMLButtonElement>('[aria-label="Select spline object Area 2"]')!
    flushSync(() => second.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))); await frames()
    const before = structuredClone(current().editor.getScene())
    await click(`Spline operation ${operation}`)
    assert(!current().editor.getScene().layers.some(layer => layer.booleanOperation || layer.booleanResultFor), 'Default action left a separate Boolean operation')
    assert(selected().type === 'spline' && current().selected !== target.id, 'Result selection remained on the original source')
    assert(current().controller.active && current().controller.layerId === current().selected, 'Editable result lost its Edit session')
    assert(current().controller.sourceGhosts.length === 2 && document.querySelectorAll('[data-boolean-source-ghost]').length === 2, 'Original sources were not faded ghosts')
    assert(!document.querySelector('[aria-label="Boolean edit legend"]'), 'Materialized result retained a live Boolean recipe overlay')
    checkArea(area)
    if (operation === 'Union') assert(Object.keys(selected().spline!.contours).length === 1, 'Union retained overlap interiors')
    const remaining = current().editor.getScene().layers.find(layer => layer.id === target.id)!
    assert(Object.keys(remaining.spline!.subShapes).length === 1, 'Operation removed the unselected third Object')
    const applied = structuredClone(current().editor.getScene())
    await click('Undo'); equal(current().editor.getScene(), before, 'Solve + Merge was not one Undo')
    await click('Redo'); equal(current().editor.getScene(), applied, 'Solve + Merge Redo changed identities')
  }
  key('3'); await frames(); await click('Spline operation Union'); await click('Add existing splines')
  const hit = client({ x: 400, y: 140 }); pointer(canvas(), 'pointerdown', hit); pointer(window, 'pointerup', hit); await frames()
  assert(current().controller.attaching, '+ did not continue on the new editable result')
  checkArea(25000)
  await pickExplorerRow(external.id); checkArea(28600)
  assert(current().editor.getScene().layers.length === 1 && selected().type === 'spline', 'Consecutive + picks left parent/child groups')
  await click('Add existing splines'); await click('Separate Paths')
  assert(Object.keys(selected().spline!.subShapes).length === 3, 'Separate Paths did not split disconnected elements')
  const separated = structuredClone(current().editor.getScene())
  await click('Compound Path'); assert(Object.keys(selected().spline!.subShapes).length === 1, 'Compound Path did not regroup contours')
  await click('Undo'); equal(current().editor.getScene(), separated, 'Compound Path was not one Undo')
  await click('Done'); assert((await raster()).some(value => value !== 255), 'Final editable spline did not render')
  return 'Default Union/Subtract/Intersect/XOR solves and merges in one Undo to a selected editable parent spline. Source ghosts are faded; no Boolean group/child or overlap interiors remain. + continues on new results from viewport/Explorer. Compound Path and Separate Paths are native and undoable.'
}
