import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useSplineDrawingPreferences } from '../useSplineDrawingPreferences'
import type { SplinePrimitiveKind } from '@/lib/types/spline'
import type { SplineDrawResult } from '../drawing/drawingCommand'
import SceneCanvas from '@/components/SceneCanvas'
import { SplineEditInspector } from '../SplineEditInspector'
import { useSplineEditSelection, type SplineEditController } from '../useSplineEditSelection'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useKeyboard } from '@/app/hooks/useKeyboard'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '@/lib/defaults'
import { createRectangleSpline, createDonutSpline, mergeSplineData, translateSplineData } from '@/lib/spline'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { makeUpdateLayerCmd, makeDeleteLayerCmd } from '@/lib/editor/commands-layer'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { acquireRasterImage } from '@/lib/export/raster/RasterExportEngine'
import type { ChronoScene } from '@/lib/types'

import { Subject, current, frames, layer, canvas, world, client, pointer, tap, drag, click, key, choose, reset, raster, assert, equal, contextAt } from './splineHarness'
async function run() {
  const status = document.getElementById('status')!, report = document.getElementById('report')!, checks: string[] = []
  status.textContent = 'Running'; const runButton = document.getElementById('run') as HTMLButtonElement; runButton.disabled = true
  try {
    await frames(); await reset(); const initial = structuredClone(current().editor.getScene()), pixels = await raster()
    await click('Spline point mode'); assert(current().controller.active, 'Point mode did not activate')
    const points = Object.values(layer().spline!.points), p = points[0], q = points[1]
    await tap(p); equal(current().controller.ids, [p.id], 'First point click did not select')
    assert(document.querySelector('[data-panel="spline-point"]'), 'Point Properties missing')
    await tap(q, { shiftKey: true }); assert(current().controller.ids.length === 2, 'Shift multi-point selection failed')
    await tap(q, { ctrlKey: true }); equal(current().controller.ids, [p.id], 'Ctrl did not toggle')
    await contextAt(p); assert(document.querySelector('[role="menu"]')?.textContent?.includes('Bezier Corner'), 'Point context menu missing point actions'); key('Escape'); await frames(); assert(current().controller.active, 'Menu Escape closed edit context')
    equal(current().editor.getScene(), initial, 'Point picking modified source'); assert(!current().editor.canUndo, 'Selection wrote history')
    checks.push('Point picks and Shift/Ctrl toggles preserve exact source and create no history')
    await click('Spline edge mode'); await tap({ x: -110, y: -40 })
    assert(current().controller.ids.length === 1 && layer().spline!.segments[current().controller.ids[0]], 'Edge mode did not pick a segment')
    assert(document.querySelector('[aria-label="Spline segment type"]') && !document.querySelector('[data-panel="spline-point"]'), 'Edge Properties reused point controls')
    assert(!document.querySelector('[data-spline-point-id]'), 'Inactive point handles remained visible')
    await contextAt({ x: -110, y: -40 }); assert(document.querySelector('[role="menu"]')?.textContent?.includes('Convert to Line'), 'Edge context menu missing segment actions'); key('Escape'); await frames()
    await click('Spline object mode'); await tap({ x: 145, y: 0 })
    const donut = Object.values(layer().spline!.subShapes).find(item => item.name === 'Donut B')!
    equal(current().controller.ids, [donut.id], 'Object did not select the whole donut')
    const outline = document.querySelector<SVGPathElement>(`[data-spline-object-id="${donut.id}"]`)!
    assert((outline.getAttribute('d')?.match(/M/g) ?? []).length === 2, 'Object outline lost its hole contour')
    assert(document.querySelector('[aria-label="Spline object name"]'), 'Object Properties missing')
    await contextAt({ x: 145, y: 0 }); assert(document.querySelector('[role="menu"]')?.textContent?.includes('Reverse direction'), 'Object context menu missing contour actions'); key('Escape'); await frames()
    await tap({ x: 95, y: 0 }); equal(current().controller.ids, [], 'Donut hole selected its object')
    equal(current().selected, 'spline', 'Blank object click dropped the root layer')
    checks.push('Edge/Object picking and Properties are distinct; one donut object includes both contours and preserves its hole')
    await click('Spline point mode'); equal(current().controller.ids, [p.id], 'Mode bank was discarded')
    await drag({ x: -210, y: -75 }, { x: 10, y: 100 }); assert(current().controller.ids.length === 4, 'Region did not select the four rectangle points')
    await click('Spline edge mode'); await drag({ x: -210, y: -75 }, { x: 10, y: 100 }); assert(current().controller.ids.length === 4, 'Region did not select four rectangle edges')
    await click('Spline object mode'); await drag({ x: -215, y: -80 }, { x: 15, y: 110 }); assert(current().controller.ids.length === 1, 'Region selected other sub-objects')
    equal(current().editor.getScene(), initial, 'Region/mode selection mutated source')
    checks.push('One native region gesture selects only the active level and retains independent mode banks')
    key('Delete'); await frames(); assert(current().editor.getScene().layers.length === initial.layers.length && Object.keys(layer().spline!.subShapes).length === 1, 'Object Delete did not remove only its SubShape'); await click('Undo'); equal(current().editor.getScene(), initial, 'Object Delete Undo changed source'); await click('Select spline object Rectangle A')
    key('Escape'); await frames(); equal(current().controller.ids, [], 'Escape did not clear sub-selection first')
    key('Escape'); await frames(); assert(!current().controller.active && current().selected === 'spline', 'Escape did not exit edit before root clearing')
    key('Escape'); await frames(); assert(current().selected === null, 'Layer Escape no longer works after Done')
    checks.push('Delete is mode-owned; Escape clears sub-selection, exits edit, then clears layer selection')
    await reset(); await click('Spline point mode'); const a = Object.values(layer().spline!.points)[0], base = structuredClone(current().editor.getScene()), keys = JSON.stringify(base.timelines)
    pointer(canvas(), 'pointerdown', client(world(a))); await frames(); assert(current().editor.isTransactionActive(), 'First point down did not capture')
    pointer(window, 'pointermove', client(world({ x: a.x + 10, y: a.y + 4 }))); await frames()
    pointer(window, 'pointerup', client(world({ x: a.x + 20, y: a.y + 12 }))); await frames()
    assert(!current().editor.isTransactionActive(), 'Point release left a transaction')
    const moved = structuredClone(current().editor.getScene()), next = layer().spline!.points[a.id]
    assert(Math.abs(next.x - a.x - 20) < 1e-6 && Math.abs(next.y - a.y - 12) < 1e-6, 'Final release/parent inverse lost local coordinates')
    equal(layer().transform, base.layers[1].transform, 'Point drag changed layer transform'); equal(JSON.stringify(moved.timelines), keys, 'Drag changed human keys')
    await click('Undo'); equal(current().editor.getScene(), base, 'One Undo did not restore point source'); assert(!current().editor.canUndo, 'Point drag created multiple undos')
    await click('Redo'); equal(current().editor.getScene(), moved, 'Redo changed spline source')
    checks.push('First drag samples final pointer-up through transformed animated parent; one Undo/Redo and human keys are preserved')
    await reset(); await click('Spline point mode'); const pair = Object.values(layer().spline!.points).slice(0, 2), beforeMulti = structuredClone(current().editor.getScene())
    await tap(pair[0]); await tap(pair[1], { shiftKey: true }); await drag(pair[0], { x: pair[0].x + 9, y: pair[0].y + 6 })
    for (const point of pair) assert(Math.abs(layer().spline!.points[point.id].x - point.x - 9) < 1e-6, 'Multi-point moved only one point')
    equal(current().editor.getScene().timelines, beforeMulti.timelines, 'Multi-point drag rewrote animation')
    await click('Undo'); equal(current().editor.getScene(), beforeMulti, 'Multi-point Undo lost source')
    checks.push('Selected points move together once, without moving the root or unrelated animation')
    flushSync(() => current().setTool('pan')); await frames(); const beforePan = structuredClone(current().editor.getScene()); await drag(pair[0], { x: pair[0].x + 30, y: pair[0].y + 15 }); key('Delete'); await frames()
    equal(current().editor.getScene(), beforePan, 'Pan edited sub-objects or deleted the layer')
    flushSync(() => current().setTool('select')); await frames(); await tap(pair[0]); const beforeCancel = structuredClone(current().editor.getScene())
    pointer(canvas(), 'pointerdown', client(world(pair[0]))); await frames(); pointer(window, 'pointermove', client(world({ x: pair[0].x + 25, y: pair[0].y }))); await frames(); key('Escape'); await frames()
    equal(current().editor.getScene(), beforeCancel, 'Escape did not restore pointer preview'); assert(!current().editor.isTransactionActive(), 'Escape retained a drag transaction')
    checks.push('Pan is read-only; Escape cancels a live geometry gesture without clearing unrelated edits')
    const selectedBeforeRegion = current().controller.ids.slice()
    pointer(canvas(), 'pointerdown', client(world({ x: -210, y: -75 }))); await frames(); pointer(window, 'pointermove', client(world({ x: 10, y: 100 }))); await frames(); key('Escape'); await frames(); pointer(window, 'pointerup', client(world({ x: 10, y: 100 }))); await frames()
    equal(current().controller.ids, selectedBeforeRegion, 'Region Escape changed the previous selection'); equal(current().editor.getScene(), beforeCancel, 'Region Escape changed source')
    pointer(canvas(), 'pointerdown', client(world(pair[0]))); await frames(); pointer(window, 'pointermove', client(world({ x: pair[0].x + 14, y: pair[0].y }))); await frames(); await click('Spline edge mode')
    equal(current().editor.getScene(), beforeCancel, 'Mode change did not cancel old point gesture'); assert(!current().editor.isTransactionActive(), 'Mode change retained a transaction')
    await click('Spline point mode'); pointer(canvas(), 'pointerdown', client(world(pair[0]))); await frames(); pointer(window, 'pointermove', client(world({ x: pair[0].x + 16, y: pair[0].y }))); await frames(); flushSync(() => current().setTool('pan')); await frames()
    equal(current().editor.getScene(), beforeCancel, 'Pan handover did not cancel point preview'); assert(!current().editor.isTransactionActive(), 'Pan retained a geometry transaction'); flushSync(() => current().setTool('select')); await frames()
    checks.push('Region Escape and mode handover cancel their own pointer owner without applying stale IDs or geometry')

    await reset(true); await click('Spline point mode'); const source = structuredClone(current().editor.getScene()), driven = Object.values(layer().spline!.points)[0]
    await tap({ ...driven, x: driven.x + 20 }); await drag({ ...driven, x: driven.x + 20 }, { ...driven, x: driven.x + 50 })
    key('Delete'); await frames(); equal(current().editor.getScene(), source, 'Driven point/keys were overwritten')
    await click('Spline object mode'); await click('Select spline object Donut B'); key('ArrowRight'); await frames(); equal(layer().transform, source.layers[1].transform, 'Object arrow leaked to root animation'); equal(current().editor.getScene().timelines, source.timelines, 'Object arrow rewrote other keys'); await click('Undo'); equal(current().editor.getScene(), source, 'Object nudge Undo lost source')
    checks.push('Key-driven geometry is selectable but rejects source overwrites and root-command leakage')
    await click('Select parent'); await click('Select spline'); assert(!current().controller.active && !current().controller.ids.length, 'Selections leaked across layer context')
    await click('Spline edge mode'); await tap({ x: -110, y: -40 }); const edgeId = current().controller.ids[0]
    const select = document.querySelector<HTMLSelectElement>('[aria-label="Spline segment type"]')!; flushSync(() => { select.value = 'cubic'; select.dispatchEvent(new Event('change', { bubbles: true })) }); await frames()
    equal(current().editor.getScene(), source, 'Edge conversion bypassed coordinate driver guard')
    assert(document.querySelector('[role="alert"]'), 'Rejected topology edit has no explanation')
    checks.push('Layer changes reset edit context and guarded Edge Properties explain rejected topology changes')
    await reset(); await click('Spline edge mode'); await tap({ x: -110, y: -40 }); const editableEdge = current().controller.ids[0], beforeEdge = structuredClone(current().editor.getScene())
    const edgeControl = document.querySelector<HTMLSelectElement>('[aria-label="Spline segment type"]')!; flushSync(() => { edgeControl.value = 'cubic'; edgeControl.dispatchEvent(new Event('change', { bubbles: true })) }); await frames()
    assert(layer().spline!.segments[editableEdge].type === 'cubic', 'Edge Properties did not apply Curve'); equal(current().editor.getScene().timelines, beforeEdge.timelines, 'Edge type rewrote keys')
    await click('Undo'); equal(current().editor.getScene(), beforeEdge, 'Edge Properties Undo lost source'); await click('Redo'); assert(layer().spline!.segments[editableEdge].type === 'cubic', 'Edge Properties Redo failed')
    await click('Spline object mode'); await click('Select spline object Donut B'); const beforeName = structuredClone(current().editor.getScene())
    const name = document.querySelector<HTMLInputElement>('[aria-label="Spline object name"]')!; name.focus(); flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'Named donut'); name.dispatchEvent(new Event('input', { bubbles: true })) }); await frames(); flushSync(() => name.blur()); await frames()
    assert(Object.values(layer().spline!.subShapes).some(item => item.name === 'Named donut'), 'Object name was not committed'); equal(current().editor.getScene().timelines, beforeName.timelines, 'Object name changed keys'); await click('Undo'); equal(current().editor.getScene(), beforeName, 'Object metadata Undo lost source')
    checks.push('Edge Curve and Object name Properties apply through one Undo/Redo while keeping original key data')
    await reset(); await click('Spline object mode'); const obj = Object.values(layer().spline!.subShapes)[0]; await click(`Select spline object ${obj.name}`)
    const roundtrip = parseSceneJson(JSON.stringify(current().editor.getScene()), true); equal(roundtrip, current().editor.getScene(), 'Legacy spline source no longer round-trips')
    const finalPixels = await raster(); equal(Array.from(finalPixels), Array.from(pixels), 'Selection overlay leaked into final PNG')
    checks.push('Legacy compound source round-trips; final raster pixels are identical across edit modes')

    await reset(); const lineBaseline = structuredClone(current().editor.getScene())
    await click('Draw new line')
    assert(!current().selected && document.querySelector('[aria-label="Line drawing options"]'), 'New line does not expose Auto Close without a selected source')
    const setAuto = async (enabled: boolean) => { const checkbox = document.querySelector<HTMLInputElement>('[aria-label="Spline Auto Close"]')!; assert(checkbox, 'Drawing Auto Close missing'); if (checkbox.checked !== enabled) { flushSync(() => checkbox.click()); await frames() } }
    await setAuto(true)
    await tap({ x: -120, y: -130 }); await tap({ x: -25, y: -130 }); await tap({ x: -25, y: -75 })
    await contextAt({ x: 50, y: -20 })
    const created = current().editor.getScene().layers.find(item => !lineBaseline.layers.some(old => old.id === item.id))!, contour = Object.values(created.spline!.contours)[0]
    assert(contour.closed && contour.pointIds.length === 3 && contour.segmentIds.length === 3, 'Right-click Auto Close failed or added an unplaced pointer point')
    equal(current().editor.getScene().timelines, lineBaseline.timelines, 'New closed line changed animations')
    await click('Undo'); equal(current().editor.getScene().layers, lineBaseline.layers, 'Closed line was not one Undo'); await click('Redo')
    assert(Object.values(current().editor.getScene().layers.find(item => item.id === created.id)!.spline!.contours)[0].closed, 'Redo lost line closure')
    await click('Undo')
    await click('Draw new line'); await setAuto(false)
    await tap({ x: -110, y: -120 }); await tap({ x: -15, y: -120 }); await tap({ x: -15, y: -65 }); await contextAt({ x: -100, y: -100 })
    const openCreated = current().editor.getScene().layers.find(item => !lineBaseline.layers.some(old => old.id === item.id))!, openContour = Object.values(openCreated.spline!.contours)[0]
    assert(!openContour.closed && openContour.segmentIds.length === 2, 'Right-click closed a line with Auto Close off')
    await click('Undo')
    await click('Draw new line'); await setAuto(true)
    await tap({ x: -90, y: -120 }); await tap({ x: -15, y: -95 }); await contextAt({ x: 40, y: -40 })
    const short = current().editor.getScene().layers.find(item => !lineBaseline.layers.some(old => old.id === item.id))!
    assert(!Object.values(short.spline!.contours)[0].closed, 'Two anchors produced an invalid closed shape')
    await click('Undo')
    await click('Draw new line'); await tap({ x: -110, y: -120 }); await tap({ x: -15, y: -120 }); await tap({ x: -15, y: -65 }); key('Escape'); await frames()
    equal(current().editor.getScene().layers, lineBaseline.layers, 'Escape committed an Auto Close draft')
    checks.push('New line exposes Auto Close without selection: right-click closes only when enabled; one Undo/Redo, no extra pointer point, short/open and Escape remain safe')
    await reset(); await click('Spline object mode'); await click('Select spline object Donut B')
    const beforeObject = structuredClone(current().editor.getScene()), donutSource = Object.values(layer().spline!.subShapes).find(object => object.name === 'Donut B')!
    const donutPoints = donutSource.contourIds.flatMap(id => layer().spline!.contours[id].pointIds)
    await drag({ x: 145, y: 0 }, { x: 162, y: 11 })
    for (const id of donutPoints) { assert(Math.abs(layer().spline!.points[id].x - beforeObject.layers[1].spline!.points[id].x - 17) < 1e-6, 'Donut contour did not move once'); }
    equal(layer().transform, beforeObject.layers[1].transform, 'Object move changed outer transform'); equal(current().editor.getScene().timelines, beforeObject.timelines, 'Object move changed keys')
    await click('Undo'); equal(current().editor.getScene(), beforeObject, 'One Undo did not restore all contours')
    assert(!current().editor.canUndo, 'Object drag made extra history')
    checks.push('First Object drag moves outer and hole contours through parent inverse; final release and one Undo preserve root and keys')

    flushSync(() => current().setTool('rotate')); await frames(); await drag({ x: 145, y: 0 }, { x: 95, y: 50 })
    const firstDonutPoint = beforeObject.layers[1].spline!.points[donutPoints[0]], rotated = layer().spline!.points[donutPoints[0]]
    assert(Math.abs(rotated.x - 95 + firstDonutPoint.y) < 1e-5 && Math.abs(rotated.y - (firstDonutPoint.x - 95)) < 1e-5, 'Rotate did not use local sub-object pivot')
    await click('Undo'); flushSync(() => current().setTool('scale')); await frames(); await drag({ x: 145, y: 0 }, { x: 170, y: 0 })
    assert(Math.abs(layer().spline!.points[donutPoints[0]].x - (95 + (firstDonutPoint.x - 95) * 1.5)) < 1e-5, 'Scale did not transform selected object')
    await click('Undo'); flushSync(() => current().setTool('select')); await frames()
    checks.push('Rotate and Scale tools transform local selected objects, including curves, with the same one-Undo native session')

    const numericX = document.querySelector<HTMLInputElement>('[aria-label="Spline selection x"]')!
    flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(numericX, '8'); numericX.dispatchEvent(new Event('input', { bubbles: true })) }); await frames()
    await click('Apply selection transform')
    assert(Math.abs(layer().spline!.points[donutPoints[0]].x - firstDonutPoint.x - 8) < 1e-6, 'Numeric Apply did not translate selected geometry')
    await click('Undo'); equal(current().editor.getScene(), beforeObject, 'Numeric Apply was not one Undo')
    checks.push('Properties numeric selection transform applies local deltas through one native Undo without altering other objects')
    await click('Select spline object Rectangle A')
    const otherButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.getAttribute('aria-label') === 'Select spline object Donut B')!
    flushSync(() => otherButton.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))); await frames()
    assert(current().controller.ids.length === 2, 'Multi-object selection failed')
    await drag({ x: -110, y: -40 }, { x: -104, y: -35 })
    for (const point of Object.values(beforeObject.layers[1].spline!.points)) {
      assert(Math.abs(layer().spline!.points[point.id].x - point.x - 6) < 1e-6 && Math.abs(layer().spline!.points[point.id].y - point.y - 5) < 1e-6, 'Multiple objects did not move together once')
    }
    await click('Undo'); equal(current().editor.getScene(), beforeObject, 'Multi-object Undo lost source')
    checks.push('Multiple selected objects transform together, processing every shared anchor once and preserving outer animation')
    await choose('Add spline object', 'rectangle'); await drag({ x: -10, y: -110 }, { x: 60, y: -60 })
    assert(current().editor.getScene().layers.length === 2 && Object.keys(layer().spline!.subShapes).length === 3, 'Append added a root layer instead of an Object')
    assert(current().controller.mode === 'object' && current().controller.ids.length === 1 && !beforeObject.layers[1].spline!.subShapes[current().controller.ids[0]], 'Append did not focus the new Object')
    for (const [id, point] of Object.entries(beforeObject.layers[1].spline!.points)) equal(layer().spline!.points[id], point, 'Append replaced old coordinates')
    equal(layer().style, beforeObject.layers[1].style, 'Append replaced paint'); equal(current().editor.getScene().timelines, beforeObject.timelines, 'Append changed animation')
    await click('Undo'); equal(current().editor.getScene(), beforeObject, 'Append one Undo failed')
    checks.push('Add rectangle creates and focuses one new Object within the same spline; original geometry, paint and animation survive')

    await choose('Add spline object', 'line'); await tap({ x: -100, y: 90 }); await tap({ x: -20, y: 110 }); key('Enter'); await frames()
    const addedLine = layer().spline!.subShapes[current().controller.ids[0]], addedContour = layer().spline!.contours[addedLine.contourIds[0]], end = addedContour.pointIds.at(-1)!
    assert(!addedContour.closed, 'Add line unexpectedly continued/closed an existing contour')
    const beforeContinue = structuredClone(current().editor.getScene())
    flushSync(() => current().controller.enter('point', [end])); await frames(); await click('Continue selected endpoint')
    await tap({ x: 35, y: 100 }); key('Enter'); await frames()
    assert(layer().spline!.contours[addedContour.id].pointIds.length === 3, 'Continue did not extend the explicit endpoint')
    assert(Object.keys(layer().spline!.subShapes).length === 3, 'Continue created another object')
    for (const id of addedContour.segmentIds) equal(layer().spline!.segments[id], beforeContinue.layers[1].spline!.segments[id], 'Continue changed an existing curve')
    equal(current().editor.getScene().timelines, beforeContinue.timelines, 'Continue changed keys')
    await click('Undo'); equal(current().editor.getScene(), beforeContinue, 'Continue one Undo failed')
    checks.push('Add Line is separate from Continue; selected open endpoint extends its own contour with stable IDs and one Undo')

    await click('Spline object mode'); const auto = document.querySelector<HTMLInputElement>('[aria-label="Spline Auto Close"]')!
    if (!auto.checked) { flushSync(() => auto.click()); await frames() }
    await choose('Add spline object', 'line'); const start = { x: 0, y: -125 }
    await tap(start); await tap({ x: 70, y: -125 }); await tap({ x: 70, y: -80 }); await tap(start)
    const closedObject = layer().spline!.subShapes[current().controller.ids[0]], closedContour = layer().spline!.contours[closedObject.contourIds[0]]
    assert(closedContour.closed && closedContour.pointIds.length === 3 && new Set(closedContour.pointIds).size === 3, 'Auto Close duplicated an endpoint or failed to close')
    const paintBefore = structuredClone(current().editor.getScene()), fillBefore = structuredClone(layer().style!.fill)
    await choose('Spline Stroke Type', 'none'); equal(layer().style!.fill, fillBefore, 'Stroke None erased fill')
    await choose('Spline Fill Type', 'none'); assert(layer().style!.stroke!.type === 'none', 'Fill None revived stroke')
    equal(current().editor.getScene().timelines, paintBefore.timelines, 'Paint changes modified animation')
    const noPaintPixels = await raster(); assert(Array.from(noPaintPixels).some((value, i) => value !== pixels[i]), 'Independent None did not affect rendered output')
    await click('Undo'); await click('Undo'); equal(current().editor.getScene(), paintBefore, 'Independent paint Undo lost data')
    equal(parseSceneJson(JSON.stringify(paintBefore), true), paintBefore, 'Appended/continued/closed geometry failed portable round-trip')
    checks.push('Auto Close joins its own start without duplicate anchors; Fill/Stroke None are independent, undoable and renderable')

    const beforeAbort = structuredClone(current().editor.getScene())
    await choose('Add spline object', 'ellipse'); pointer(canvas(), 'pointerdown', client(world({ x: -60, y: 120 }))); await frames()
    pointer(window, 'pointermove', client(world({ x: -10, y: 145 }))); await frames()
    pointer(window, 'pointercancel', client(world({ x: -10, y: 145 }))); await frames(); key('Escape'); await frames()
    equal(current().editor.getScene(), beforeAbort, 'Cancelled box committed source')
    await choose('Add spline object', 'rectangle'); pointer(canvas(), 'pointerdown', client(world({ x: -50, y: 130 }))); await frames()
    flushSync(() => { const old = layer(); current().editor.dispatchCommand(makeUpdateLayerCmd(old.id, { name: 'Human rename during draw' }, old)) }); await frames()
    pointer(window, 'pointerup', client(world({ x: 0, y: 150 }))); await frames()
    assert(layer().name === 'Human rename during draw' && Object.keys(layer().spline!.subShapes).length === Object.keys(beforeAbort.layers[1].spline!.subShapes).length, 'Stale draw overwrote an intervening edit')
    assert(!current().editor.isTransactionActive(), 'Drawing left a transaction active')
    checks.push('Native box cancellation leaves no source; revision change rejects stale release and preserves the human edit')
    await reset(); await click('Spline object mode'); await click('Select spline object Donut B')
    status.textContent = `PASS · ${checks.length} groups`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
  finally { runButton.disabled = false }
}
document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button,#run{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}#host{max-width:1280px}pre{white-space:pre-wrap}</style><h1>Spline sub-object selection acceptance</h1><p>Real viewport, Properties, region/pointer sessions, keyboard, editor/history and raster output. Private source only.</p><button id="run">Run spline edit checks</button><p id="status">Ready</p><section id="host"></section><pre id="report">No checks run</pre>'
createRoot(document.getElementById('host')!).render(<Subject />)
document.getElementById('run')!.onclick = () => void run()
