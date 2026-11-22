import { flushSync } from 'react-dom'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { fixture, current, frames, layer, tap, click, pointer, canvas, client, world, assert, equal } from './splineHarness'

/** Native Edit gizmos must constrain world movement without changing Layer TRS
 * under an animated, rotated/nonuniform parent. Uses the real gesture/Undo owner. */
export async function checkSplineEditAxes(): Promise<string> {
  flushSync(() => { current().editor.resetScene(fixture()); current().select('spline'); current().setTime(400); current().setTool('select') })
  await frames(); await click('Spline point mode')
  const point = Object.values(layer().spline!.points)[0]; await tap(point)
  const before = structuredClone(current().editor.getScene()), matrix = resolveLayerWorldMatrix(layer(), before, 400)
  const original = matrix.applyToPoint(point)
  for (const axis of ['X', 'Y']) {
    const arrow = document.querySelector<HTMLElement>(`[aria-label="Spline edit move axes"] [title="Drag — locks to ${axis} axis"]`)
    assert(arrow, `Spline Edit is missing its ${axis} arrow`)
    const rect = arrow.getBoundingClientRect(), start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const end = { x: start.x + 30, y: start.y + 18 }
    pointer(arrow, 'pointerdown', start); pointer(window, 'pointermove', end); await frames(); pointer(window, 'pointerup', end); await frames()
    const next = matrix.applyToPoint(layer().spline!.points[point.id]), scale = before.composition.width / canvas().getBoundingClientRect().width
    assert(Math.abs(next.x - original.x - (axis === 'X' ? 30 * scale : 0)) < 1e-6, `${axis} drag moved off its world axis`)
    assert(Math.abs(next.y - original.y - (axis === 'Y' ? 18 * scale : 0)) < 1e-6, `${axis} drag moved off its world axis`)
    equal(layer().transform, before.layers[1].transform, 'Edit arrow changed the object transform')
    equal(current().editor.getScene().timelines, before.timelines, 'Edit arrow changed animation keys')
    await click('Undo'); equal(current().editor.getScene(), before, 'Axis gesture was not one Undo')
  }
  const start = client(world(point)), end = { x: start.x + 36, y: start.y + 7 }
  pointer(canvas(), 'pointerdown', start); pointer(window, 'pointermove', end, { shiftKey: true }); await frames(); pointer(window, 'pointerup', end, { shiftKey: true }); await frames()
  const shifted = matrix.applyToPoint(layer().spline!.points[point.id])
  assert(Math.abs(shifted.y - original.y) < 1e-6 && shifted.x > original.x, 'Shift did not constrain the free point drag')
  await click('Undo'); equal(current().editor.getScene(), before, 'Shift move Undo failed')
  await click('Spline object mode'); await click('Select spline object Donut B')
  assert(document.querySelector('[aria-label="Spline edit move axes"]'), 'Object sub-selection lost its geometry axes')
  return 'Spline Point/Object Edit shows X/Y arrows; native axis and Shift drags constrain composition axes under animated/nonuniform parents, preserve root transform/keys, and undo one gesture at a time.'
}
