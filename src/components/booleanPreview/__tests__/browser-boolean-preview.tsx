import { useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SceneCanvas from '@/components/SceneCanvas'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { useSplineEditSelection } from '@/components/splineEdit/useSplineEditSelection'
import { SplineEditInspector } from '@/components/splineEdit/SplineEditInspector'
import GeometryEditPanel from '@/components/editorGeometry/GeometryEditPanel'
import { SplineToolsPanel } from '@/components/splineEdit/SplineToolsPanel'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '@/lib/defaults'
import { createDonutSpline, createRectangleSpline, createPolylineSpline, mergeSplineData, translateSplineData } from '@/lib/spline'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { acquireRasterImage } from '@/lib/export/raster/RasterExportEngine'
import { BooleanWorkerClient, type BooleanExecutor } from '@/lib/geometry/boolean'
import { BooleanPreviewControls } from '../BooleanPreviewControls'
import { useBooleanPreview } from '../useBooleanPreview'

const executor = new BooleanWorkerClient({ createWorker: () => new Worker('./boolean-worker.js') })
/** Disposable private source with manually keyed, transformed shape inputs and
 * a compound spline whose donut retains two contours as one Object. */
function fixture() {
  const scene = emptyScene(), parent = { ...newRectLayer(), type: 'group' as const, id: 'parent' }, a = { ...newRectLayer(), id: 'a', name: 'Rectangle A', parentId: 'parent' }, b = { ...newRectLayer(), id: 'b', name: 'Rectangle B' }
  parent.transform = { ...parent.transform, x: 90, y: 60, anchorX: 0, anchorY: 0, rotationDeg: 12, scaleX: 1.1, scaleY: .9 }
  a.transform = { ...a.transform, x: 20, y: 20, anchorX: 0, anchorY: 0 }; a.size = { width: 180, height: 150 }
  b.transform = { ...b.transform, x: 210, y: 120, anchorX: 0, anchorY: 0 }; b.size = { width: 180, height: 150 }
  a.style = { fill: { type: 'solid', color: '#0ea5e9' } }; b.style = { fill: { type: 'solid', color: '#f59e0b' } }
  const compound = mergeSplineData(createDonutSpline({ outerRadius: 95, innerRadius: 45 }), translateSplineData(createRectangleSpline({ width: 90, height: 80 }), 65, 0))
  Object.values(compound.subShapes).forEach((sub, i) => { sub.name = i ? 'Spline rectangle' : 'Donut' })
  const spline = { ...newSplineLayerFromData(compound, { name: 'Compound', x: 300, y: 210 }), id: 'compound' }
  const open = { ...newSplineLayerFromData(createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 100 }], false), { name: 'Open stroke', x: 0, y: 0 }), id: 'open' }
  scene.layers = [parent, a, b, spline, open]; scene.composition = { ...scene.composition, width: 640, height: 420, durationMs: 1000, backgroundColor: '#172033' }
  scene.timelines = [{ id: 'main', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: 'layers.parent.transform.x', keyframes: [{ id: 'human-a', timeMs: 0, value: 90, easing: { type: 'linear' } }, { id: 'human-b', timeMs: 1000, value: 140, easing: { type: 'linear' } }] }] }]
  return scene
}
let live: { editor: ReturnType<typeof useEditorState>; preview: ReturnType<typeof useBooleanPreview>; select(ids: string[]): void; setTime(n: number): void; reset(): void; delayed(value: boolean): void; settle(): void }
function Subject() {
  const [initial] = useState(fixture), editor = useEditorState(initial), snap = useSnapSettings({ persist: false })
  const [ids, setIds] = useState(['a', 'b']), [time, setTime] = useState(0), [useDelay, delayed] = useState(false)
  const selectedIds = useMemo(() => new Set(ids), [ids]), selected = editor.scene.layers.find(l => l.id === ids[0]) ?? null
  const splineEdit = useSplineEditSelection(ids.length === 1 ? selected : null, editor.getDocumentSignal())
  const frame = useMemo(() => evaluateSceneFrame(editor.scene, time), [editor.scene, time])
  const deferred = useMemo(() => { let settle = () => {}; const backend: BooleanExecutor = { execute: () => new Promise(resolve => { settle = () => resolve({ path: { closed: false, commands: [] }, polygons: 0, holes: 0, inputVertices: 0, outputVertices: 0, tolerancePx: .25 }) }) }; return { backend, settle: () => settle() } }, [])
  const preview = useBooleanPreview({ scene: editor.scene, selectedIds, primary: ids[0] ?? null, splineEdit, timeMs: time, overrides: frame.overrides, documentSignal: editor.getDocumentSignal(), disabled: false, dispatch: editor.dispatchCommand, getScene: editor.getScene, isTransactionActive: editor.isTransactionActive, onApplied: id => { splineEdit.exit(); setIds([id]) }, executor: useDelay ? deferred.backend : executor })
  const reset = () => { editor.resetScene(fixture()); setIds(['a', 'b']); setTime(0); delayed(false) }
  useLayoutEffect(() => { live = { editor, preview, select: setIds, setTime, reset, delayed, settle: deferred.settle } })
  return <><nav className="flex gap-3 p-2"><button onClick={reset}>Reset private scene</button><button onClick={() => setIds(['a', 'b'])}>Select shapes</button><button onClick={() => setIds(['compound'])}>Select compound</button><button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button></nav>
    <div className="flex h-[650px] border border-gray-600"><SceneCanvas scene={editor.scene} editor={editor} assets={new Map()} snap={snap} selectedLayerId={ids[0] ?? null} selectedLayerIds={selectedIds}
      onSelectLayer={id => setIds(id ? [id] : [])} timeMs={time} overrides={frame.overrides} splineEdit={splineEdit} booleanPreview={preview.result} onEditOperation={preview.openOperation}
      onBooleanPreview={preview.targets.length >= 2 ? preview.open : undefined} toolMode="select" />
      <aside className="w-80 shrink-0 overflow-hidden bg-gray-900"><SplineToolsPanel contained booleanPreview={preview}>
        <GeometryEditPanel layer={ids.length === 1 ? selected : null} selectedPointId={splineEdit.mode === 'point' ? splineEdit.ids[0] ?? null : null}
          getScene={editor.getScene} getRevision={editor.getRevision} getDocumentSignal={editor.getDocumentSignal}
          isTransactionActive={editor.isTransactionActive} dispatchCommand={editor.dispatchCommand}
          onSelectLayer={id => setIds([id])} onClearPoint={splineEdit.clear}
          onLayerChange={next => { const previous = editor.getScene().layers.find(layer => layer.id === next.id); if (previous) editor.dispatchCommand(makeUpdateLayerCmd(next.id, next, previous)) }}
          splineSourceSettings={selected?.spline ? <SplineEditInspector layer={selected} controller={splineEdit} getScene={editor.getScene} dispatchCommand={editor.dispatchCommand} overrides={frame.overrides} /> : undefined} />
      </SplineToolsPanel></aside></div></>
}
/** Native controls and an actual dedicated Worker; all app state access stays
 * inside this checked-in fixture on a separate origin, never the user's scene. */
