import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createPolylineSpline, createRectangleSpline, createDonutSpline } from '@/lib/spline'
import { computeSplineBounds } from '@/lib/spline/geometry/computeSplineBounds'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { acquireRasterImage } from '@/lib/export/raster/RasterExportEngine'
import { exportSVG } from '@/lib/export/vector/SVGExporter'
import { Subject, fixture, current, frames, layer, click, key, choose, assert, equal, raster, contextAt } from './splineHarness'
import type { SplinePathData } from '@/lib/types/spline'
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
const snapshot = () => structuredClone(current().editor.getScene())
const line = () => createPolylineSpline([{ x: -120, y: 0 }, { x: 100, y: 0 }], false)
async function run() {
  const status = document.getElementById('status')!, report = document.getElementById('report')!, checks: string[] = []
  try {
    await reset(line()); const source = snapshot()
    await open(); await number('Outline Width', 20); await choose('Outline Caps', 'round'); await settled()
    assert(document.querySelector('[aria-label="Spline Offset preview"]'), 'World-space preview overlay missing')
    equal(current().editor.getScene(), source, 'Preview wrote source')
    await click('Cancel Outline'); await frames(10); equal(current().editor.getScene(), source, 'Cancel changed source')
    assert(!current().editor.canUndo && !document.querySelector('[aria-label="Spline Offset preview"]'), 'Cancel left history or stale overlay')
    checks.push('Real worker preview is source-only; Cancel terminates work and leaves no Undo/overlay')
    await open(); await number('Outline Width', 20); await choose('Outline Caps', 'square'); await settled(); await click('Apply Outline')
    const applied = snapshot(), bandId = current().controller.ids[0]
    assert(layer().spline!.subShapes[bandId].paint?.source === 'stroke', 'Applied band lacks independent paint binding')
    equal(layer().transform, source.layers[1].transform, 'Outline changed TRS/origin'); equal(layer().style, source.layers[1].style, 'Outline changed source paint')
    assert(!layer().modifierStack && Math.abs(computeSplineBounds(layer().spline!).width - 240) < .01, 'Native Outline appended modifier or used world-scale width')
    await click('Undo'); equal(current().editor.getScene(), source, 'Outline is not one Undo'); await click('Redo'); equal(current().editor.getScene(), applied, 'Outline Redo changed records')
    checks.push('Apply creates real filled local-pixel geometry, keeps layer TRS/origin/paint and supports exact single Undo/Redo')
    await reset(createRectangleSpline({ width: 120, height: 90 })); await open(); await number('Outline Width', 12); await choose('Outline Alignment', 'inside'); await settled()
    const keep = document.querySelector<HTMLInputElement>('[aria-label="Keep Outline source"]')!; flushSync(() => keep.click()); await frames(); await settled(); await click('Apply Outline')
    assert(Object.keys(layer().spline!.subShapes).length === 2, 'Keep source did not append within the same spline')
    const painted = Object.values(layer().spline!.subShapes).find(o => o.paint)!
    await choose('Spline paint target', painted.id); await choose('Spline Fill Type', 'gradient')
    assert(layer().spline!.subShapes[painted.id].paint?.source === 'custom', 'Properties did not create independent band appearance')
    assert(layer().style!.fill!.type === 'none', 'Band fill modified source fill')
    checks.push('Keep source stays in the same spline; Properties targets band gradient independently from original paint')
    await reset(line()); await open(); await number('Outline Width', 22); key('Escape'); await frames(15)
    assert(!document.querySelector('[aria-label="Spline Offset preview"]') && !current().editor.canUndo, 'Mode exit accepted a stale band preview')
    checks.push('Escape/mode exit discards preview and late worker results')
    await reset(createRectangleSpline({ width: 100, height: 80 })); key('2'); await frames()
    const firstEdge = Object.keys(layer().spline!.segments)[0]
    flushSync(() => current().controller.enter('edge', [firstEdge])); await frames(); await open(); await number('Outline Width', 8);
    const partialKeep = document.querySelector<HTMLInputElement>('[aria-label="Keep Outline source"]')!; if (partialKeep.checked) { flushSync(() => partialKeep.click()); await frames() }
    await settled(); await click('Apply Outline')
    assert(!layer().spline!.segments[firstEdge], 'Partial Edge band did not replace selected edge')
    assert(Object.values(layer().spline!.contours).some(c => !c.closed), 'Unselected source edge chain was removed')
    checks.push('Edge Outline processes a partial connected chain while retaining unselected edges')
    await reset(line()); await contextAt({ x: 0, y: 0 })
    assert(Array.from(document.querySelectorAll('[role="menuitem"]')).some(e => e.textContent?.includes('Outline · Stroke to Path')), 'Right-click lacks shared Outline action')
    await reset(createDonutSpline({ outerRadius: 95, innerRadius: 38 }), false)
    assert(!current().geometryEdit.active, 'Expected outside Edit')
    await click('Add Spline modifiers')
    const menuItem = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(e => e.querySelector('span.truncate')?.textContent?.trim() === 'Stroke to Path')
    assert(menuItem, 'Stroke to Path is missing in modifier picker'); flushSync(() => menuItem.click()); await frames()
    assert(!current().geometryEdit.active && layer().modifierStack?.modifiers[0].enabled, 'Modifier needs Edit or was disabled unexpectedly')
    const beforeDraft = snapshot(); await number('Stroke to Path Width', 18); equal(current().editor.getScene(), beforeDraft, 'Modifier draft applied without Execute')
    await click('Execute stack'); assert(layer().modifierStack!.modifiers[0].settings.widthPx === 18, 'Execute ignored band width')
    await choose('Spline paint target', Object.values(layer().spline!.subShapes).find(o => o.paint)!.id); await choose('Spline Fill Type', 'gradient')
    const customId = Object.values(layer().spline!.subShapes).find(o => o.paint)!.id
    const custom = layer().splinePaintOverrides?.objects[customId]; assert(custom?.fill?.type === 'gradient', 'Generated paint Properties edit was refused')
    await number('Stroke to Path Width', 20); await click('Execute stack'); equal(layer().splinePaintOverrides?.objects[customId], custom, 'Execute lost custom paint')
    checks.push('Context menu exposes native Outline; modifier works outside Edit with draft/Execute and retains independent appearance')
    const portable = snapshot(), parsed = parseSceneJson(JSON.stringify(portable), true), pixels = await raster()
    assert(pixels.some(c => c > 0), 'PNG output is empty')
    const svg = exportSVG(parsed, { timeMs: current().time }).svg
    document.getElementById('portable-output')!.textContent = JSON.stringify(portable, null, 2); document.getElementById('svg-output')!.textContent = svg
    assert(svg.includes('linearGradient') && svg.includes(`fill-rule="${layer().spline!.fillRule}"`), 'SVG lost gradient or hole rule: ' + svg.slice(0, 400))
    const png = await acquireRasterImage(parsed, new Map(), { format: 'png', timeMs: current().time })
    try { document.getElementById('png-output')!.textContent = btoa(Array.from(new Uint8Array(await png.value.blob.arrayBuffer()), byte => String.fromCharCode(byte)).join('')) } finally { png.release() }
    checks.push('Portable save/load plus actual PNG/SVG preserve independent gradient and hole geometry')
    status.textContent = `PASS · ${checks.length} groups`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
}
document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}pre{white-space:pre-wrap}</style><h1>Outline / Stroke to Path acceptance</h1><p id="status">Ready</p><section id="host"></section><pre id="report"></pre><script id="portable-output" type="application/json"></script><script id="svg-output" type="text/plain"></script><script id="png-output" type="text/plain"></script>'
createRoot(document.getElementById('host')!).render(<Subject strictPanel />)
if (new URL(location.href).searchParams.has('autorun')) void frames().then(run)
