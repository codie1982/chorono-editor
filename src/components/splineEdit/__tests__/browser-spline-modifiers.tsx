import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createRectangleSpline, createCircleSpline, createPolylineSpline, createDonutSpline, mergeSplineData, translateSplineData, splineToPathDefinition } from '@/lib/spline'
import { computeSplineBounds } from '@/lib/spline/geometry/computeSplineBounds'
import { modifierStackService } from '@/lib/modifiers'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { prepareAddModifier } from '@/lib/editor/modifiers/commands'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { Subject, fixture, current, frames, layer, click, key, assert, equal, raster } from './splineHarness'
import { checkGeometryEditShortcuts } from './checkGeometryEditShortcuts'
import type { SplinePathData } from '@/lib/types/spline'

/** Disposable production scene; no connected editor or user document is read. */
async function reset(data?: SplinePathData, editing = true) {
  const scene = fixture(); if (data) scene.layers[1] = { ...scene.layers[1], spline: data }
  flushSync(() => { current().editor.resetScene(scene); current().select('spline') }); await frames()
  if (editing) { key('3'); await frames(); assert(current().geometryEdit.active, 'Edit panel did not enter Object session') }
}
async function menu(label: string) {
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(item => item.querySelector('span.truncate')?.textContent?.trim() === label)
  assert(item && item.getAttribute('aria-disabled') !== 'true', `Missing/disabled ${label}`)
  flushSync(() => item.click()); await frames()
}
async function add(label: string) { await click('Add Spline modifiers'); await menu(label) }
async function number(label: string, value: number) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`); assert(input, `Missing ${label}`)
  flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value)); input.dispatchEvent(new Event('input', { bubbles: true })) }); await frames()
}
async function check(label: string, enabled: boolean) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`); assert(input && !input.disabled, `Missing/disabled ${label}`)
  if (input.checked !== enabled) { flushSync(() => input.click()); await frames() }
}
function record(type: string) { const value = layer().modifierStack?.modifiers.find(item => item.type === type); assert(value, `Missing ${type}`); return value }
async function row(type: string) {
  const value = record(type), button = document.querySelector<HTMLButtonElement>(`[data-modifier-id="${value.id}"] button[aria-pressed]`); assert(button, `Missing row ${type}`)
  flushSync(() => button.click()); await frames()
}
const rectangle = () => createRectangleSpline({ width: 100, height: 80 })
const snapshot = () => structuredClone(current().editor.getScene())
function path() { return splineToPathDefinition(layer().spline!) }