async function run() {
  const button = document.getElementById('run') as HTMLButtonElement, status = document.getElementById('status')!, report = document.getElementById('report')!, checks: string[] = []
  button.disabled = true; status.textContent = 'Running'
  const assert = (ok: unknown, text: string) => { if (!ok) throw new Error(text) }
  const frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame) }
  const until = async (test: () => unknown) => { const end = performance.now() + 10000; while (!test() && performance.now() < end) await frames(1); assert(test(), 'Timed out waiting for Boolean result') }
  const click = async (name: string) => { const element = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(el => el.getAttribute('aria-label') === name || el.textContent?.trim() === name); assert(element, `Missing ${name}`); flushSync(() => element!.click()); await frames() }
  const choose = async (label: string, value: string) => { const element = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!; assert(element, `Missing ${label}`); flushSync(() => { element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })) }); await frames(); await until(() => live.preview.result || live.preview.error) }
  const snapshot = () => JSON.stringify(live.editor.getCommittedHistory())
  const pixels = async () => { const output = await acquireRasterImage(live.editor.getScene(), new Map(), { format: 'png', timeMs: 0 }); try { return Array.from(new Uint8Array(await output.value.blob.arrayBuffer())).join(',') } finally { output.release() } }
  const manualEdit = () => { const layer = live.editor.getScene().layers.find(l => l.id === 'a')!; live.editor.dispatchCommand(makeUpdateLayerCmd('a', { transform: { ...layer.transform, x: layer.transform.x + 7 } }, layer)) }
  try {
    flushSync(() => live.reset()); await frames()
    flushSync(manualEdit); await frames(); await click('Undo')
    const before = snapshot(), beforePixels = await pixels(); assert(live.editor.canRedo, 'Redo baseline missing')
    await click('Preview Boolean'); await until(() => live.preview.result || live.preview.error)
    assert(!live.preview.error && live.preview.result?.polygons === 1, `Native worker union failed: ${live.preview.error}`)
    assert(document.querySelector('[aria-label="Boolean result preview"] path')?.getAttribute('d')?.includes('M'), 'Result overlay missing')
    checks.push('Actual Worker union and read-only viewport overlay under an animated transformed parent')
    await choose('Boolean operation', 'subtract'); assert(live.preview.result!.polygons > 0, 'A−B result missing')
    const ab = JSON.stringify(live.preview.result!.path); await choose('Boolean subtraction order', 'ba'); assert(JSON.stringify(live.preview.result!.path) !== ab, 'B−A did not reverse subtraction')
    await choose('Boolean operation', 'intersect'); assert(live.preview.result!.polygons === 1, 'Intersection failed')
    assert(snapshot() === before, 'Preview changed source, manual keys or history'); assert(await pixels() === beforePixels, 'Preview leaked into final raster output')
    checks.push('Subtract order/Intersect controls preserve exact source, Undo/Redo and exported PNG bytes')
    await click('Close preview'); assert(!document.querySelector('[aria-label="Boolean result preview"]'), 'Close retained overlay'); assert(live.editor.canRedo, 'Close cleared Redo')
    await click('Redo'); await click('Undo'); assert(snapshot() === before, 'Existing history was damaged')
    checks.push('Close preview leaves existing Undo/Redo operational')
    await click('Preview Boolean'); await until(() => live.preview.result); flushSync(() => live.setTime(500)); await frames(); assert(!live.preview.active && !live.preview.result, 'Scrub retained stale result')
    await click('Preview Boolean'); await until(() => live.preview.result); flushSync(manualEdit); await frames(); assert(!live.preview.result, 'Manual edit retained stale result'); await click('Undo')
    checks.push('Scrub and native source edits invalidate/cancel old preview without altering animation')
    await click('Select compound'); await click('Spline object mode'); await click('Select spline object Donut')
    const sub = document.querySelector<HTMLButtonElement>('[aria-label="Select spline object Spline rectangle"]')!; flushSync(() => sub.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))); await frames()
    await click('Preview Boolean'); await until(() => live.preview.result || live.preview.error)
    await choose('Boolean operation', 'union')
    assert(!live.preview.error && live.preview.targets.length === 2 && live.preview.result!.holes === 1, `SubShape hole lost: ${live.preview.error}`)
    checks.push('Object-mode selection treats a donut and its hole as one Boolean input')
    flushSync(() => live.select(['a', 'open'])); await frames(); await click('Preview Boolean'); await until(() => live.preview.error)
    assert(live.preview.error?.includes('closed'), 'Open input did not produce an explicit diagnostic'); assert(!live.preview.result, 'Invalid input retained old geometry')
    checks.push('Open spline refuses with inline diagnostic and no stale overlay')
    flushSync(() => { live.select(['a', 'b']); live.delayed(true) }); await frames(); await click('Preview Boolean'); assert(live.preview.pending, 'Delayed backend did not start')
    flushSync(manualEdit); await frames(); flushSync(() => live.settle()); await frames(); assert(!live.preview.result && !live.preview.active, 'Late cancelled result revived old preview')
    checks.push('A backend ignoring abort cannot publish a late result after a source edit')
    flushSync(() => live.reset()); await frames(); await click('Preview Boolean'); await until(() => live.preview.result)
    flushSync(() => live.editor.resetScene(fixture())); await frames(); assert(!live.preview.result && !live.preview.active, 'Document replacement retained old preview')
    checks.push('Document lifecycle releases preview; no source/session persistence')
    flushSync(() => live.reset()); await frames(); await click('Preview Boolean'); await until(() => live.preview.result)
    const staticSource = fixture()
    staticSource.layers.find(layer => layer.id === 'b')!.parentId = 'parent'
    staticSource.layers.find(layer => layer.id === 'b')!.transform.x = 100
    flushSync(() => { live.editor.resetScene(staticSource); live.select(['a', 'b']); live.setTime(0) }); await frames()
    const staticBefore = snapshot()
    await click('Preview Boolean'); await until(() => live.preview.result || live.preview.error)
    assert(live.preview.canApply, `Static inputs cannot Apply: ${live.preview.applyReason} / ${live.preview.error}`)
    await click('Cancel'); assert(snapshot() === staticBefore, 'Cancel mutated source/history')
    await click('Preview Boolean'); await until(() => live.preview.canApply); await click('Apply Boolean')
    const applied = live.editor.getScene(), owner = applied.layers.find(layer => layer.booleanOperation)!, resultId = owner.booleanOperation!.resultLayerId
    assert(owner && !live.preview.result, 'Apply did not create recipe/remove overlay')
    for (const source of staticSource.layers.filter(layer => layer.id === 'a' || layer.id === 'b')) assert(JSON.stringify(applied.layers.find(layer => layer.id === source.id)) === JSON.stringify({ ...source, parentId: owner.id }), 'Source input was consumed')
    assert(applied.timelines === staticSource.timelines, 'Apply modified manual parent animation')
    const viewportCanvas = document.querySelector<HTMLCanvasElement>('[data-testid="canvas-workspace"] canvas')!
    const raster = await acquireRasterImage(applied, new Map(), { format: 'png', timeMs: 0 })
    try {
      const bitmap = await createImageBitmap(raster.value.blob), comparison = document.createElement('canvas')
      comparison.width = bitmap.width; comparison.height = bitmap.height; const context = comparison.getContext('2d')!
      context.drawImage(bitmap, 0, 0); bitmap.close()
      const actual = viewportCanvas.getContext('2d')!.getImageData(0, 0, comparison.width, comparison.height).data
      const expected = context.getImageData(0, 0, comparison.width, comparison.height).data
      assert(actual.length === expected.length && actual.every((value, index) => value === expected[index]), 'Viewport and PNG pixels differ after Apply')
    } finally { raster.release() }
    checks.push('Actual viewport canvas and final PNG have identical RGBA pixels after Boolean Apply')
    const appliedPixels = await pixels()
    await click('Undo'); assert(JSON.stringify(live.editor.getScene().layers) === JSON.stringify(staticSource.layers), 'One Undo did not restore source')
    await click('Redo'); assert(await pixels() === appliedPixels, 'Redo changed render output')
    checks.push('Static transformed-parent Apply/Cancel: exact original sources/keys, single Undo/Redo and PNG equality')
    await click('Edit Operation'); await until(() => live.preview.canApply)
    await choose('Boolean operation', 'subtract'); await click('Apply Boolean')
    assert(live.editor.getScene().layers.find(layer => layer.id === owner.id)!.booleanOperation!.operation === 'subtract', 'Edit Operation did not update recipe')
    await click('Undo'); assert(live.editor.getScene().layers.find(layer => layer.id === owner.id)!.booleanOperation!.operation === 'union', 'Edit operation was not one Undo')
    assert(live.editor.getScene().layers.find(layer => layer.id === resultId)!.spline?.points && Object.keys(live.editor.getScene().layers.find(layer => layer.id === resultId)!.spline!.points).length === 0, 'Computed geometry leaked into source JSON')
    checks.push('Edit Operation changes only recipe, retains generated ID, and undoes atomically; source placeholder has no dense path')
    // Restore a visible read-only preview for human inspection of the real worker.
    await click('Edit Operation'); await until(() => live.preview.canApply)
    status.textContent = 'PASS'; report.textContent = JSON.stringify({ status: 'PASS', checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ status: 'FAIL', checks, error: String(error), stack: error instanceof Error ? error.stack : undefined }, null, 2) }
  finally { button.disabled = false }
}
document.body.style.cssText = 'margin:16px;background:#030712;color:#e5e7eb;font:14px system-ui'
document.getElementById('app')!.innerHTML = '<h1>Boolean preview acceptance</h1><button id="run">Run Boolean checks</button><p id="status">Ready</p><pre id="report" style="white-space:pre-wrap"></pre><div id="subject"></div>'
createRoot(document.getElementById('subject')!).render(<Subject />)
document.getElementById('run')!.onclick = run
