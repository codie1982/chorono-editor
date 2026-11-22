import { flushSync } from 'react-dom'
import { newRectLayer, newSplineLayerFromData } from '@/lib/defaults'
import { createCircleSpline, createDonutSpline } from '@/lib/spline'
import { assertSplineTopology } from '@/lib/spline/topology'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { fixture, current, frames, layer, tap, click, key, contextAt, choose, assert, equal } from './splineHarness'

/** Native Add Spline acceptance on disposable source. Picks go through the real
 * canvas under a rotated/non-uniform parent, then through guarded Attach/history.
 * No connected document or external persistence is accessed. */
export async function checkSplineAttachPicking(): Promise<string> {
  const scene = fixture(); scene.timelines = []
  const a = newSplineLayerFromData(createCircleSpline({ radius: 25 }), { name: 'Pick circle', x: 180, y: -45 })
  const b = newSplineLayerFromData(createDonutSpline({ outerRadius: 40, innerRadius: 20 }), { name: 'Pick donut', x: 50, y: 100 })
  a.id = 'pick-a'; b.id = 'pick-b'; a.parentId = b.parentId = 'parent'
  a.transform.rotationDeg = -10
  const shape = newRectLayer(); shape.id = 'not-a-spline'; shape.transform.x = 500; shape.transform.y = 350
  scene.layers.push(a, b, shape)
  flushSync(() => { current().editor.resetScene(scene); current().select('spline'); current().setTime(0); current().setTool('select') })
  await frames(); await click('Spline point mode'); await choose('Spline add operation', 'attach')
  const initial = structuredClone(current().editor.getScene())
  await click('Add existing splines')
  assert(current().controller.attaching && current().controller.mode === 'object', '+ did not enable existing-object picking')
  assert(!document.querySelector('[aria-label="Add to this Spline"] [aria-label="Add spline object"]'), 'Add Spline still presents a drawing primitive picker')
  equal(current().editor.getScene(), initial, '+ changed the source')
  await tap({ x: -200, y: -100 })
  equal(current().editor.getScene(), initial, 'Empty Add pick changed source')
  assert(current().selected === 'spline' && current().controller.attaching, 'Empty pick lost the target or Add mode')
  /** Convert a world hit into the harness target-local pointer contract. */
  const tapWorld = (point: { x: number; y: number }) => tap(resolveLayerWorldMatrix(layer(), current().editor.getScene()).invert().applyToPoint(point))
  const attach = async (id: string) => {
    const before = current().editor.getScene(), source = before.layers.find(item => item.id === id)!
    const matrix = resolveLayerWorldMatrix(source, before)
    const point = Object.values(source.spline!.points)[0]
    const expectedWorld = matrix.applyToPoint(point)
    await tapWorld(expectedWorld)
    assert(!current().editor.getScene().layers.some(item => item.id === id), 'Viewport pick did not consume the source spline')
    assert(current().selected === 'spline' && current().controller.attaching, 'Attach lost its target or did not allow consecutive picks')
    assert(!current().editor.isTransactionActive(), 'Attach started a transform transaction')
    const targetMatrix = resolveLayerWorldMatrix(layer(), current().editor.getScene())
    assert(Object.values(layer().spline!.points).some(item => {
      const world = targetMatrix.applyToPoint(item)
      return Math.hypot(world.x - expectedWorld.x, world.y - expectedWorld.y) < 1e-6
    }), 'Attach changed a picked point’s world position')
    equal(layer().transform, initial.layers[1].transform, 'Attach changed the target transform')
    equal(layer().style, initial.layers[1].style, 'Attach changed target paint')
    assertSplineTopology(layer().spline!)
  }
  await attach(a.id)
  const afterA = structuredClone(current().editor.getScene())
  await tapWorld({ x: 505, y: 355 })
  equal(current().editor.getScene(), afterA, 'A Basic Shape was attached as a spline')
  assert(Array.from(document.querySelectorAll('[role="alert"],[role="status"]')).some(item => item.textContent?.includes('existing spline')), 'Invalid pick had no visible diagnostic')
  await attach(b.id)
  const afterB = structuredClone(current().editor.getScene())
  assert(Object.keys(layer().spline!.subShapes).length === 4 && Object.keys(layer().spline!.contours).length === 6, 'Consecutive picks lost elements or donut hole')
  await click('Undo'); equal(current().editor.getScene(), afterA, 'Undo did not restore only the last picked layer')
  await click('Undo'); equal(current().editor.getScene(), initial, 'Undo did not restore the first picked layer')
  assert(!current().editor.canUndo, 'Toggle or empty pick created an extra Undo')
  await click('Redo'); equal(current().editor.getScene(), afterA, 'First Attach Redo failed')
  await click('Redo'); equal(current().editor.getScene(), afterB, 'Second Attach Redo failed')
  await click('Add existing splines'); assert(!current().controller.attaching, '+ did not disable Add mode')
  await click('Add existing splines'); key('Escape'); await frames()
  assert(!current().controller.attaching && current().controller.active, 'Escape exited Edit instead of only finishing Add')
  await click('Add existing splines'); await contextAt({ x: -200, y: -100 })
  assert(!current().controller.attaching && !document.querySelector('[role="menu"]'), 'Right-click did not finish Add cleanly')
  await click('Add existing splines'); await click('Spline edge mode')
  assert(!current().controller.attaching, 'Changing sub-object mode kept Add active')
  await click('Add existing splines'); await click('Done')
  assert(!current().controller.attaching && !current().controller.active, 'Leaving Edit kept Add active')
  equal(current().editor.getScene(), afterB, 'Finishing Add changed source or history')
  await click('Spline object mode'); await choose('Spline add operation', 'attach'); await click('Add existing splines')
  return 'Add Spline + picks existing layers consecutively, keeps world geometry/holes/target paint, gives each pick one Undo/Redo, ignores empty/invalid picks and cancels with +/Esc/right-click/mode exit'
}
