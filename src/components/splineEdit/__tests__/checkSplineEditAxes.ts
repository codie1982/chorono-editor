import { flushSync } from 'react-dom'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { transformAxisFrame } from '@/lib/canvas/math/transformAxes'
import { fixture, current, frames, layer, tap, click, pointer, canvas, client, world, assert, equal, choose } from './splineHarness'

/** Native Edit gizmos must constrain world movement without changing Layer TRS
 * under an animated, rotated/nonuniform parent. Uses the real gesture/Undo owner. */
export async function checkSplineEditAxes(): Promise<string> {
  flushSync(() => { current().editor.resetScene(fixture()); current().select('spline'); current().setTime(400); current().setTool('select') })
  await frames(); await click('Spline point mode')
  const point = Object.values(layer().spline!.points)[0]; await tap(point)
  const before = structuredClone(current().editor.getScene()), matrix = resolveLayerWorldMatrix(layer(), before, 400)
  const original = matrix.applyToPoint(point)
  for (const space of ['scene', 'local'] as const) {
  await choose('Transform axes', space)
  equal(current().editor.getScene(), before, 'Changing toolbox axes edited source')
  const frame = transformAxisFrame(space, matrix)
  for (const axis of ['X', 'Y']) {
    const arrow = document.querySelector<HTMLElement>(`[aria-label="Spline edit move axes"] [title="Drag — locks to ${axis} axis"]`)
    assert(arrow, `Spline Edit is missing its ${axis} arrow`)
    const rect = arrow.getBoundingClientRect(), start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const offset = frame.applyToVector({ x: 30, y: 18 }), end = { x: start.x + offset.x, y: start.y + offset.y }
    pointer(arrow, 'pointerdown', start); pointer(window, 'pointermove', end); await frames(); pointer(window, 'pointerup', end); await frames()
    const next = matrix.applyToPoint(layer().spline!.points[point.id]), scale = before.composition.width / canvas().getBoundingClientRect().width
    const expected = frame.applyToVector({ x: axis === 'X' ? 30 * scale : 0, y: axis === 'Y' ? 18 * scale : 0 })
    assert(Math.abs(next.x - original.x - expected.x) < 1e-6 && Math.abs(next.y - original.y - expected.y) < 1e-6, `${space} ${axis} drag moved off its displayed axis`)
    equal(layer().transform, before.layers[1].transform, 'Edit arrow changed the object transform')
    equal(current().editor.getScene().timelines, before.timelines, 'Edit arrow changed animation keys')
    await click('Undo'); equal(current().editor.getScene(), before, 'Axis gesture was not one Undo')
  }
  const start = client(world(point)), offset = frame.applyToVector({ x: 36, y: 7 }), end = { x: start.x + offset.x, y: start.y + offset.y }
  pointer(canvas(), 'pointerdown', start); pointer(window, 'pointermove', end, { shiftKey: true }); await frames(); pointer(window, 'pointerup', end, { shiftKey: true }); await frames()
  const shifted = matrix.applyToPoint(layer().spline!.points[point.id])
  const shiftCoordinates = frame.invert().applyToVector({ x: shifted.x - original.x, y: shifted.y - original.y })
  assert(Math.abs(shiftCoordinates.y) < 1e-6 && shiftCoordinates.x > 0, `${space} Shift did not constrain the free point drag`)
  await click('Undo'); equal(current().editor.getScene(), before, 'Shift move Undo failed')
  }
  await click('Spline object mode'); await click('Select spline object Donut B')
  assert(document.querySelector('[aria-label="Spline edit move axes"]'), 'Object sub-selection lost its geometry axes')
  await click('Done'); await click('Move tool'); await choose('Transform axes', 'local')
  const rootBefore = structuredClone(current().editor.getScene()), rootFrame = transformAxisFrame('local', matrix)
  const rootArrow = document.querySelector<HTMLElement>('[data-transform-axis="x"]')!
  const rootBox = rootArrow.getBoundingClientRect(), rootStart = { x: rootBox.left + rootBox.width / 2, y: rootBox.top + rootBox.height / 2 }
  const rootOffset = rootFrame.applyToVector({ x: 24, y: 8 }), rootEnd = { x: rootStart.x + rootOffset.x, y: rootStart.y + rootOffset.y }
  pointer(rootArrow, 'pointerdown', rootStart); pointer(window, 'pointermove', rootEnd); await frames(); pointer(window, 'pointerup', rootEnd); await frames()
  const movedWorld = resolveLayerWorldMatrix(layer(), current().editor.getScene(), 400).applyToPoint(point)
  const movedCoordinates = rootFrame.invert().applyToVector({ x: movedWorld.x - original.x, y: movedWorld.y - original.y })
  assert(Math.abs(movedCoordinates.y) < 1e-6 && movedCoordinates.x > 0, 'Layer move ignored Local axes')
  equal(current().editor.getScene().timelines, rootBefore.timelines, 'Layer axes changed animation keys')
  await click('Undo'); equal(current().editor.getScene(), rootBefore, 'Layer Local move was not one Undo')
  await click('Scale tool')
  const scaleArrow = document.querySelector<HTMLElement>('[data-transform-axis="x"]')!, scaleBox = scaleArrow.getBoundingClientRect()
  const scaleStart = { x: scaleBox.left + scaleBox.width / 2, y: scaleBox.top + scaleBox.height / 2 }, scaleOffset = rootFrame.applyToVector({ x: 20, y: 0 })
  const scaleEnd = { x: scaleStart.x + scaleOffset.x, y: scaleStart.y + scaleOffset.y }
  pointer(scaleArrow, 'pointerdown', scaleStart); pointer(window, 'pointermove', scaleEnd); await frames(); pointer(window, 'pointerup', scaleEnd); await frames()
  assert(layer().transform.scaleX > rootBefore.layers[1].transform.scaleX && layer().transform.scaleY === rootBefore.layers[1].transform.scaleY, 'Local scale X changed the wrong channel')
  await click('Undo'); equal(current().editor.getScene(), rootBefore, 'Local scale was not one Undo')
  await click('Move tool')
  const abortArrow = document.querySelector<HTMLElement>('[data-transform-axis="x"]')!
  pointer(abortArrow, 'pointerdown', rootStart); pointer(window, 'pointermove', rootEnd); await frames()
  await choose('Transform axes', 'scene'); pointer(window, 'pointerup', rootEnd); await frames()
  equal(current().editor.getScene(), rootBefore, 'Axis-space handover committed an in-flight preview')
  return 'Toolbox Scene/Local rotates both layer and Edit arrows; X/Y and Shift follow the displayed frame under animated/nonuniform parents. Local layer scale, one-gesture Undo, unchanged keys and axis-space handover cancellation pass. Spline Point/Object Edit shows X/Y arrows; native axis and Shift drags constrain composition axes under animated/nonuniform parents, preserve root transform/keys, and undo one gesture at a time.'
}
