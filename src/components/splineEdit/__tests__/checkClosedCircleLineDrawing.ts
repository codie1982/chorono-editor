import { flushSync } from 'react-dom'
import { createCircleSpline } from '@/lib/spline'
import { newSplineLayerFromData } from '@/lib/defaults'
import { assertSplineTopology } from '@/lib/spline/topology'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { fixture, current, frames, layer, tap, click, key, assert, equal, contextAt, setSplineVertexSnapping, raster } from './splineHarness'

/** Actual context-menu Line drawing on a closed Bézier circle under the
 * fixture's animated/nonuniform parent. Checks persistent topology and raster,
 * not just disappearance of the preview; no connected source is accessed. */
export async function checkClosedCircleLineDrawing(): Promise<string> {
  const scene = fixture(), circle = createCircleSpline({ radius: 65 })
  scene.composition.backgroundColor = '#FFFFFF'
  scene.layers[1] = { ...scene.layers[1], spline: circle, style: newSplineLayerFromData(circle).style }
  flushSync(() => { current().editor.resetScene(scene); current().select('spline'); current().setTime(400); current().setTool('select') })
  await frames(); await click('Spline object mode'); await setSplineVertexSnapping(true)
  const initial = structuredClone(current().editor.getScene()), original = initial.layers[1]
  const assertOriginal = () => {
    const data = layer().spline!
    for (const family of ['points', 'handles', 'segments', 'contours', 'subShapes'] as const) for (const [id, value] of Object.entries(original.spline![family])) equal(data[family][id], value, `Drawing changed the circle's ${family}`)
    equal(layer().transform, original.transform, 'Line changed the circle transform')
    equal(layer().style, original.style, 'Line changed source paint')
    equal(current().editor.getScene().timelines, initial.timelines, 'Line changed parent animation')
    assertSplineTopology(data)
  }
  const arm = async (autoClose = true) => {
    await contextAt({ x: 65, y: 0 })
    const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(item => item.textContent?.trim() === 'Add line object to spline')
    assert(item, 'Context menu is missing Add line object to spline')
    flushSync(() => item.click()); await frames()
    const checkbox = document.querySelector<HTMLInputElement>('[aria-label="Line drawing options"] [aria-label="Spline Auto Close"]')
    assert(checkbox, 'Line options are not mounted')
    if (checkbox.checked !== autoClose) { flushSync(() => checkbox.click()); await frames() }
  }
  const selectedContour = () => {
    const sub = layer().spline!.subShapes[current().controller.ids[0]]
    assert(sub, 'Finished Line did not become a selected persistent Object')
    return layer().spline!.contours[sub.contourIds[0]]
  }
  await arm(true); await tap({ x: 67, y: 2 }); await tap({ x: 110, y: -70 }); await tap({ x: 0, y: -120 }); await tap({ x: 67, y: 2 })
  const loop = selectedContour()
  assert(loop.closed && loop.pointIds.length === 3 && loop.segmentIds.length === 3, 'Start-point return did not close with Auto Close enabled')
  assertOriginal(); const closed = structuredClone(current().editor.getScene())
  await arm(true); await tap({ x: -67, y: 2 }); await tap({ x: -110, y: 40 }); await tap({ x: 2, y: 67 })
  const bridge = selectedContour()
  assert(!bridge.closed && bridge.pointIds.length === 3, 'Reaching a different circle vertex did not finish a separate Line Object')
  const last = layer().spline!.points[bridge.pointIds.at(-1)!]
  assert(Math.abs(last.x) < 1e-6 && Math.abs(last.y - 65) < 1e-6, 'The finish point was not the exact snapped circle anchor')
  assertOriginal(); const joined = structuredClone(current().editor.getScene())
  await click('Undo'); equal(current().editor.getScene(), closed, 'Second line was not one Undo')
  await click('Redo'); equal(current().editor.getScene(), joined, 'Second line Redo failed')
  await arm(false); await tap({ x: 100, y: 90 }); await tap({ x: 140, y: 100 }); await tap({ x: 140, y: 150 }); key('Escape'); await frames()
  assert(!selectedContour().closed && selectedContour().pointIds.length === 3, 'Escape erased placed segments')
  assertOriginal(); const escaped = structuredClone(current().editor.getScene())
  await arm(false); await tap({ x: -140, y: -60 }); await tap({ x: -150, y: 0 }); await tap({ x: -140, y: 60 }); await contextAt({ x: 200, y: 150 })
  assert(!selectedContour().closed && selectedContour().pointIds.length === 3, 'Right-click lost anchors or added the unplaced cursor')
  assertOriginal(); const right = structuredClone(current().editor.getScene())
  await click('Undo'); equal(current().editor.getScene(), escaped, 'Right-click finish changed earlier lines')
  await click('Undo'); equal(current().editor.getScene(), joined, 'Escape finish changed earlier lines')
  await click('Redo'); await click('Redo'); equal(current().editor.getScene(), right, 'Exit finish Redo failed')
  await arm(true); await tap({ x: 150, y: -140 }); await tap({ x: 200, y: -140 }); await tap({ x: 200, y: -90 })
  const viewport = document.querySelector('[data-testid="canvas-viewport"]')!
  flushSync(() => viewport.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))); await frames()
  assert(selectedContour().closed && selectedContour().pointIds.length === 3, 'Pasteboard right-click did not save/close placed anchors')
  assertOriginal(); let finished = structuredClone(current().editor.getScene())
  await arm(false); await tap({ x: 20, y: 100 }); await tap({ x: 60, y: 130 }); await tap({ x: 20, y: 100 }); await tap({ x: 0, y: 65 })
  equal(current().editor.getScene(), finished, 'Auto Close off finished a closed-looking path or circle snap')
  const control = document.querySelector<HTMLInputElement>('[aria-label="Line drawing options"] [aria-label="Spline Auto Close"]')!
  flushSync(() => { control.focus(); control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) }); await frames()
  assert(!selectedContour().closed && selectedContour().pointIds.length === 4, 'Escape from Auto Close control did not save the continuing path')
  assertOriginal(); finished = structuredClone(current().editor.getScene())
  await arm(false); await tap({ x: -200, y: 100 }); key('Escape'); await frames()
  equal(current().editor.getScene(), finished, 'A single anchor changed previously completed lines')
  equal(parseSceneJson(JSON.stringify(finished), true), finished, 'Completed line objects failed portable round-trip')
  const pixels = await raster(); assert(pixels.length === 640 * 420 * 4, 'Saved lines did not export to raster')
  await arm(false)
  return 'Context-menu Line on a closed circle: Auto Close on finishes loops/circle anchors; off continues through both; another snapped circle anchor finishes an independent Line; Esc and canvas/pasteboard right-click keep placed segments; circle Béziers/paint/parent keys and previous lines survive; each finish is one Undo/Redo and portable raster source.'
}
