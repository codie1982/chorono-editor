import { useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { emptyScene, newRectLayer, newSplineLayerFromPrimitive } from '@/lib/defaults'
import { executeEditorJob, type MCPHost } from '../editor'
import { editorDocumentEpoch } from '../source/EditorSourceIdentity'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { acquireRasterImage } from '@/lib/export/raster/RasterExportEngine'
import type { ChronoScene } from '@/lib/types'
import type { SplineOperation } from '@/lib/editor/spline/operations/types'

/** Private React editor fixture. Native buttons invoke the production browser
 * MCP dispatcher, real CPU workers and PNG pipeline. Broker leases/retry scope
 * are tested separately by splineEditing.test's real broker/editor pump. This
 * fixture neither reads nor replaces a user's editor/session/localStorage. */
let editor: EditorStateReturn
const check = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const equal = (a: unknown, b: unknown, message: string) => check(JSON.stringify(a) === JSON.stringify(b), message)
const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
function fixture(boolean = false): ChronoScene {
  const source = emptyScene(), spline = newSplineLayerFromPrimitive('rectangle', { width: 150, height: 120 })!
  source.composition = { ...source.composition, width: 480, height: 320, durationMs: 1000, backgroundColor: '#f1f5f9' }
  spline.id = 'spline'; spline.transform.x = 240; spline.transform.y = 160
  source.layers = [spline]; source.timelines = [{ id: 'human', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: 'layers.spline.opacity', keyframes: [{ id: 'manual-key', timeMs: 0, value: .8, easing: { type: 'easeOut' } }] }] }]
  if (boolean) { const a = newRectLayer(), b = newRectLayer(); a.transform.x = 130; a.transform.y = 110; b.transform.x = 220; b.transform.y = 150; source.layers = [a, b]; source.timelines = [] }
  return source
}
/** Internal trusted envelope reproduces broker-to-editor identity checks; the
 * synthetic string token is not a broker capability and is never sent remotely. */
