import { flushSync } from 'react-dom'
import { newRectLayer, newSplineLayerFromData } from '@/lib/defaults'
import { createCircleSpline, createDonutSpline } from '@/lib/spline'
import { assertSplineTopology } from '@/lib/spline/topology'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { fixture, current, frames, layer, tap, click, assert, equal } from './splineHarness'

/** Drive the real Scene Explorer row activation path, including its bulk
 * selection callback, against private source. Add picks must intercept before
 * single/range/additive selection and retain the same viewport Edit target. */
export async function checkSplineExplorerAttach(): Promise<string> {
  const scene = fixture(); scene.timelines = []
  const circle = newSplineLayerFromData(createCircleSpline({ radius: 25 }), { name: 'Explorer circle', x: 180, y: -45 })
  const donut = newSplineLayerFromData(createDonutSpline({ outerRadius: 40, innerRadius: 20 }), { name: 'Explorer donut', x: 50, y: 100 })
  circle.id = 'explorer-circle'; donut.id = 'explorer-donut'; circle.parentId = donut.parentId = 'parent'
  circle.transform.rotationDeg = -15; circle.transform.scaleY = .8
  const shape = newRectLayer(); shape.id = 'explorer-shape'
  scene.layers.push(circle, donut, shape)
  flushSync(() => { current().editor.resetScene(scene); current().select('spline'); current().setTime(0); current().setTool('select') })
  await frames(); await click('Spline object mode'); await click('Add existing splines')
  const initial = structuredClone(current().editor.getScene())
  /** Activate a rendered row, rather than bypassing the production list router. */
  const rowPick = async (id: string, modifiers: MouseEventInit = {}, keyboard = false) => {
    const row = document.querySelector(`[aria-label="Scene Explorer"] [data-virtual-row="${id}"]`)
    assert(row, `Missing Scene Explorer row ${id}`)
    flushSync(() => row.dispatchEvent(keyboard
      ? new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      : new MouseEvent('click', { bubbles: true, ...modifiers })))
    await frames()
  }
  const assertTarget = () => {
    assert(current().selected === 'spline' && current().controller.attaching && current().controller.active, 'Explorer pick replaced the Edit target or exited Add')
    const selected = document.querySelectorAll('[aria-label="Scene Explorer"] [role="treeitem"][aria-selected="true"]')
    assert(selected.length === 1 && selected[0].getAttribute('data-virtual-row') === 'spline', 'Explorer highlighted the source instead of the target')
  }
  await rowPick('spline'); equal(current().editor.getScene(), initial, 'Picking the target changed geometry'); assertTarget()
  await rowPick(shape.id, { shiftKey: true }); equal(current().editor.getScene(), initial, 'Non-spline pick changed geometry'); assertTarget()
  assert(document.querySelector('[aria-label="Scene Explorer"] [role="alert"]')?.textContent?.includes('existing spline'), 'Explorer rejection had no diagnostic')
  const matrix = resolveLayerWorldMatrix(circle, initial), points = Object.values(circle.spline!.points).map(point => matrix.applyToPoint(point))
  await rowPick(circle.id, { shiftKey: true, metaKey: true })
  const afterCircle = structuredClone(current().editor.getScene())
  assert(!afterCircle.layers.some(item => item.id === circle.id) && afterCircle.layers.some(item => item.id === donut.id), 'Explorer click did not consume only its source')
  assertTarget(); assertSplineTopology(layer().spline!)
  equal(layer().transform, initial.layers[1].transform, 'Explorer Attach changed target transform')
  equal(layer().style, initial.layers[1].style, 'Explorer Attach changed target appearance')
  const targetMatrix = resolveLayerWorldMatrix(layer(), afterCircle)
  for (const expected of points) assert(Object.values(layer().spline!.points).some(point => {
    const actual = targetMatrix.applyToPoint(point)
    return Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-6
  }), 'Explorer Attach moved source geometry')
  // Alternate the two surfaces within the same armed Add session.
  const hit = resolveLayerWorldMatrix(donut, afterCircle).applyToPoint(Object.values(donut.spline!.points)[0])
  await tap(targetMatrix.invert().applyToPoint(hit))
  const afterDonut = structuredClone(current().editor.getScene())
  assert(!afterDonut.layers.some(item => item.id === donut.id) && Object.keys(layer().spline!.contours).length === 6, 'Mixed Explorer/viewport picks lost the donut hole')
  assertTarget(); assertSplineTopology(layer().spline!)
  await click('Undo'); equal(current().editor.getScene(), afterCircle, 'Undo did not restore only the viewport source')
  await click('Undo'); equal(current().editor.getScene(), initial, 'Undo did not restore only the Explorer source')
  assert(!current().editor.canUndo, 'Explorer self/invalid/range picks created extra history')
  await click('Redo'); equal(current().editor.getScene(), afterCircle, 'Explorer Attach Redo failed')
  await click('Undo'); await rowPick(donut.id, {}, true)
  assert(!current().editor.getScene().layers.some(item => item.id === donut.id), 'Explorer keyboard activation did not Attach')
  assertTarget(); await click('Undo'); equal(current().editor.getScene(), initial, 'Keyboard Attach was not one Undo')
  await click('Add existing splines'); await rowPick(circle.id)
  assert(current().selected === circle.id && !current().controller.active, 'Normal Explorer selection did not resume after Add ended')
  equal(current().editor.getScene(), initial, 'Normal Explorer selection changed source')
  // Leave the successful native UI in the same armed state for visual review.
  flushSync(() => current().select('spline')); await frames()
  await click('Spline object mode'); await click('Add existing splines'); await rowPick(circle.id)
  return 'Scene Explorer click/Shift/Cmd/Enter attaches through the shared native owner; target, world positions and paint stay fixed; viewport picks interoperate; each pick has one Undo/Redo; normal selection resumes after Add ends.'
}