async function run() {
  const status = document.getElementById('status')!, report = document.getElementById('report')!, checks: string[] = []
  try {
    checks.push(await checkGeometryEditShortcuts())
    await reset(rectangle(), false)
    assert(!current().geometryEdit.active && !document.querySelector('[aria-label="Spline editing mode"]'), 'Native Spline tools leaked outside Edit')
    await add('Offset Path'); await number('Offset Path Distance', 5)
    assert(!Array.from(document.querySelectorAll('button')).some(button => /^(Enter|Exit) edit mode$/.test(button.textContent?.trim() ?? '')), 'Removed edit mode button is still shown')
    key('3'); await frames(); assert(current().geometryEdit.active, 'Shortcut did not enter generated Spline Edit')
    key('Escape'); await frames(); assert(!current().geometryEdit.active, 'Escape did not exit generated Spline Edit')
    equal(document.querySelector<HTMLInputElement>('[aria-label="Offset Path Distance"]')!.value, '5', 'Mode toggle lost modifier draft')
    await click('Execute stack'); assert(Math.abs(computeSplineBounds(layer().spline!).width - 110) < 1e-8, 'Execute outside Edit failed')
    await check('Enable Offset Path 1', false); await check('Enable Offset Path 1', true)
    const outside = snapshot(); await click('Bake stack')
    assert(!current().geometryEdit.active && !current().controller.active && !layer().modifierStack, 'Bake outside Edit started a source session')
    await click('Undo'); equal(current().editor.getScene(), outside, 'Outside Bake Undo lost stack')
    assert(!current().geometryEdit.active, 'Outside Undo entered Edit')
    checks.push('Spline modifiers work outside Edit; mode toggles retain drafts, Execute/toggle/Bake/Undo never start a source session')

    const meshScene = fixture(); meshScene.layers[1] = { ...newStructuredGridMesh2DLayer(), id: 'spline', parentId: meshScene.layers[0].id }
    flushSync(() => { current().editor.resetScene(meshScene); current().select('spline') }); await frames()
    assert(!current().geometryEdit.active && !document.querySelector('[aria-label="Mesh selection mode"]') && !document.querySelector('[aria-label="Mesh settings"]'), 'Mesh source tools leaked outside Edit')
    await click('Add Mesh modifiers'); await menu('Smooth'); await number('Smooth Amount', .5); await click('Execute stack')
    equal(record('meshSmooth').settings.strength, .5, 'Mesh modifier outside Edit did not Execute')
    await click('Bake stack'); assert(!current().geometryEdit.active && !layer().modifierStack, 'Mesh Bake outside Edit entered source session')
    checks.push('Actual Mesh picker/settings/Execute/Bake work without entering Edit; source mode and texture/pin tools stay hidden')

    await reset(rectangle()); await click('Add Spline modifiers')
    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"] span.truncate')).map(item => item.textContent)
    equal(labels, ['Offset Path', 'Round Corners', 'Path Simplify', 'Path Smoothing'], 'Chooser mixed legacy/Mesh entries into the new spline package')
    key('Escape'); await frames(); checks.push('Actual Edit chooser exposes four distinct modern spline operations and keeps compatibility/Mesh entries separate')

    const original = snapshot(), originalPixels = await raster(); await add('Offset Path')
    assert(current().geometryEdit.active && !current().controller.active, 'Generated source made the modifier panel unreachable')
    assert(Math.abs(computeSplineBounds(layer().spline!).width - 102) < 1e-8, 'Default offset failed')
    const first = snapshot(); await number('Offset Path Distance', 10); equal(current().editor.getScene(), first, 'Typing changed geometry before Execute')
    await click('Execute stack'); const ten = snapshot()
    assert(current().geometryEdit.active, 'Execute closed the modifier panel session')
    assert(Math.abs(computeSplineBounds(layer().spline!).width - 120) < 1e-8, 'Offset did not evaluate from original source')
    await click('Undo'); assert(current().geometryEdit.active, 'Undo closed the modifier panel session'); equal(current().editor.getScene(), first, 'Execute was not one Undo'); await click('Redo'); assert(current().geometryEdit.active, 'Redo closed the modifier panel session'); equal(current().editor.getScene(), ten, 'Redo changed prepared output')
    await number('Offset Path Distance', 20); await click('Execute stack')
    assert(current().geometryEdit.active, 'Repeated Execute closed the modifier panel session')
    assert(Math.abs(computeSplineBounds(layer().spline!).width - 140) < 1e-8, 'Offset accumulated old result')
    equal(layer().modifierStack!.source, { kind: 'spline', spline: original.layers[1].spline }, 'Modifier replaced canonical source')
    equal(layer().transform, original.layers[1].transform, 'Offset changed layer origin/TRS')
    const offsetPixels = await raster(); assert(offsetPixels.some((channel, index) => channel !== originalPixels[index]), 'Actual PNG ignored the executed modifier')
    assert(current().geometryEdit.active, 'Raster output closed the modifier panel session')
    await check('Enable Offset Path 1', false); assert(Math.abs(computeSplineBounds(layer().spline!).width - 100) < 1e-8, 'Disable did not restore source input')
    await check('Enable Offset Path 1', true); assert(Math.abs(computeSplineBounds(layer().spline!).width - 140) < 1e-8, 'Enable lost authored settings')
    checks.push('Offset drafts require Execute, recompute from retained source, preserve placement, change actual PNG and support separate Undo/Redo/toggle')

    await reset(rectangle()); const beforeRound = snapshot(); await add('Round Corners')
    assert(Object.values(layer().spline!.segments).some(edge => edge.type === 'cubic'), 'Round Corners did not use the Fillet geometry')
    const defaultRound = snapshot(); await number('Round Corners Radius', 5); equal(current().editor.getScene(), defaultRound, 'Radius draft wrote source')
    await click('Execute Round Corners settings 1'); assert(JSON.stringify(path()) !== JSON.stringify(splineToPathDefinition(defaultRound.layers[1].spline!)), 'Radius did not change result')
    equal(layer().modifierStack!.source, { kind: 'spline', spline: beforeRound.layers[1].spline }, 'Round Corners lost original points')
    await click('Undo'); equal(current().editor.getScene(), defaultRound, 'Row Execute was not one Undo')
    checks.push('Round Corners uses its own radius form and per-row Execute without changing the stored source')

    await click('Bake stack'); key('Escape'); await frames()
    const bakedCorners = snapshot(); await add('Round Corners')
    assert(record('roundCorners').enabled, 'Already rounded Corner points added the new modifier disabled')
    await check('Enable Round Corners 1', false)
    await number('Round Corners Radius', 20); await click('Execute stack')
    await check('Enable Round Corners 1', true)
    assert(!current().geometryEdit.active, 'Updating baked corners entered Edit')
    assert(Object.values(layer().spline!.points).some(p => Math.abs(p.x + 30) < 1e-6 && Math.abs(p.y + 40) < 1e-6), 'Radius 20 did not replace the baked radius')
    const largeCorners = snapshot(), largePixels = await raster()
    await number('Round Corners Radius', 2); await click('Execute stack')
    assert(Object.values(layer().spline!.points).some(p => Math.abs(p.x + 48) < 1e-6 && Math.abs(p.y + 40) < 1e-6), 'Smaller radius did not replace the same original rounded corner')
    const smallPixels = await raster(); assert(smallPixels.some((value, index) => value !== largePixels[index]), 'Radius replacement did not affect the actual PNG')
    equal(layer().modifierStack!.source, { kind: 'spline', spline: bakedCorners.layers[1].spline }, 'Rounding replaced its baked source')
    equal(layer().transform, bakedCorners.layers[1].transform, 'Radius replacement changed layer TRS')
    await click('Undo'); equal(current().editor.getScene(), largeCorners, 'Baked radius Execute was not one exact Undo')
    await click('Redo'); assert(!current().geometryEdit.active, 'Radius Redo entered Edit')
    checks.push('Baked Bézier Corner arcs accept larger/smaller absolute radii outside Edit, re-enable saved disabled rows, retain source/TRS and change PNG with individual Undo/Redo')

    await reset(createCircleSpline({ radius: 40 })); await add('Round Corners'); assert(!record('roundCorners').enabled, 'Unsupported default was published as active geometry')
    const disabled = snapshot(); await check('Enable Round Corners 1', true); equal(current().editor.getScene(), disabled, 'Invalid activation wrote geometry/history')
    assert(document.querySelector('[role="alert"]')?.textContent?.includes('No sharp'), 'No-corner diagnostic missing')
    checks.push('Unsupported Round Corners defaults stay disabled with a real diagnostic; invalid activation is atomic')

    const noise = createPolylineSpline(Array.from({ length: 21 }, (_, index) => ({ x: -160 + index * 5, y: -40 + Math.sin(index) * .1 })), false)
    Object.values(noise.subShapes)[0].name = 'Noise'
    const donut = translateSplineData(createDonutSpline({ outerRadius: 60, innerRadius: 25 }), 90, 0)
    Object.values(donut.subShapes)[0].name = 'Ring'
    await reset(mergeSplineData(noise, donut)); await click('Select spline object Noise'); await add('Path Simplify')
    equal(record('pathSimplify').settings.objectIds, [], 'Add implicitly captured the transient Object selection')
    await check('Path Simplify target Ring', false); await click('Execute stack')
    const coarse = snapshot(); assert(Object.keys(layer().spline!.points).length < Object.keys(noise.points).length + Object.keys(donut.points).length, 'Simplify did not reduce anchors')
    equal(record('pathSimplify').settings.objectIds, Object.keys(noise.subShapes), 'Explicit Object target was not captured')
    await number('Path Simplify Tolerance', .001); equal(current().editor.getScene(), coarse, 'Tolerance draft wrote source')
    await click('Execute stack'); assert(Object.keys(layer().spline!.points).length > Object.keys(coarse.layers[1].spline!.points).length, 'Fine tolerance did not recover original anchors')
    for (const point of Object.values(donut.points)) equal(layer().spline!.points[point.id], point, 'Simplify changed unselected hole geometry')
    checks.push('Add ignores transient Edit selection; explicit Path Simplify Object scope retains unrelated holes and recovers source anchors at finer tolerance')

    await reset(); await click('Select spline object Donut B'); const smoothSource = snapshot(); await add('Path Smoothing'); await add('Offset Path'); await row('pathSmoothing')
    const beforeScope = snapshot(); await check('Path Smoothing target Rectangle A', true); await check('Path Smoothing target Donut B', false)
    equal(current().editor.getScene(), beforeScope, 'Object target checkboxes bypassed Execute')
    await click('Execute stack'); const scoped = snapshot(), rectangleId = Object.values(smoothSource.layers[1].spline!.subShapes).find(object => object.name === 'Rectangle A')!.id
    equal(record('pathSmoothing').settings.objectIds, [rectangleId], 'Stage-input scope was not stored')
    const stage = modifierStackService.evaluator.execute(layer().modifierStack!, { layerId: layer().id }, 1); assert(stage.kind === 'spline', 'Wrong stage output')
    for (const p of Object.values(smoothSource.layers[1].spline!.points)) assert(stage.spline.points[p.id].x === p.x && stage.spline.points[p.id].y === p.y, 'Smoothing moved an anchor')
    await click('Bake stack'); assert(!layer().modifierStack && current().controller.active && current().controller.mode === 'object', 'Bake did not re-enter editable Object mode')
    await click('Undo'); equal(current().editor.getScene(), scoped, 'Bake was not one exact Undo')
    equal(parseSceneJson(JSON.stringify(scoped), true).layers[1].modifierStack, scoped.layers[1].modifierStack, 'Recipe save/load changed')
    checks.push('Path Smoothing exposes actual stage-input Objects while generated, fixes anchors, supports scoped Execute, portable save and Bake/Undo re-entry')

    await reset(rectangle()); await add('Offset Path'); await add('Round Corners'); const ordered = snapshot()
    await click('Move Round Corners up 2'); assert(JSON.stringify(path()) !== JSON.stringify(splineToPathDefinition(ordered.layers[1].spline!)), 'Stack ignored operation order')
    const moved = snapshot(); await click('Remove Round Corners modifier 1'); equal(layer().modifierStack!.modifiers.map(item => item.type), ['offsetPath'], 'Could not remove non-tail modifier')
    await click('Undo'); equal(current().editor.getScene(), moved, 'Removal was not one Undo')
    checks.push('Actual stack rows reorder noncommuting operations and remove an arbitrary row with exact Undo')

    await reset(rectangle()); const old = prepareAddModifier(current().editor.getScene(), layer().id, 'offset')
    flushSync(() => current().editor.dispatchCommand(old.command)); await frames()
    const drawer = document.querySelector<HTMLDetailsElement>('[aria-label="Source / History"]')!; assert(drawer && !drawer.open, 'Legacy-only stack no longer starts in the closed history drawer')
    flushSync(() => { drawer.open = true }); await frames(); await add('Offset Path')
    equal(layer().modifierStack!.modifiers.map(item => item.type), ['offset', 'offsetPath'], 'New operation rewrote legacy record')
    const pixels = await raster(); assert(pixels.some(channel => channel > 0), 'Actual output is empty')
    checks.push('Legacy-only records keep closed compatibility history; adding a modern operation preserves old type/order and valid raster output')
    flushSync(() => current().editor.resetScene(bakedCorners)); await frames()
    await add('Round Corners'); await number('Round Corners Radius', 20); await click('Execute stack')
    assert(!current().geometryEdit.active, 'Final baked-radius display entered Edit')
    const stack = document.querySelector('[aria-label="Modifier stack"]')!; stack.scrollIntoView({ block: 'center' })
    status.textContent = `PASS · ${checks.length} groups`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
}
document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button,#run{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}#host{max-width:1350px}pre{white-space:pre-wrap}</style><h1>Static spline modifier acceptance</h1><p>Disposable production Edit dock, viewport, native commands and raster output.</p><button id="run">Run checks</button><p id="status">Ready</p><section id="host"></section><pre id="report">No checks run</pre>'
createRoot(document.getElementById('host')!).render(<Subject strictPanel />)
document.getElementById('run')!.onclick = () => void run()
if (new URL(location.href).searchParams.has('autorun')) void frames().then(run)
