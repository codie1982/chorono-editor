import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createRectangleSpline } from '@/lib/spline'
import { prepareAddModifier } from '@/lib/editor/modifiers/commands'
import { Subject, fixture, current, layer, key, tap, frames, click, contextAt, assert, equal } from './splineHarness'

/** Main-panel admission (including inactive Edit) over disposable source only.
 * Checks the shared menu/forms and explicit legacy bake; no connected document. */
async function run() {
  const status = document.getElementById('status')!, report = document.getElementById('report')!, checks: string[] = []
  const runButton = document.getElementById('run') as HTMLButtonElement; runButton.disabled = true; status.textContent = 'Running'
  try {
    await frames(5); const initial = structuredClone(current().editor.getScene())
    key('1'); await frames()
    const panel = document.querySelector('[data-panel="geometry-edit"]')!
    assert(panel.textContent!.indexOf('Selection properties') < panel.textContent!.indexOf('Point geometry tools'), 'Tools precede selection properties')
    assert(!panel.querySelector('[aria-label="Add Spline modifiers"]'), 'Spline Edit still advertises native tools as modifiers')
    assert(document.querySelector<HTMLDetailsElement>('[aria-label="Source / History"]')?.open === false, 'Source history is not closed')
    const preview = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === 'Preview Chamfer')!
    assert(preview.disabled, 'No selection implicitly targets all corners')
    equal(current().editor.getScene(), initial, 'Opening tools changed source')
    checks.push('Strict Edit entry, selection properties first, no spline modifier chooser, closed source history and no-selection disabled tools')
    const point = Object.values(layer().spline!.points)[0]
    await contextAt(point)
    const menu = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    assert(menu.some(item => item.textContent === 'Chamfer') && menu.some(item => item.textContent === 'Fillet'), 'Point right-click does not share its native tool catalog')
    assert(!menu.some(item => item.textContent === 'Offset Path'), 'Point menu contains contour Offset')
    key('Escape'); await frames(); await tap(point)
    await click('Preview Chamfer'); await frames(10)
    await click('Cancel Chamfer'); await frames(8)
    equal(current().editor.getScene(), initial, 'Menu/preview/cancel wrote source or a modifier')
    checks.push('Point menu and forms share Chamfer/Fillet admission; Cancel preserves source, animation and history')
    key('3'); await frames()
    assert(panel.querySelector('[aria-label="object geometry tools"]') && !panel.querySelector('[aria-label="point geometry tools"]'), 'Mode handover retained Point-only tools')
    assert(panel.querySelector('[aria-label="Spline Offset Path"]'), 'Object mode lacks native Offset Path')
    checks.push('Object mode exposes Offset Path and its own controls without Point-only tools')
    const source = fixture(); source.layers[1].spline = createRectangleSpline({ width: 140, height: 100 })
    const pointId = Object.keys(source.layers[1].spline!.points)[0]
    const legacy = prepareAddModifier(source, 'spline', 'chamfer', { pointIds: [pointId] }).command.execute(source)
    assert(legacy.layers[1].modifierStack?.modifiers.some(record => record.enabled), 'Legacy fixture did not create an enabled saved stack')
    flushSync(() => { current().editor.resetScene(legacy); current().select('spline') }); await frames(); key('1'); await frames()
    assert(document.querySelector<HTMLDetailsElement>('[aria-label="Source / History"]')?.open === false, 'Legacy source auto-opened or auto-baked')
    equal(current().editor.getScene(), legacy, 'Loading legacy stack rewrote its source')
    await click('Apply to editable spline'); await frames(10)
    assert(!layer().modifierStack && current().controller.active && current().controller.mode === 'object', 'Explicit bake failed to focus editable Object mode')
    equal(layer().transform, legacy.layers[1].transform, 'Bake changed TRS/pivot')
    await click('Undo'); equal(current().editor.getScene(), legacy, 'Bake Undo did not restore the complete legacy stack')
    checks.push('Legacy stack remains unchanged on load; explicit native bake focuses Object Edit and Undo restores exact source/stack/TRS')
    status.textContent = `PASS · ${checks.length} groups`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
  finally { runButton.disabled = false }
}
document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button,#run{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}#host{max-width:1280px}pre{white-space:pre-wrap}</style><h1>Native spline Edit tools</h1><p>Mode-owned tools, shared context menu, source replacement and legacy history.</p><button id="run">Run native tool checks</button><p id="status">Ready</p><section id="host"></section><pre id="report">No checks run</pre>'
createRoot(document.getElementById('host')!).render(<Subject strictPanel />)
document.getElementById('run')!.onclick = () => void run()
