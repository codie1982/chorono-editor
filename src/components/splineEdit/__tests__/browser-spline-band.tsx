import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createPolylineSpline, createRectangleSpline, createCircleSpline, createDonutSpline, splineToPathDefinition } from '@/lib/spline'
import { computeSplineBounds } from '@/lib/spline/geometry/computeSplineBounds'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { acquireRasterImage } from '@/lib/export/raster/RasterExportEngine'
import { exportSVG } from '@/lib/export/vector/SVGExporter'
import { projectModifierLayer } from '@/lib/modifiers'
import { Subject, fixture, current, frames, layer, click, key, choose, assert, equal, raster, contextAt, drag, tap } from './splineHarness'
import type { SplinePathData } from '@/lib/types/spline'
import { pathToSvgString } from '@/lib/geometry/PathCommand'
async function reset(data: SplinePathData, editing = true) {
  const scene = fixture(); scene.layers[1].spline = data; scene.layers[1].style = { fill: { type: 'none' }, stroke: { type: 'solid', color: '#f59e0b', width: 10 } }
  flushSync(() => { current().editor.resetScene(scene); current().select('spline'); current().setTime(400); current().setTool('select') }); await frames()
  if (editing) { key('3'); await frames(); await click(`Select spline object ${Object.values(data.subShapes)[0].name}`) }
}
async function number(label: string, value: number) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`); assert(input, `Missing ${label}`)
  flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value)); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) }); await frames()
}
async function open() {
  const details = document.querySelector<HTMLDetailsElement>('[aria-label="Spline Outline band"]'); assert(details, 'Outline native form missing')
  if (!details.open) { flushSync(() => details.querySelector('summary')!.click()); await frames() }
  await click('Preview Outline')
}
async function settled() {
  for (let i = 0; i < 600; i++) { await frames(1); if (!document.querySelector('[aria-label="Spline Outline band"]')?.textContent?.includes('Calculating Outline')) return }
  throw new Error('Band worker did not settle')
}
async function check(label: string, checked: boolean) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`); assert(input && !input.disabled, `Missing/disabled ${label}`)
  if (input.checked !== checked) { flushSync(() => input.click()); await frames() }
}
const snapshot = () => structuredClone(current().editor.getScene())
const line = () => createPolylineSpline([{ x: -120, y: 0 }, { x: 100, y: 0 }], false)
function visual() { return projectModifierLayer(layer(), true) }
function boundary() { return pathToSvgString(splineToPathDefinition(visual().spline!)) }
async function apply(width = 20) { await open(); await number('Outline Width', width); await choose('Outline Caps', 'round'); await settled(); await click('Apply Outline') }
async function run() {
  const status = document.getElementById('status')!, report = document.getElementById('report')!, checks: string[] = []
  try {
    await reset(line()); const source = snapshot()
    await open(); await number('Outline Width', 20); await settled()
    assert(document.querySelector('[aria-label="Spline Offset preview"]'), 'World-space preview missing')
    equal(current().editor.getScene(), source, 'Preview wrote source')
    await click('Cancel Outline'); await frames(10); equal(current().editor.getScene(), source, 'Cancel changed source')
    assert(!current().editor.canUndo && !document.querySelector('[aria-label="Spline Offset preview"]'), 'Cancel left history or stale overlay')
    checks.push('Real worker preview/Cancel has no source or Undo side effects')
    await apply(); const applied = snapshot(), originalData = source.layers[1].spline!
    equal(layer().spline, originalData, 'Live Outline replaced the source line')
    assert(layer().modifierStack?.modifiers[0].type === 'liveOutline', 'Apply did not create a live recipe')
    equal(Object.keys(visual().spline!.subShapes), Object.keys(originalData.subShapes), 'Evaluated band added logical Objects')
    equal(layer().transform, source.layers[1].transform, 'Outline changed TRS/origin'); equal(layer().style, source.layers[1].style, 'Outline changed source paint')
    await click('Undo'); equal(current().editor.getScene(), source, 'Outline is not one Undo'); await click('Redo'); equal(current().editor.getScene(), applied, 'Outline Redo changed source/recipe')
    checks.push('Apply retains the exact source records and Object IDs; one Undo/Redo and unchanged layer placement')
    key('1'); await frames()
    equal(Array.from(document.querySelectorAll('[data-spline-point-id]')).map(e => e.getAttribute('data-spline-point-id')), Object.keys(layer().spline!.points), 'Viewport shows band vertices instead of source points')
    const point = Object.values(layer().spline!.points)[1], beforeMove = snapshot(), beforeBand = boundary(), ghost = document.querySelector('[data-edit-ghost]')?.getAttribute('d')
    await drag(point, { x: point.x, y: point.y + 45 })
    assert(layer().spline!.points[point.id].y > point.y + 20, 'Source vertex did not move')
    assert(boundary() !== beforeBand, 'Band did not follow source vertex')
    equal(Object.keys(layer().spline!.points), Object.keys(originalData.points), 'Source vertex IDs changed on move')
    equal(document.querySelector('[data-edit-ghost]')?.getAttribute('d'), ghost, 'Edit ghost followed live source instead of preserving the session start')
    const moved = snapshot(); await click('Undo'); equal(current().editor.getScene(), beforeMove, 'Vertex drag created extra Undo steps'); await click('Redo'); equal(current().editor.getScene(), moved, 'Vertex drag Redo changed source')
    checks.push('Actual source vertex drag updates the band, preserves IDs/fixed ghost and is a separate exact Undo')
    const beforeGuide = snapshot(), pixels = await raster()
    await check('Show source line', false)
    assert(!document.querySelector('[data-spline-source-guide]'), 'Source guide remained visible')
    equal(current().editor.getScene(), beforeGuide, 'Guide toggle wrote scene/Undo')
    const hiddenPixels = await raster(); assert(pixels.length === hiddenPixels.length && pixels.every((v, i) => v === hiddenPixels[i]), 'Guide visibility leaked into PNG output')
    await check('Show source line', true); assert(document.querySelector('[data-spline-source-guide]'), 'Source guide could not be restored')
    checks.push('Guide visibility is independent of source/Outline and never changes exported PNG pixels')
    const sourceData = structuredClone(layer().spline!)
    await check('Outline enabled', false); equal(layer().spline, sourceData, 'Disable changed source'); equal(visual().spline, sourceData, 'Off did not restore the original source line')
    await check('Outline enabled', true); equal(layer().spline, sourceData, 'Re-enable changed source'); assert(boundary() !== pathToSvgString(splineToPathDefinition(sourceData)), 'Re-enable did not restore band')
    const beforeBake = snapshot(); await click('Bake Outline / Stroke to Path')
    assert(!layer().modifierStack && Object.keys(layer().spline!.points).length > Object.keys(sourceData.points).length, 'Explicit Bake did not materialize boundary vertices')
    await click('Undo'); equal(current().editor.getScene(), beforeBake, 'Bake Undo did not restore live source+settings')
    checks.push('Enable/Off keeps source editable; only explicit Bake converts to boundary vertices, with one Undo')
    await reset(line()); await apply(16); key('2'); await frames()
    const refineObjects = Object.keys(layer().spline!.subShapes)
    await click('Add Vertex'); await tap({ x: -10, y: 0 })
    assert(Object.keys(layer().spline!.points).length === 3, 'Continuous Add Vertex did not edit the source')
    assert(layer().modifierStack!.modifiers[0].type === 'liveOutline' && visual().spline, 'Refine lost the live recipe')
    key('Escape'); await frames(); equal(Object.keys(layer().spline!.subShapes), refineObjects, 'Refine changed ownership')
    checks.push('Edge Add Vertex refines the live source and re-evaluates its band without stale topology scope')
    await reset(createCircleSpline({ radius: 90 })); await apply(18); key('1'); await frames()
    const handle = Object.values(layer().spline!.handles)[0], anchors = structuredClone(layer().spline!.points), handleBand = boundary()
    await drag(handle, { x: handle.x + 12, y: handle.y + 18 })
    assert(boundary() !== handleBand, 'Band did not follow the actual Bezier handle drag'); equal(layer().spline!.points, anchors, 'Handle drag moved source anchors')
    checks.push('Bezier handles remain source controls and deform the live band without replacing anchors')
    await reset(createRectangleSpline({ width: 100, height: 80 })); key('2'); await frames()
    flushSync(() => current().controller.enter('edge', [Object.keys(layer().spline!.segments)[0]])); await frames()
    const details = document.querySelector<HTMLDetailsElement>('[aria-label="Spline Outline band"]')!; flushSync(() => { details.open = true }); await frames()
    const previewButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Preview Outline')!
    assert(previewButton.disabled && details.textContent?.includes('partial-chain'), 'Partial source tracking silently expanded to a contour')
    await reset(line()); await contextAt({ x: 0, y: 0 }); assert(Array.from(document.querySelectorAll('[role="menuitem"]')).some(e => e.textContent?.includes('Outline · Live')), 'Context menu lacks Live Outline')
    checks.push('Panel/context menu share live admission; unsupported partial chains explain their restriction')
    await reset(createDonutSpline({ outerRadius: 95, innerRadius: 38 }), false)
    await click('Add Spline modifiers')
    const menuItem = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(e => e.querySelector('span.truncate')?.textContent?.trim() === 'Outline')
    assert(menuItem, 'Live Outline absent outside Edit'); flushSync(() => menuItem.click()); await frames(); assert(!current().geometryEdit.active, 'Adding Outline forced Edit')
    const beforeDraft = snapshot(); await number('Outline Width', 20); equal(current().editor.getScene(), beforeDraft, 'Modifier draft changed source'); await click('Execute stack')
    const sourceId = Object.keys(layer().spline!.subShapes)[0], beforePaint = structuredClone(layer().spline)
    await choose('Spline paint target', sourceId); await choose('Spline Fill Type', 'gradient'); equal(layer().spline, beforePaint, 'Band paint rewrote source geometry')
    assert(visual().spline!.subShapes[sourceId].paint?.style?.fill?.type === 'gradient', 'Properties paint did not reach the evaluated band')
    checks.push('Live Outline works outside Edit; draft/Execute and independent Properties paint preserve source')
    const portable = snapshot(), parsed = parseSceneJson(JSON.stringify(portable), true), svg = exportSVG(parsed, { timeMs: current().time }).svg
    assert(svg.includes('linearGradient') && svg.includes('fill-rule="evenodd"') && !svg.includes('data-spline-source-guide'), 'SVG lost paint/holes or exported the guide')
    document.getElementById('portable-output')!.textContent = JSON.stringify(portable, null, 2); document.getElementById('svg-output')!.textContent = svg
    const png = await acquireRasterImage(parsed, new Map(), { format: 'png', timeMs: current().time })
    try { document.getElementById('png-output')!.textContent = btoa(Array.from(new Uint8Array(await png.value.blob.arrayBuffer()), byte => String.fromCharCode(byte)).join('')) } finally { png.release() }
    checks.push('Portable source+recipe and actual PNG/SVG preserve live band paint and holes without source-guide geometry')
    status.textContent = `PASS · ${checks.length} groups`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
}
document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}pre{white-space:pre-wrap}</style><h1>Live Outline source editing acceptance</h1><p id="status">Ready</p><section id="host"></section><pre id="report"></pre><script id="portable-output" type="application/json"></script><script id="svg-output" type="text/plain"></script><script id="png-output" type="text/plain"></script>'
createRoot(document.getElementById('host')!).render(<Subject strictPanel />)
if (new URL(location.href).searchParams.has('autorun')) void frames().then(run)
