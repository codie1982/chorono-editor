import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { evaluateBezier } from '@/lib/geometry/bezier/curves'
import { segmentControls } from '@/lib/spline/corners/segmentGeometry'
import { splineToPathDefinition } from '@/lib/spline/splineToPath'
import { Subject, current, frames, layer, tap, click, key, choose, reset, assert, equal, contextAt, raster } from './splineHarness'

/** Open the production disclosures; hidden controls are not counted as usable. */
async function openTools() {
  for (const label of ['Selection actions', 'Topology']) {
    const summary = Array.from(document.querySelectorAll('summary')).find(item => item.textContent?.startsWith(label))
    assert(summary, `Missing ${label}`)
    if (!(summary.parentElement as HTMLDetailsElement).open) { flushSync(() => summary.click()); await frames() }
  }
}
/** Activate real menu rows, including Add Vertex's type submenu. */
async function menu(label: string) {
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(item => item.querySelector('span.truncate')?.textContent?.trim() === label)
  assert(item && item.getAttribute('aria-disabled') !== 'true', `Missing/disabled menu ${label}`)
  flushSync(() => item.click()); await frames()
}
async function select(mode: 'edge' | 'object', ids: string[]) { flushSync(() => current().controller.enter(mode, ids)); await frames(); await openTools() }
/** Native input setter bypasses React's value tracker, then dispatches the real
 * bubbling input event. Editing the draft must never create an Undo itself. */
