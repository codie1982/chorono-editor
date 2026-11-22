import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createCircleSpline, createDonutSpline } from '@/lib/spline'
import { assertSplineTopology, deleteSplineEdges } from '@/lib/spline/topology'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { Subject, fixture, current, frames, layer, tap, click, key, choose, assert, equal, raster } from './splineHarness'

/** Disposable source: a cut circle with a keyed affine parent. No real editor
 * storage/session is read or written by this native acceptance bundle. */
async function load(open = true) {
  const scene = fixture(), circle = createCircleSpline({ radius: 90 })
  scene.layers[1].spline = open ? deleteSplineEdges(circle, [Object.keys(circle.segments)[0]]) : createDonutSpline({ outerRadius: 100, innerRadius: 35 })
  flushSync(() => { current().editor.resetScene(scene); current().select('spline'); current().setTime(400); current().setTool('select') }); await frames()
  await click('Spline object mode'); const id = Object.keys(layer().spline!.subShapes)[0]
  const name = layer().spline!.subShapes[id].name; await click(`Select spline object ${name}`)
  return structuredClone(current().editor.getScene())
}
/** Open the real progressive-disclosure controls before interacting with them. */
async function openControls() {
  const details = document.querySelector<HTMLDetailsElement>('[aria-label="Spline Offset and Outline"]')!
  assert(details, 'Offset controls are missing')
  if (!details.open) { flushSync(() => details.querySelector('summary')!.click()); await frames() }
}
/** Native controlled numeric input; edits preview settings, never source. */
async function number(label: string, value: number) {
  const field = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
  flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, String(value)); field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })) }); await frames()
}
/** Wait for the real worker/React UI to settle, bounded by rendering frames. */
async function settled() {
  for (let i = 0; i < 600; i++) {
    await frames(1)
    const controls = document.querySelector('[aria-label="Spline Offset and Outline"]')!
    if (!controls.textContent?.includes('Calculating Offset')) return
  }
  throw new Error('Offset worker did not settle before acceptance deadline')
}
function applyButton() { return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Apply Offset')! }

async function run() {
  const status = document.getElementById('status')!, report = document.getElementById('report')!, checks: string[] = []
  const button = document.getElementById('run') as HTMLButtonElement; button.disabled = true; status.textContent = 'Running'
  try {
    const before = await load(), original = layer().spline!, pixels = await raster()
    await openControls(); await click('Preview Offset'); await number('Offset distance', 20); await choose('Offset direction', 'right'); await settled()
    assert(document.querySelector('[aria-label="Spline Offset preview"]'), 'Offset world overlay is missing')
    assert(!applyButton().disabled, 'Valid cut-circle offset cannot Apply')
    equal(current().editor.getScene(), before, 'Preview changed source or manual animation')
    assert(!current().editor.canUndo, 'Preview wrote history')
    const previewPixels = await raster(); assert(pixels.every((v, i) => v === previewPixels[i]), 'Preview overlay leaked into raster export')
    await click('Cancel Offset'); await frames(10)
    equal(current().editor.getScene(), before, 'Cancel changed source'); assert(!current().editor.canUndo && !document.querySelector('[aria-label="Spline Offset preview"]'), 'Cancel kept history or overlay')
    checks.push('Actual worker preview follows the cut circle under an animated/nonuniform parent; Cancel preserves exact source/history and exported pixels')

    await openControls(); await click('Preview Offset'); await choose('Offset direction', 'right'); await settled(); await click('Apply Offset')
    const applied = structuredClone(current().editor.getScene()), data = layer().spline!
    assertSplineTopology(data)
    assert(Object.keys(data.subShapes).length === 2 && current().controller.ids.length === 1, 'Apply did not append/focus one new Object')
    const newObject = data.subShapes[current().controller.ids[0]]; assert(!original.subShapes[newObject.id], 'Offset reused source Object identity')
    for (const family of ['points', 'handles', 'segments', 'contours', 'subShapes'] as const) for (const id of Object.keys(original[family])) equal(data[family][id], original[family][id], 'Offset rewrote source ' + family)
    equal(applied.timelines, before.timelines, 'Offset changed manual keys'); equal(layer().style, before.layers[1].style, 'Offset replaced shared paint')
    equal(parseSceneJson(JSON.stringify(applied), true), applied, 'Offset source failed portable save/load validation')
    await click('Undo'); equal(current().editor.getScene(), before, 'Offset was not one Undo'); assert(!current().editor.canUndo, 'Offset created multiple undo steps')
    await click('Redo'); equal(current().editor.getScene(), applied, 'Offset Redo changed generated IDs/geometry')
    checks.push('Apply appends editable fresh IDs, retains original curves/paint/manual keys and round-trips portable JSON with one Undo/Redo')

    const sourceContour = Object.values(original.contours)[0], generated = Object.values(layer().spline!.contours).find(c => !original.contours[c.id])!
    await choose('Add spline object', 'line'); await tap(layer().spline!.points[sourceContour.pointIds[0]]); await tap(layer().spline!.points[generated.pointIds[0]])
    const remaining = Object.values(layer().spline!.contours)[0]
    await choose('Add spline object', 'line'); await tap(layer().spline!.points[remaining.pointIds[0]]); await tap(layer().spline!.points[remaining.pointIds.at(-1)!])
    assertSplineTopology(layer().spline!)
    assert(Object.keys(layer().spline!.subShapes).length === 1 && Object.values(layer().spline!.contours)[0].closed, 'Generated arc endpoints could not form one closed band')
    equal(current().editor.getScene().timelines, before.timelines, 'Joining generated offset damaged animation')
    checks.push('Cut circle → real parallel arc → two vertex-snapped drawn connections produces one closed editable filled contour')

    const closed = await load(false); await openControls(); await click('Preview Offset'); await number('Offset distance', 10); await choose('Offset join', 'round'); await settled()
    assert(!applyButton().disabled && document.querySelector('[aria-label="Spline Offset preview"]'), 'Closed hole Offset/round preview failed')
    await number('Offset distance', 0); await settled(); assert(applyButton().disabled && document.querySelector('[role="alert"]'), 'Invalid distance remained applicable')
    await click('Cancel Offset'); equal(current().editor.getScene(), closed, 'Invalid preview changed closed source')
    checks.push('Closed Inside/Outside hole context and Round join preview work; invalid distance disables Apply with a visible diagnostic')

    await openControls(); await click('Preview Offset'); await number('Offset distance', 20); flushSync(() => current().setTime(500)); await frames(15)
    assert(!document.querySelector('[aria-label="Spline Offset preview"]') && !applyButton(), 'Time change left a stale preview applicable')
    equal(current().editor.getScene(), closed, 'Time cancellation modified source')
    await load(); await click('Spline edge mode'); const edge = Object.keys(layer().spline!.segments)[0]
    flushSync(() => current().controller.enter('edge', [edge])); await frames(); await openControls(); await click('Preview Offset'); await number('Offset distance', 20); await settled()
    assert(!applyButton().disabled && document.querySelector('[aria-label="Spline Offset and Outline"]')?.textContent?.includes('complete contour'), 'Edge selection did not disclose/promote the complete contour')
    await click('Cancel Offset'); assert(!current().editor.canUndo, 'Edge preview/cancel created history')
    checks.push('Time change aborts/hides pending work; Edge mode previews the full owning contour without source/history writes')
    await load(); await openControls(); await click('Preview Offset'); await number('Offset distance', 20); await choose('Offset direction', 'right'); await settled()
    status.textContent = `PASS · ${checks.length} groups`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
  finally { button.disabled = false }
}

document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button,#run{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}#host{max-width:1280px}pre{white-space:pre-wrap}</style><h1>Spline Offset / Outline acceptance</h1><p>Real CPU worker, viewport, source preservation, raster, history and endpoint connections.</p><button id="run">Run Outline checks</button><p id="status">Ready</p><section id="host"></section><pre id="report">No checks run</pre>'
createRoot(document.getElementById('host')!).render(<Subject />)
document.getElementById('run')!.onclick = () => void run()