function job(method: string, args: Record<string, unknown> = {}, signal?: AbortSignal) {
  const revision = editor.getRevision(), frame = { overrides: {}, paramValues: {} }
  const host = { editor, assets: new Map(), selectedTimelineId: 'human', currentTimeMs: 0, getLiveFrame: () => frame, selectTimeline: () => {} } as unknown as MCPHost
  return executeEditorJob({ id: crypto.randomUUID(), method, args: { ...args, expectedRevision: revision, readToken: 'a'.repeat(64) },
    sourceAuthorization: { documentEpoch: editorDocumentEpoch(editor), expectedRevision: revision, authoring: { actor: { kind: 'agent' }, transactionId: crypto.randomUUID() } } }, host, signal)
}
async function pixels(blob: Blob) {
  const image = await createImageBitmap(blob), canvas = document.createElement('canvas')
  try { canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, canvas.width, canvas.height).data }
  finally { image.close(); canvas.width = canvas.height = 0 }
}
async function run() {
  const results: unknown[] = [], images: { name: string; url: string }[] = []
  for (const kind of ['offset', 'chamfer', 'fillet', 'boolean'] as const) {
    flushSync(() => editor.resetScene(fixture(kind === 'boolean'))); await frames()
    const before = editor.getScene(), data = before.layers[0].spline, pointIds = data ? Object.keys(data.points).slice(0, 2) : []
    const operation: SplineOperation = kind === 'boolean' ? { kind, targets: before.layers.map(l => ({ layerId: l.id })), settings: { operation: 'subtract', reverse: false, tolerancePx: .25 } }
      : kind === 'offset' ? { kind, selection: { mode: 'object', ids: Object.keys(data!.subShapes) }, settings: { distancePx: 12, side: 'inside', join: 'round', miterLimit: 4, tolerancePx: .25 } }
      : kind === 'chamfer' ? { kind, pointIds, distancePx: 12 } : { kind, pointIds, radiusPx: 12 }
    const revision = editor.getRevision(), prepared = await job('prepare_spline_edit', { layerId: kind === 'boolean' ? undefined : 'spline', operation, previewWidth: 480 })
    check(editor.getScene() === before && editor.getRevision() === revision && !editor.canUndo, 'Prepare changed source/history')
    check(prepared.mimeType === 'image/png' && prepared.data.length > 100, 'Actual PNG missing')
    const image = `data:image/png;base64,${prepared.data}`; images.push({ name: kind, url: image })
    await job('apply_scene', { scene: prepared.scene }); await frames()
    const after = editor.getScene(); equal(after.timelines, before.timelines, 'Human key changed')
    const output = await acquireRasterImage(after, new Map(), { format: 'png', timeMs: 0 })
    try {
      const a = await pixels(await (await fetch(image)).blob()), b = await pixels(output.value.blob)
      check(a.length === b.length && a.every((value, i) => value === b[i]), 'Draft PNG differs from final raster')
    } finally { output.release() }
    flushSync(() => editor.undo()); await frames(); equal(editor.getScene(), before, 'One Undo did not restore source'); check(!editor.canUndo, 'More than one Undo')
    flushSync(() => editor.redo()); await frames(); equal(editor.getScene(), after, 'Redo changed IDs/source')
    results.push({ kind, realWorker: true, prepareUnchanged: true, oneUndoRedo: true, humanKeysPreserved: true, previewFinalPixelsEqual: true })
  }
  flushSync(() => editor.resetScene(fixture())); await frames()
  const pointId = Object.keys(editor.getScene().layers[0].spline!.points)[0]
  const pending = job('prepare_spline_edit', { layerId: 'spline', operation: { kind: 'fillet', pointIds: [pointId], radiusPx: 12 }, previewWidth: 480 })
  const source = editor.getScene().layers[0]
  flushSync(() => editor.dispatchCommand(makeUpdateLayerCmd(source.id, { name: 'Human edit while preparing' }, source)))
  let refused = false; try { await pending } catch { refused = true }
  check(refused && editor.getScene().layers[0].name === 'Human edit while preparing', 'Async stale guard failed')
  results.push({ staleDuringWorkerPreserved: true })
  const abort = new AbortController(); abort.abort(); let cancelled = false
  try { await job('prepare_spline_edit', { layerId: 'spline', operation: { kind: 'fillet', pointIds: [pointId], radiusPx: 12 } }, abort.signal) } catch { cancelled = true }
  check(cancelled, 'Cancellation failed'); results.push({ cancelled: true })
  return { passed: true, results, images }
}
function App() {
  const current = useEditorState(fixture()), [report, setReport] = useState<any>({ state: 'ready' })
  useLayoutEffect(() => { editor = current }, [current])
  return <main style={{ fontFamily: 'system-ui', padding: 24, background: '#0f172a', color: '#e2e8f0', minHeight: '100vh' }}>
    <h1>Native MCP spline acceptance</h1><p>Private editor · real workers · source guards · draft PNG / final raster equality</p>
    <button onClick={async () => { setReport({ state: 'running' }); try { setReport(await run()) } catch (e) { setReport({ passed: false, error: String(e) }) } }}>Run native MCP checks</button>
    <p role="status">{report.passed ? 'Passed · 4 real workers · exact PNG/raster equality · safe Undo/Redo and cancellation' : report.error ?? report.state}</p>
    <details><summary>Acceptance details</summary><pre id="report">{JSON.stringify({ ...report, images: report.images?.map((i: any) => i.name) }, null, 2)}</pre></details>
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 480px)', gap: 20 }}>{report.images?.map((i: any) => <figure key={i.name} style={{ margin: 0 }}><figcaption>{i.name} · prepared PNG</figcaption><img src={i.url} width={480} height={320} /></figure>)}</section>
  </main>
}
createRoot(document.getElementById('app')!).render(<App />)