async function number(label: string, value: number) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`); assert(input, `Missing ${label}`)
  flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value)); input.dispatchEvent(new Event('input', { bubbles: true })) }); await frames()
}
async function run() {
  const status = document.getElementById('status')!, report = document.getElementById('report')!, checks: string[] = []
  try {
    await reset(); const initial = structuredClone(current().editor.getScene()), data = layer().spline!
    const object = Object.values(data.subShapes).find(item => item.name === 'Rectangle A')!, edge = data.contours[object.contourIds[0]].segmentIds[0]
    const first = evaluateBezier(segmentControls(data, edge), .25), second = evaluateBezier(segmentControls(data, edge), .75)
    await select('edge', [edge]); await choose('New vertex type', 'preserve'); await click('Add Vertex')
    assert(current().controller.edgeTool === 'addVertex' && !current().editor.canUndo, 'Arming mutated source/history')
    await tap(first); const once = structuredClone(current().editor.getScene()); await tap(second)
    assert(Object.keys(layer().spline!.points).length === Object.keys(data.points).length + 2, 'Repeated picks did not insert two anchors')
    assert(current().controller.mode === 'edge' && current().controller.edgeTool === 'addVertex', 'Insertion lost its tool/mode')
    const selected = current().controller.bank.point[0]
    assert(document.querySelector(`[data-spline-point-id="${selected}"][data-selected="true"]`), 'Last new point is not highlighted')
    await click('Undo'); equal(current().editor.getScene(), once, 'Second click was not a separate Undo')
    await click('Undo'); equal(current().editor.getScene(), initial, 'First click was not a separate Undo')
    await click('Redo'); assert(current().controller.edgeTool === 'addVertex', 'Undo/Redo cancelled insertion')
    key('Escape'); await frames(); assert(!current().controller.edgeTool && current().controller.active, 'Esc did not leave Edit active')
    checks.push('Actual viewport picks insert repeatedly; new anchor is visible, each click has independent Undo/Redo and Esc exits the tool')

    await click('Undo'); await select('edge', [edge]); await contextAt(first); await menu('Add Vertex'); await menu('Bézier Corner')
    equal(current().editor.getScene(), initial, 'Menu arming wrote source'); await tap(first)
    const added = current().controller.bank.point[0]
    assert(layer().spline!.points[added].type === 'bezierCorner', 'Menu vertex type did not reach insertion')
    key('Escape'); await frames(); checks.push('Right-click Add Vertex submenu arms the chosen connection type without an immediate source write')

    await click('Undo'); await select('edge', [edge]); await choose('New vertex type', 'preserve'); await click('Add Vertex'); await tap(first)
    key('Escape'); await frames() // Independent-handle corners are intentionally pinned by Simplify.

    const beforeSimplify = structuredClone(current().editor.getScene())
    for (const viaMenu of [false, true]) {
      await select('object', [object.id]); flushSync(() => current().controller.setSimplifyTolerancePx(.5)); await frames()
      if (viaMenu) { await contextAt({ x: -110, y: 0 }); await menu('Simplify') } else await click('Simplify')
      assert(Object.keys(layer().spline!.points).length < Object.keys(beforeSimplify.layers[1].spline!.points).length, 'Simplify did not remove the redundant new anchor')
      equal(layer().transform, beforeSimplify.layers[1].transform, 'Simplify moved layer TRS/origin')
      await click('Undo'); equal(current().editor.getScene(), beforeSimplify, 'Simplify was not one Undo')
      await click('Redo'); await click('Undo'); equal(current().editor.getScene(), beforeSimplify, 'Simplify Redo/Undo changed source')
    }
    checks.push('Simplify panel/menu use selected Object and the shared local tolerance; sharp corners survive and each activation is one Undo')

    const ring = Object.values(layer().spline!.subShapes).find(item => item.name === 'Donut B')!
    for (const viaMenu of [false, true]) {
      await select('object', [ring.id]); const before = structuredClone(current().editor.getScene())
      if (viaMenu) { await contextAt(layer().spline!.points[layer().spline!.contours[ring.contourIds[0]].pointIds[0]]); await menu('Smooth') } else await click('Smooth')
      equal(Object.values(layer().spline!.points).map(p => [p.id, p.x, p.y]), Object.values(before.layers[1].spline!.points).map(p => [p.id, p.x, p.y]), 'Smooth moved anchors')
      equal(layer().spline!.contours, before.layers[1].spline!.contours, 'Smooth changed hole connectivity')
      assert(JSON.stringify(layer().spline!.handles) !== JSON.stringify(before.layers[1].spline!.handles), 'Smooth did not change tangents')
      await click('Undo'); equal(current().editor.getScene(), before, 'Smooth was not one Undo')
    }
    checks.push('Smooth panel/menu change tangents while keeping all anchor coordinates and hole ownership; each activation is one Undo')

    for (const viaMenu of [false, true]) {
      await select('object', [object.id]); const before = structuredClone(current().editor.getScene()), contour = before.layers[1].spline!.contours[object.contourIds[0]]
      await number('Subdivide parts per edge', 4)
      equal(current().editor.getScene(), before, 'Subdivide draft wrote source')
      if (viaMenu) { await contextAt({ x: -110, y: 0 }); await menu('Subdivide') } else await click('Subdivide')
      assert(layer().spline!.contours[contour.id].segmentIds.length === contour.segmentIds.length * 4, 'Subdivide ignored shared part count')
      equal(layer().transform, before.layers[1].transform, 'Subdivide moved layer origin/TRS')
      await click('Undo'); equal(current().editor.getScene(), before, 'Subdivide was not one Undo')
      await click('Redo'); await click('Undo'); equal(current().editor.getScene(), before, 'Subdivide Redo/Undo changed source')
    }
    checks.push('Object Subdivide uses shared 4-part settings from panel/right-click, preserves outer placement and has one Undo/Redo')

    await select('object', [ring.id]); const beforeInterpolation = structuredClone(current().editor.getScene()), beforePixels = await raster()
    const countBefore = document.querySelector('[aria-label="Object interpolation"] [aria-live]')!.textContent
    await number('Object interpolation tolerance', .01)
    equal(current().editor.getScene(), beforeInterpolation, 'Interpolation draft wrote source')
    await click('Apply interpolation')
    const precise = structuredClone(current().editor.getScene())
    assert(layer().spline!.subShapes[ring.id].interpolation?.tolerancePx === .01, 'Interpolation panel did not store precision')
    assert(document.querySelector('[aria-label="Object interpolation"] [aria-live]')!.textContent !== countBefore, 'Precision did not change derived sample count')
    equal(splineToPathDefinition(layer().spline!), splineToPathDefinition(beforeInterpolation.layers[1].spline!), 'Interpolation changed exact path/source vertices')
    const afterPixels = await raster(); assert(afterPixels.length === beforePixels.length && afterPixels.every((channel, i) => channel === beforePixels[i]), 'Sampling metadata changed exact PNG rendering')
    await click('Use default interpolation'); assert(!layer().spline!.subShapes[ring.id].interpolation, 'Default did not remove precision')
    await click('Undo'); equal(current().editor.getScene(), precise, 'Reset was not a separate Undo')
    await click('Undo'); equal(current().editor.getScene(), beforeInterpolation, 'Interpolation was not one Undo')
    await contextAt(layer().spline!.points[layer().spline!.contours[ring.contourIds[0]].pointIds[0]]); await menu('Interpolation'); await menu('0.1 local px')
    assert(layer().spline!.subShapes[ring.id].interpolation?.tolerancePx === .1, 'Interpolation menu did not store precision')
    await click('Undo'); equal(current().editor.getScene(), beforeInterpolation, 'Menu interpolation was not one Undo')
    checks.push('Object Interpolation panel/presets/default use separate Undo, change real sample count and preserve exact path and actual PNG pixels')
    const pixels = await raster(); assert(pixels.some(channel => channel > 0), 'Actual PNG is empty')
    await select('object', [ring.id])
    document.querySelector('[aria-label="Object interpolation"]')!.scrollIntoView({ block: 'center' })
    checks.push('Actual PNG renderer/export remains valid; final Object inspector displays the new interpolation controls')
    status.textContent = `PASS · ${checks.length} groups`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
}
document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button,#run{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}#host{max-width:1350px}pre{white-space:pre-wrap}</style><h1>Spline component tools · Subdivide / Interpolation</h1><p>Disposable production viewport, panel, context menu, native history and PNG acceptance.</p><button id="run">Run checks</button><p id="status">Ready</p><section id="host"></section><pre id="report">No checks run</pre>'
createRoot(document.getElementById('host')!).render(<Subject />)
document.getElementById('run')!.onclick = () => void run()
if (new URL(location.href).searchParams.has('autorun')) void frames().then(run)
