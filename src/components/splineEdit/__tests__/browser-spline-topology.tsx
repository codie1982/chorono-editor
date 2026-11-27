import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createPolylineSpline, mergeSplineData } from '@/lib/spline'
import { assertSplineTopology, extractSplineObjects } from '@/lib/spline/topology'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { newSplineLayerFromData } from '@/lib/defaults'
import type { ChronoScene } from '@/lib/types'
import { Subject, fixture, current, frames, layer, tap, click, key, reset, raster, assert, equal } from './splineHarness'

/** Open production Properties' collapsed advanced section, not a hidden action. */
async function openTopology() {
  const details = document.querySelector<HTMLDetailsElement>('[aria-label="Spline edit properties"] details')!
  if (!details.open) { flushSync(() => details.querySelector('summary')!.click()); await frames() }
}
/** Numeric input follows the browser's native controlled-input event path. */
async function number(label: string, value: number) {
  const input = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!; assert(input, `Missing ${label}`)
  flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value)); input.dispatchEvent(new Event('input', { bubbles: true })) }); await frames()
}
/** Replace only this QA origin's disposable source and selection. */
async function load(scene: ChronoScene) { flushSync(() => { current().editor.resetScene(scene); current().select('spline'); current().setTime(0); current().setTool('select') }); await frames() }
/** Multi-object list toggle exercises the actual modifier event. */
async function toggleObject(name: string) {
  const button = document.querySelector<HTMLButtonElement>(`[aria-label="Select spline object ${name}"]`)!
  flushSync(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))); await frames()
}
/** Local open contours under the same animated transformed parent as regression. */
function endpoints() {
  const scene = fixture(), first = createPolylineSpline([{ x: -130, y: -20 }, { x: -50, y: -20 }], false)
  const second = createPolylineSpline([{ x: -48, y: -20 }, { x: 40, y: 30 }], false)
  scene.layers[1].spline = mergeSplineData(first, second)
  return scene
}
async function run() {
  const status = document.getElementById('status')!, report = document.getElementById('report')!, run = document.getElementById('run') as HTMLButtonElement, checks: string[] = []
  run.disabled = true; status.textContent = 'Running'
  try {
    await reset(); await click('Spline edge mode'); await tap({ x: -110, y: -40 }); await openTopology()
    const beforeDivide = structuredClone(current().editor.getScene()), beforePixels = await raster(), contour = Object.values(layer().spline!.contours)[0]
    await number('Divide parts', 3); await click('Divide edges')
    assert(layer().spline!.contours[contour.id].pointIds.length === 6, 'Divide Properties did not add two anchors')
    assert(current().controller.ids.length === 3, 'Divided edges were not focused after source commit')
    assertSplineTopology(layer().spline!); equal(current().editor.getScene().timelines, beforeDivide.timelines, 'Divide rewrote human keys')
    const dividedPixels = await raster(), changedPixels = new Set<number>()
    let max = 0, sum = 0
    dividedPixels.forEach((value, index) => { const difference = Math.abs(value - beforePixels[index]); if (difference) changedPixels.add(Math.floor(index / 4)); max = Math.max(max, difference); sum += difference })
    // Native Canvas may rasterize redundant collinear joints differently. Bound
    // that difference to a few edge pixels, and independently require every
    // inserted anchor to lie on the exact original local line.
    const inserted = Object.values(layer().spline!.points).filter(point => !beforeDivide.layers[1].spline!.points[point.id])
    assert(inserted.every(point => Math.abs(point.y + 40) < 1e-10), 'Divide changed the original line geometry')
    const matrix = resolveLayerWorldMatrix(beforeDivide.layers[1], beforeDivide, 0), edge = beforeDivide.layers[1].spline!.segments[contour.segmentIds[0]]
    const from = matrix.applyToPoint(beforeDivide.layers[1].spline!.points[edge.fromPointId]), to = matrix.applyToPoint(beforeDivide.layers[1].spline!.points[edge.toPointId])
    const dx = to.x - from.x, dy = to.y - from.y, width = beforeDivide.composition.width
    for (const pixel of Array.from(changedPixels)) {
      const x = pixel % width + .5, y = Math.floor(pixel / width) + .5, t = Math.max(0, Math.min(1, ((x-from.x)*dx+(y-from.y)*dy)/(dx*dx+dy*dy)))
      assert(Math.hypot(x-from.x-t*dx, y-from.y-t*dy) < 3, 'Raster difference is outside the divided edge')
    }
    assert(changedPixels.size <= 8 && max <= 128 && sum / dividedPixels.length < .002, `Divide raster change exceeds edge-AA tolerance: pixels=${changedPixels.size}, max=${max}`)
    checks.push(`Divide raster equivalence: ${changedPixels.size} edge-AA pixels, max channel delta ${max}; exact line geometry preserved`)

    await click('Undo'); equal(current().editor.getScene(), beforeDivide, 'Divide was not one Undo'); await click('Redo'); assert(layer().spline!.contours[contour.id].pointIds.length === 6, 'Divide Redo failed'); await click('Undo')
    checks.push('Edge Divide uses Properties, focuses new IDs, preserves raster equivalence and human keys, and is one Undo/Redo')

    await tap({ x: -110, y: -40 }); key('Delete'); await frames()
    assert(!layer().spline!.contours[contour.id].closed && current().editor.getScene().layers.length === 2, 'Edge Delete removed the root or failed to cut the loop')
    assertSplineTopology(layer().spline!); await click('Undo'); equal(current().editor.getScene(), beforeDivide, 'Edge Delete Undo lost source')
    await tap({ x: -110, y: -40 }); await click('Refine edges'); assert(layer().spline!.contours[contour.id].pointIds.length === 5, 'Refine Properties failed')
    await click('Undo'); equal(current().editor.getScene(), beforeDivide, 'Refine was not one Undo')
    checks.push('Delete cuts an edge into an open contour without deleting its layer; Refine reuses curve splitting and native history')

    await click('Spline object mode'); await click('Select spline object Donut B'); const beforeCopy = structuredClone(current().editor.getScene())
    key('d', { ctrlKey: true }); await frames()
    assert(Object.keys(layer().spline!.subShapes).length === 3 && current().controller.ids.length === 1, 'Object Ctrl+D did not copy/focus only the selected Object')
    const copyId = current().controller.ids[0]; assert(!beforeCopy.layers[1].spline!.subShapes[copyId], 'Copy reused Object ID')
    assert(layer().spline!.subShapes[copyId].contourIds.length === 2, 'Copy lost donut hole')
    assertSplineTopology(layer().spline!); equal(current().editor.getScene().timelines, beforeCopy.timelines, 'Object copy rewrote root animation')
    await click('Undo'); equal(current().editor.getScene(), beforeCopy, 'Copy was not one Undo')
    checks.push('Object Ctrl+D creates fresh Object/geometry IDs with both donut contours, retaining outer animation and one Undo')

    const detachScene = fixture(); detachScene.timelines[0].tracks.push({ target: 'layers.spline.transform.rotationDeg', keyframes: [{ id: 'manual-rotation', timeMs: 0, value: 10, easing: { type: 'linear' } }] })
    await load(detachScene); await click('Spline object mode'); await click('Select spline object Donut B'); await openTopology()
    const beforeDetach = structuredClone(current().editor.getScene()); await click('Detach to new layer')
    const detachedId = current().selected!, detached = current().editor.getScene().layers.find(item => item.id === detachedId)!
    assert(detachedId !== 'spline' && current().editor.getScene().layers.length === 3, 'Detach did not select a new sibling layer')
    assert(current().controller.active && current().controller.mode === 'object' && current().controller.ids.length === 1, 'Detach did not focus moved Object')
    assert(detached.parentId === 'parent' && Object.keys(detached.spline!.contours).length === 2, 'Detach lost parent/hole')
    assert(current().editor.getScene().timelines[0].tracks.some(track => track.target === `layers.${detachedId}.transform.rotationDeg`), 'Detach lost outer animation')
    await click('Undo'); equal(current().editor.getScene(), beforeDetach, 'Detach one Undo did not restore both layer and tracks')
    checks.push('Detach selects an independent sibling, retains hole/parent and outer animation, and restores source+tracks with one Undo')

    const attachScene = fixture(); attachScene.timelines = attachScene.timelines.map(timeline => ({ ...timeline, tracks: [] }))
    const original = attachScene.layers[1]
    const source = newSplineLayerFromData(extractSplineObjects(original.spline!, Object.keys(original.spline!.subShapes).slice(0, 1)), { name: 'Attach source', x: 180, y: -45 })
    source.id = 'attach-source'; source.parentId = 'parent'; source.style = original.style; source.transform.rotationDeg = -10
    attachScene.layers.push(source); await load(attachScene); await click('Spline object mode'); await click('Select spline object Rectangle A'); await openTopology()
    const beforeAttach = structuredClone(current().editor.getScene())
    const select = document.querySelector<HTMLSelectElement>('[aria-label="Attach spline source"]')!
    flushSync(() => { select.value = source.id; select.dispatchEvent(new Event('change', { bubbles: true })) }); await frames(); await click('Attach layer')
    assert(current().editor.getScene().layers.length === 2 && Object.keys(layer().spline!.subShapes).length === 3, 'Attach did not consume only its source layer')
    assert(current().controller.ids.length === 1 && !beforeAttach.layers[1].spline!.subShapes[current().controller.ids[0]], 'Attach did not remap/focus imported ID collisions')
    assertSplineTopology(layer().spline!); equal(layer().style, original.style, 'Attach replaced target paint')
    equal(parseSceneJson(JSON.stringify(current().editor.getScene()), true), current().editor.getScene(), 'Attached source failed portable round-trip')
    await click('Undo'); equal(current().editor.getScene(), beforeAttach, 'Attach was not one Undo'); await click('Redo'); assert(current().editor.getScene().layers.length === 2, 'Attach Redo failed'); await click('Undo')
    checks.push('Attach consumes one static layer, remaps imported collisions, preserves target paint and portable source, and supports one Undo/Redo')

    await load(endpoints()); await click('Spline point mode'); await tap({ x: -50, y: -20 }); await tap({ x: -48, y: -20 }, { shiftKey: true }); await openTopology()
    const beforeConnect = structuredClone(current().editor.getScene()), first = current().controller.ids[0]
    await click('Join / Connect endpoints')
    assert(Object.keys(layer().spline!.subShapes).length === 1 && Object.keys(layer().spline!.segments).length === 3, 'Connect did not bridge selected endpoints')
    assertSplineTopology(layer().spline!); equal(current().editor.getScene().timelines, beforeConnect.timelines, 'Connect changed animation')
    await click('Undo'); equal(current().editor.getScene(), beforeConnect, 'Connect Undo lost source')
    await tap({ x: -50, y: -20 }); await tap({ x: -48, y: -20 }, { shiftKey: true }); await number('Weld tolerance (composition px)', 1); await click('Weld endpoints')
    equal(current().editor.getScene(), beforeConnect, 'Rejected Weld changed source'); assert(document.querySelector('[role="alert"]')?.textContent?.includes('tolerance'), 'Weld rejection had no explanation')
    await number('Weld tolerance (composition px)', 5); await click('Weld endpoints')
    assert(Object.keys(layer().spline!.points).length === 3 && layer().spline!.points[first].x === -50, 'Weld did not preserve first endpoint ID/position')
    assertSplineTopology(layer().spline!); await click('Undo'); equal(current().editor.getScene(), beforeConnect, 'Weld Undo lost geometry')
    checks.push('Connect adds a bridge; Weld rejects beyond composition-pixel tolerance, then merges while keeping the first point and exact Undo')

    await reset(); await click('Spline object mode'); await click('Select spline object Rectangle A'); await toggleObject('Donut B'); key('Delete'); await frames()
    assert(current().editor.getScene().layers.length === 2 && Object.keys(layer().spline!.subShapes).length === 0, 'Object Delete removed the root instead of all selected objects')
    assertSplineTopology(layer().spline!); assert(current().controller.ids.length === 0, 'Deleted Object IDs remained selected')
    await click('Undo'); assert(Object.keys(layer().spline!.subShapes).length === 2, 'Deleting all Objects did not undo')
    checks.push('Batch Object Delete clears every selected Object/contour/handle, retains the empty layer and prunes transient selections')

    await reset(true); await click('Spline edge mode'); await tap({ x: -110, y: -40 }); await openTopology(); const guarded = structuredClone(current().editor.getScene())
    await click('Divide edges'); equal(current().editor.getScene(), guarded, 'Driven topology was overwritten'); assert(document.querySelector('[role="alert"]'), 'Driven topology had no diagnostic')
    checks.push('Coordinate-driven geometry remains selectable and refuses topology changes with a visible explanation')
    await reset(); await click('Spline object mode'); await click('Select spline object Donut B'); await openTopology()
    status.textContent = `PASS · ${checks.length} groups`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
  finally { run.disabled = false }
}
document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button,#run{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}#host{max-width:1280px}pre{white-space:pre-wrap}</style><h1>S2D-2 spline topology acceptance</h1><p>Actual viewport, Properties, native commands, history and raster outputs on disposable source.</p><button id="run">Run topology checks</button><p id="status">Ready</p><section id="host"></section><pre id="report">No checks run</pre>'
createRoot(document.getElementById('host')!).render(<Subject />)
document.getElementById('run')!.onclick = () => void run()
