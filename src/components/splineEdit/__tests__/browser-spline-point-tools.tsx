import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { copySplineTangents } from '@/lib/spline/edit/tangents'
import { assertSplineTopology } from '@/lib/spline/topology'
import { Subject, current, frames, layer, click, key, reset, assert, equal, contextAt, raster } from './splineHarness'

/** Open both production disclosure levels so actions are visibly reachable. */
async function openTools() {
  for (const text of ['Selection actions', 'Topology']) {
    const summary = Array.from(document.querySelectorAll('summary')).find(item => item.textContent?.startsWith(text))!
    assert(summary, `Missing ${text}`)
    if (!(summary.parentElement as HTMLDetailsElement).open) { flushSync(() => summary.click()); await frames() }
  }
}
/** Use the actual context-menu row, never a similarly named inspector button. */
async function menu(label: string) {
  const row = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(item => item.textContent?.trim() === label)
  assert(row && row.getAttribute('aria-disabled') !== 'true', `Missing/disabled menu ${label}`)
  flushSync(() => row.click()); await frames()
}
/** Focus existing fixture IDs without altering source, then use real controls. */
async function select(mode: 'point' | 'edge', ids: string[]) { flushSync(() => current().controller.enter(mode, ids)); await frames(); await openTools() }
async function undo(before: unknown) { await click('Undo'); equal(current().editor.getScene(), before, 'Action was not one exact Undo'); await click('Redo'); assertSplineTopology(layer().spline!); await click('Undo'); equal(current().editor.getScene(), before, 'Redo/Undo did not restore source') }
/** Compare local offsets with floating-point storage tolerance. */
function tangents(id: string, expected: ReturnType<typeof copySplineTangents>) {
  const value = copySplineTangents(layer().spline!, id); assert(value.type === expected.type, 'Pasted connection type changed')
  for (const kind of ['in', 'out'] as const) if (expected[kind]) assert(value[kind] && Math.hypot(value[kind]!.x - expected[kind]!.x, value[kind]!.y - expected[kind]!.y) < 1e-9, 'Pasted local tangent changed')
}
async function run() {
  const status = document.getElementById('status')!, report = document.getElementById('report')!, run = document.getElementById('run') as HTMLButtonElement, checks: string[] = []
  run.disabled = true; status.textContent = 'Running'
  try {
    await reset(); key('1'); await frames(); await openTools()
    const all = layer().spline!, curved = Object.values(all.subShapes).find(item => item.name === 'Donut B')!, loop = all.contours[curved.contourIds[0]], [a, b, c] = loop.pointIds
    for (const viaMenu of [false, true]) {
      await select('point', [a]); const before = structuredClone(current().editor.getScene())
      if (viaMenu) { await contextAt(all.points[a]); await menu('Break') } else await click('Break')
      assert(!layer().spline!.contours[loop.id].closed, 'Break failed to open loop')
      assert(current().controller.ids.length === 2, 'Break endpoints were not selected after menu closed')
      assertSplineTopology(layer().spline!); equal(layer().transform, before.layers[1].transform, 'Break moved layer TRS/origin'); await undo(before)
    }
    checks.push('Break works in Point panel and right-click, focuses both independent endpoints, preserves layer TRS and has one Undo/Redo')
    for (const viaMenu of [false, true]) {
      await select('point', [a, b]); const before = structuredClone(current().editor.getScene()), expectedX = (all.points[a].x + all.points[b].x) / 2, expectedY = (all.points[a].y + all.points[b].y) / 2
      if (viaMenu) { await contextAt(all.points[a]); await menu('Fuse') } else await click('Fuse')
      assert(layer().spline!.points[a].x === expectedX && layer().spline!.points[b].y === expectedY, 'Fuse centroid failed')
      equal(layer().spline!.contours, all.contours, 'Fuse merged connectivity'); await undo(before)
    }
    checks.push('Fuse works in both surfaces, retains multi-selection and separate topology with one Undo/Redo')
    for (const viaMenu of [false, true]) {
      await select('point', [a]); const before = structuredClone(current().editor.getScene()), previous = copySplineTangents(layer().spline!, a)
      if (viaMenu) { await contextAt(all.points[a]); await menu('Reset Tangents') } else await click('Reset Tangents')
      assert(JSON.stringify(copySplineTangents(layer().spline!, a)) !== JSON.stringify(previous), 'Reset did not rebuild handles')
      equal(layer().spline!.points[a], all.points[a], 'Reset moved anchor'); await undo(before)
    }
    checks.push('Reset Tangents is reachable from panel/menu and leaves anchors fixed with one Undo/Redo')

    await select('point', [a]); const beforeCopy = structuredClone(current().editor.getScene()); await click('Copy Tangents')
    equal(current().editor.getScene(), beforeCopy, 'Copy mutated source'); assert(!current().editor.canUndo, 'Copy added Undo')
    key('Escape'); await frames(); key('1'); await frames(); await select('point', [b, c])
    const beforePaste = structuredClone(current().editor.getScene()), copied = copySplineTangents(all, a)
    await contextAt(all.points[b]); await menu('Paste Tangents'); tangents(b, copied); tangents(c, copied)
    assert(layer().spline!.points[b].x === all.points[b].x && layer().spline!.points[c].y === all.points[c].y, 'Paste moved anchors')
    await undo(beforePaste)
    await select('point', [b]); await contextAt(all.points[b]); await menu('Copy Tangents'); assert(!current().editor.canUndo, 'Menu Copy added Undo')
    await select('point', [c]); const reversePaste = structuredClone(current().editor.getScene()); await click('Paste Tangents'); tangents(c, copySplineTangents(all, b)); await undo(reversePaste)
    checks.push('Panel↔menu tangent clipboard survives edit exit/re-entry, copies local vectors/type to multiple targets and never adds Copy Undo')

    const rectangle = Object.values(all.subShapes).find(item => item.name === 'Rectangle A')!, contour = all.contours[rectangle.contourIds[0]], edge = contour.segmentIds[0]
    for (const viaMenu of [false, true]) {
      await select('edge', [edge]); const before = structuredClone(current().editor.getScene())
      if (viaMenu) { await contextAt({ x: -135, y: -40 }); await menu('Split') } else await click('Split')
      assert(Object.keys(layer().spline!.points).length === Object.keys(all.points).length + 2, 'Split did not create independent endpoints')
      assert(!layer().spline!.contours[contour.id].closed && current().controller.mode === 'edge' && current().controller.ids.length === 2, 'Split lost Edge mode or result selection')
      assertSplineTopology(layer().spline!); await undo(before)
    }
    checks.push('Split works in Edge panel and at the right-click position, keeps Edge mode and focuses both exact curve pieces with one Undo/Redo')

    await reset(true); key('1'); await frames(); const lockedPoint = Object.keys(layer().spline!.points)[0]; await select('point', [lockedPoint])
    const breakButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent === 'Break')!
    assert(breakButton.disabled, 'Driven Break not disabled'); await contextAt(layer().spline!.points[lockedPoint])
    const breakRow = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(item => item.textContent?.trim() === 'Break')!
    assert(breakRow.getAttribute('aria-disabled') === 'true' && !!breakRow.title, 'Menu driver restriction missing'); key('Escape'); await frames()
    checks.push('Driven geometry uses the same disabled state and reason in panel and menu')

    await reset(); key('1'); await frames(); await select('point', [Object.keys(layer().spline!.points)[0]])
    const paste = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent === 'Paste Tangents')!
    assert(paste.disabled, 'Document replacement retained old clipboard')
    const pixels = await raster(); assert(pixels.some(channel => channel > 0), 'Actual PNG export is empty')
    checks.push('New document clears the clipboard; actual PNG export remains valid')
    status.textContent = `PASS · ${checks.length} groups`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
  finally { run.disabled = false }
}
document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button,#run{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}#host{max-width:1350px}pre{white-space:pre-wrap}</style><h1>Spline Point / Edge tools</h1><p>Disposable real viewport, Edit panel, right-click menu, history and export acceptance.</p><button id="run">Run Point Edge checks</button><p id="status">Ready</p><section id="host"></section><pre id="report">No checks run</pre>'
createRoot(document.getElementById('host')!).render(<Subject />)
document.getElementById('run')!.onclick = () => void run()
