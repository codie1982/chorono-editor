import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createCircleSpline, mergeSplineData } from '@/lib/spline'
import { assertSplineTopology, deleteSplineEdges } from '@/lib/spline/topology'
import { Subject, fixture, current, frames, layer, canvas, client, world, pointer, tap, click, key, choose, assert, equal, raster } from './splineHarness'

/** Private fixture only: two circular arcs with an animated affine parent.
 * No page route, production-session storage or real user document is accessed. */
async function loadArcs() {
  const scene = fixture(), arc = (radius: number) => { const data = createCircleSpline({ radius }); return deleteSplineEdges(data, [Object.keys(data.segments)[0]]) }
  scene.layers[1].spline = mergeSplineData(arc(100), arc(70))
  flushSync(() => { current().editor.resetScene(scene); current().select('spline'); current().setTime(400); current().setTool('select') })
  await frames(); await click('Spline point mode'); return structuredClone(current().editor.getScene())
}
/** Toggle the actual controlled Snap-menu checkbox; never set private state. */
async function vertexSnapping(checked: boolean) {
  const trigger = document.querySelector<HTMLButtonElement>('button[title="Snap settings"]')!
  flushSync(() => trigger.click()); await frames()
  const box = document.querySelector<HTMLInputElement>('[aria-label="Snap to Spline Vertices"]')!
  assert(box, 'Vertex snap control is missing')
  if (box.checked !== checked) { flushSync(() => box.click()); await frames() }
  await click('Close Snap settings')
}
/** Three production paint frames for hover/render adoption, not a clock delay. */
async function hover(point: { x: number; y: number }) { pointer(canvas(), 'pointermove', client(world(point))); await frames() }

async function run() {
  const status = document.getElementById('status')!, report = document.getElementById('report')!, checks: string[] = []
  const button = document.getElementById('run') as HTMLButtonElement; button.disabled = true; status.textContent = 'Running'
  try {
    const before = await loadArcs(); await vertexSnapping(true)
    const original = layer().spline!, contours = Object.values(original.contours), start = original.points[contours[0].pointIds.at(-1)!], end = original.points[contours[1].pointIds[0]]
    await choose('Add spline object', 'line'); await hover({ x: start.x + 3, y: start.y + 2 })
    const marker = document.querySelector<HTMLElement>('[data-testid="geometry-snap-point"]')!, expected = world(start)
    assert(marker && Math.abs(Number(marker.dataset.x) - expected.x) < 1e-6 && Math.abs(Number(marker.dataset.y) - expected.y) < 1e-6, 'Hover feedback did not acquire the exact transformed vertex')
    await tap({ x: start.x + 3, y: start.y + 2 }); equal(current().editor.getScene(), before, 'First endpoint committed source early')
    await tap({ x: end.x + 2, y: end.y + 3 })
    const joined = structuredClone(current().editor.getScene()), data = layer().spline!
    assertSplineTopology(data)
    assert(Object.keys(data.subShapes).length === 1 && Object.values(data.contours).length === 1, 'First bridge did not merge both arcs')
    equal(Object.keys(data.points), Object.keys(original.points), 'Endpoint acquisition duplicated source anchors')
    equal(joined.timelines, before.timelines, 'Join rewrote manual animation')
    assert(current().controller.mode === 'point' && current().controller.ids.includes(end.id), 'Join did not focus the reached endpoint')
    await click('Undo'); equal(current().editor.getScene(), before, 'Drawn join was not one Undo'); assert(!current().editor.canUndo, 'One join created multiple history steps')
    await click('Redo'); equal(current().editor.getScene(), joined, 'Join Redo changed geometry')
    checks.push('Actual Add Line snaps from nearby pointer positions, joins two open arcs, preserves source IDs/manual animation and performs one Undo/Redo')

    const remaining = Object.values(layer().spline!.contours)[0], a = layer().spline!.points[remaining.pointIds.at(-1)!], b = layer().spline!.points[remaining.pointIds[0]]
    await choose('Add spline object', 'line'); await tap({ x: a.x + 2, y: a.y + 2 }); await tap({ x: b.x + 2, y: b.y + 2 })
    const closed = structuredClone(current().editor.getScene()); assertSplineTopology(layer().spline!)
    assert(Object.values(layer().spline!.contours)[0].closed, 'Second bridge did not close the band')
    equal(Object.keys(layer().spline!.points), Object.keys(original.points), 'Closure duplicated points')
    equal(closed.timelines, before.timelines, 'Second bridge changed animation')
    const pixels = await raster(); assert(pixels.length === 640 * 420 * 4, 'Closed source did not export a real raster')
    await click('Undo'); equal(current().editor.getScene(), joined, 'Closing bridge Undo changed the first bridge')
    await click('Redo'); equal(current().editor.getScene(), closed, 'Closing bridge Redo failed')
    checks.push('A second drawn bridge closes one filled contour with no extra endpoint, exports pixels and retains independent history steps')

    const reset = await loadArcs(); await vertexSnapping(false)
    const contour = Object.values(layer().spline!.contours)[0], p = layer().spline!.points[contour.pointIds[0]], q = layer().spline!.points[contour.pointIds.at(-1)!]
    await choose('Add spline object', 'line'); await tap(p); await tap(q); key('Enter'); await frames()
    assert(Object.keys(layer().spline!.subShapes).length === 3, 'Disabled vertex snap still auto-joined topology')
    await click('Undo'); equal(current().editor.getScene(), reset, 'Independent line Undo changed source')
    await vertexSnapping(true); await choose('Add spline object', 'line'); await tap(p); await hover({ x: 40, y: -120 }); key('Escape'); await frames()
    equal(current().editor.getScene(), reset, 'Cancelled endpoint drawing mutated source')
    checks.push('Vertex checkbox off preserves independent Add Line; Escape cancels a snapped endpoint draft without a source/history edit')

    await choose('Add spline object', 'line'); await tap(p)
    flushSync(() => current().setTime(500)); await frames(); await tap(q)
    equal(current().editor.getScene(), reset, 'Changed time committed a stale connection')
    assert(Array.from(document.querySelectorAll('[role="status"]')).some(item => item.textContent?.includes('changed')), 'Stale connection did not explain its rejection')
    checks.push('A time change rejects the captured gesture and leaves all existing source and keys intact')
    await loadArcs(); await vertexSnapping(true)
    status.textContent = `PASS · ${checks.length} groups`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
  finally { button.disabled = false }
}

document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button,#run{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}#host{max-width:1280px}pre{white-space:pre-wrap}</style><h1>Spline vertex and drawn connection acceptance</h1><button id="run">Run vertex and connection checks</button><p id="status">Ready</p><section id="host"></section><pre id="report">No checks run</pre>'
createRoot(document.getElementById('host')!).render(<Subject />)
document.getElementById('run')!.onclick = () => void run()
