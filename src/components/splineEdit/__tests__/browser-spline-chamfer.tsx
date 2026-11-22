import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createCircleSpline, createRectangleSpline, appendSplineObjects } from '@/lib/spline'
import { splineToPathDefinition } from '@/lib/spline/splineToPath'
import { PlanarOutlineBackend, outlineToSpline } from '@/lib/spline/outline'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { assertSplineTopology, deleteSplineEdges } from '@/lib/spline/topology'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { Subject, fixture, current, frames, layer, tap, click, key, choose, assert, equal, raster, canvas } from './splineHarness'

/** Disposable fixture with animated rotated/nonuniform parent. Select corners
 * through the production Point-mode viewport handlers, not test-only UI state. */
async function load(curved = false, keyed = false) {
  const scene = fixture(), data = curved ? createCircleSpline({ radius: 90 }) : createRectangleSpline({ width: 150, height: 120 })
  scene.layers[1].spline = data
  if (keyed) scene.timelines[0].tracks.push({ target: `layers.spline.spline.points.${Object.keys(data.points)[0]}.x`, keyframes: [{ id: 'human-corner', timeMs: 0, value: 10, easing: { type: 'linear' } }] })
  flushSync(() => { current().editor.resetScene(scene); current().select('spline'); current().setTime(400); current().setTool('select') }); await frames()
  await click('Spline point mode')
  const points = Object.values(data.points)
  await tap(keyed ? { ...points[0], x: 10 } : points[0]); await tap(points[1], { shiftKey: true })
  assert(current().controller.ids.length === 2, 'Viewport did not select both corners')
  return structuredClone(current().editor.getScene())
}
async function openControls() {
  const details = document.querySelector<HTMLDetailsElement>('[aria-label="Spline Chamfer"]')!
  assert(details, 'Point-mode Chamfer controls missing')
  if (!details.open) { flushSync(() => details.querySelector('summary')!.click()); await frames() }
}
/** Drive the controlled calculation widget through actual input events. */
async function number(value: number) {
  const field = document.querySelector<HTMLInputElement>('[aria-label="Chamfer distance"]')!
  flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, String(value)); field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })) }); await frames()
}
async function settled() {
  for (let i = 0; i < 600; i++) { await frames(1); if (!document.querySelector('[aria-label="Spline Chamfer"]')?.textContent?.includes('Calculating Chamfer')) return }
  throw new Error('Chamfer worker acceptance timeout')
}
function applyButton() { return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Apply Chamfer') }

async function run() {
  const status = document.getElementById('status')!, report = document.getElementById('report')!, checks: string[] = []
  const button = document.getElementById('run') as HTMLButtonElement; button.disabled = true; status.textContent = 'Running'
  try {
    const before = await load(), pixels = await raster()
    await openControls(); await click('Preview Chamfer'); await number(12); await settled()
    assert(document.querySelector('[aria-label="Spline Chamfer preview"]') && !applyButton()!.disabled, 'Actual worker preview cannot Apply')
    equal(current().editor.getScene(), before, 'Preview changed source/manual keys'); assert(!current().editor.canUndo, 'Preview wrote history')
    const preview = await raster(); assert(pixels.every((v, i) => v === preview[i]), 'Preview leaked into export')
    await click('Cancel Chamfer'); equal(current().editor.getScene(), before, 'Cancel changed source')
    assert(!current().editor.canUndo && !document.querySelector('[aria-label="Spline Chamfer preview"]'), 'Cancel kept history or overlay')
    checks.push('Actual worker previews two corners under animated/nonuniform parent; preview/Cancel preserve exact source, history and raster pixels')

    await openControls(); await click('Preview Chamfer'); await number(12); await settled(); await click('Apply Chamfer')
    const applied = structuredClone(current().editor.getScene()), data = layer().spline!
    assert(!layer().modifierStack, 'Native Chamfer created a modifier stack'); assertSplineTopology(data); assert(Object.keys(data.points).length === 6 && current().controller.ids.length === 4, 'Apply did not focus both cut pairs')
    equal(applied.timelines, before.timelines, 'Chamfer damaged manual keys'); equal(layer().style, before.layers[1].style, 'Chamfer changed paint')
    equal(parseSceneJson(JSON.stringify(applied), true), applied, 'Chamfer failed portable save/open')
    const afterPixels = await raster(); assert(pixels.some((v, i) => v !== afterPixels[i]), 'Applied Chamfer did not affect final rendering')
    flushSync(() => current().controller.exit()); await frames()
    const cv = canvas(), viewport = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data
    assert(viewport.length === afterPixels.length && viewport.every((v, i) => v === afterPixels[i]), 'Paused viewport/raster Chamfer pixels differ')
    await click('Undo'); equal(current().editor.getScene(), before, 'Chamfer is not one Undo'); assert(!current().editor.canUndo, 'Chamfer created multiple Undo steps')
    await click('Redo'); equal(current().editor.getScene(), applied, 'Redo changed IDs/geometry')
    checks.push('Apply focuses fresh cut points, preserves paint/manual animation and portable JSON; viewport equals raster; one Undo/Redo restores exact source')

    const curved = await load(true); await openControls(); await click('Preview Chamfer'); await number(10); await settled(); assert(!applyButton()!.disabled, 'Cubic–cubic preview refused')
    await click('Apply Chamfer'); assert(Object.values(layer().spline!.segments).filter(s => s.type === 'cubic').length === 4, 'Chamfer flattened original circle curves')
    equal(current().editor.getScene().timelines, curved.timelines, 'Curve Chamfer changed animation')
    checks.push('Adjacent cubic–cubic corners retain all four exact cubic source edges')

    const bandScene = fixture()
    // Delete an edge from this circle's own stable IDs, then compute its parallel.
    const circleSource = createCircleSpline({ radius: 90 }), open = deleteSplineEdges(circleSource, [Object.keys(circleSource.segments)[0]])
    const output = new PlanarOutlineBackend().compute({ inputs: [{ name: 'Arc', path: splineToPathDefinition(open), indices: [0], fillRule: open.fillRule }], distancePx: 20, side: 'right', join: 'miter', miterLimit: 4, tolerancePx: .25 })
    const generated = outlineToSpline(output, Matrix2D.identity(), open.fillRule), band = appendSplineObjects(open, generated).data
    bandScene.layers[1].spline = band
    flushSync(() => { current().editor.resetScene(bandScene); current().select('spline'); current().setTime(400); current().setTool('select') }); await frames()
    await click('Spline object mode')
    const arc = Object.values(open.contours)[0], offsetArc = Object.values(generated.contours)[0]
    await choose('Add spline object', 'line'); await tap(layer().spline!.points[arc.pointIds[0]]); await tap(layer().spline!.points[offsetArc.pointIds[0]])
    const joined = Object.values(layer().spline!.contours)[0]
    await choose('Add spline object', 'line'); await tap(layer().spline!.points[joined.pointIds[0]]); await tap(layer().spline!.points[joined.pointIds.at(-1)!])
    key('1'); await frames(); await tap(layer().spline!.points[arc.pointIds[0]]); await tap(layer().spline!.points[arc.pointIds.at(-1)!], { shiftKey: true })
    const bandBefore = structuredClone(current().editor.getScene())
    assert(Object.values(layer().spline!.contours)[0].closed && current().controller.ids.length === 2, 'Closed band corners could not be selected')
    await openControls(); await click('Preview Chamfer'); await number(5); await settled()
    assert(!applyButton()!.disabled, 'Cut-circle/Offset/Connect mixed cubic–line Chamfer refused: ' + document.querySelector('[role="alert"]')?.textContent)
    await click('Apply Chamfer'); assertSplineTopology(layer().spline!)
    assert(Object.values(layer().spline!.segments).filter(s => s.type === 'cubic').length === 3, 'Mixed Chamfer lost the three original cubic arcs')
    equal(current().editor.getScene().timelines, bandBefore.timelines, 'Band Chamfer changed manual animation')
    await click('Undo'); equal(current().editor.getScene(), bandBefore, 'Band Chamfer did not undo in one step')
    checks.push('Cut circle → Offset → two drawn vertex-snapped bridges → Chamfer supports mixed cubic–line corners and retains exact source curves')

    const invalid = await load(); await openControls(); await click('Preview Chamfer'); await number(100); await settled()
    assert(applyButton()!.disabled && document.querySelector('[role="alert"]')?.textContent?.includes('overlap'), 'Overlapping cuts stayed applicable')
    equal(current().editor.getScene(), invalid, 'Refused cuts changed source')
    await number(0); await settled(); assert(applyButton()!.disabled, 'Zero cut distance stayed applicable')
    await number(8); await settled(); assert(!applyButton()!.disabled, 'Corrected distance did not recover preview')
    await click('Cancel Chamfer'); assert(!current().editor.canUndo, 'Invalid settings created history')
    checks.push('Overlapping and zero cuts refuse visibly and atomically; correcting the distance recovers without losing source')

    await openControls(); await click('Preview Chamfer'); await number(9); flushSync(() => current().setTime(500)); await frames(30)
    assert(!applyButton() && !document.querySelector('[aria-label="Spline Chamfer preview"]'), 'Time change kept stale work')
    equal(current().editor.getScene(), invalid, 'Time cancellation changed source')
    await load(); await openControls(); await click('Preview Chamfer'); await number(8); await click('Spline edge mode'); await frames(30)
    assert(!document.querySelector('[aria-label="Spline Chamfer preview"]'), 'Mode change kept Chamfer overlay')
    const keyed = await load(false, true); await openControls()
    const blocked = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === 'Preview Chamfer')!
    assert(blocked.disabled && document.querySelector('[aria-label="Spline Chamfer"]')?.textContent?.match(/keyed|timeline/i), 'Coordinate-driven geometry was not blocked before preview')
    equal(current().editor.getScene(), keyed, 'Driver refusal changed manual source')
    checks.push('Time/mode changes invalidate and abort pending work; coordinate key ownership refuses without changing animations')

    await load(); await openControls(); await click('Preview Chamfer'); await number(18); await settled()
    status.textContent = `PASS · ${checks.length} groups`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
  finally { button.disabled = false }
}

document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button,#run{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}#host{max-width:1280px}pre{white-space:pre-wrap}</style><h1>Spline Chamfer acceptance</h1><p>Real worker, viewport/export parity, curved corners, driver protection and one Undo.</p><button id="run">Run Chamfer checks</button><p id="status">Ready</p><section id="host"></section><pre id="report">No checks run</pre>'
createRoot(document.getElementById('host')!).render(<Subject />)
document.getElementById('run')!.onclick = () => void run()
