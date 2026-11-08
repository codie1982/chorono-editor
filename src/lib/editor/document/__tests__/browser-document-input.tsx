import { StrictMode, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { SvgDocumentHandler as LegacySvgHandler } from 'legacy-svg-reference'
import { useImport, type UseImportReturn } from '@/app/hooks/useImport'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { ImportActivityBar } from '@/components/import/ImportActivityBar'
import { openDocumentFilePicker } from '@/components/import/DocumentFilePicker'
import { ManagedBudgetSection } from '@/components/resources/ManagedBudgetSection'
import { BoundedTextReader, type TextInputReader, type TextReadOptions } from '@/lib/resources/io'
import { ResourceBudget } from '@/lib/resources/budget'
import { BoundedJobQueue } from '@/lib/resources/jobs'
import { SceneDocumentLoader } from '../SceneDocumentLoader'
import { ImportManager } from '@/lib/import/ImportManager'
import { SvgDocumentHandler } from '@/lib/import/handlers/document/SvgDocumentHandler'
import { ChoronoSceneHandler } from '@/lib/import/handlers/document/ChoronoSceneHandler'
import { releaseImportSources } from '@/lib/import/resources/importSources'
import { assetSourcePool } from '@/lib/asset/sources'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'
import { withMediaFrame } from '@/lib/render/media/withMediaFrame'
import { _onToastEmit } from '@/lib/toast/toast'
import type { ChronoScene } from '@/lib/types'
import type { ImportResult } from '@/lib/import/types'

/** Explicit post-text-decode consumer gate; never labelled native parse still busy. */
function gate() { let release!: () => void; const promise = new Promise<void>(yes => { release = yes }); return { promise, release } }
interface Hold { entered: ReturnType<typeof gate>; finish: ReturnType<typeof gate> }
/** Hold real input/UTF-16 ownership while an otherwise non-abortable consumer settles. */
class GatedTextReader implements TextInputReader {
  hold: Hold | null = null
  constructor(private readonly reader: TextInputReader) {}
  withBytes<T>(bytes: Uint8Array, work: (text: string) => T | Promise<T>, options?: TextReadOptions): Promise<T> { return this.reader.withBytes(bytes, work, options) }
  withBlob<T>(blob: Blob, work: (text: string) => T | Promise<T>, options?: TextReadOptions): Promise<T> {
    const hold = this.hold; this.hold = null
    return this.reader.withBlob(blob, async text => {
      if (hold) { hold.entered.release(); await hold.finish.promise }
      return await work(text)
    }, options)
  }
}
interface Bridge { editor: EditorStateReturn; imports: UseImportReturn }
/** Real editor/import hooks and status/budget components, with private owners. */
function Harness({ manager, loader, budget, accept, pick }: { manager: ImportManager; loader: SceneDocumentLoader; budget: ResourceBudget; accept(bridge: Bridge): void; pick(): void }) {
  const editor = useEditorState(emptyScene())
  const imports = useImport({ dispatchCommand: editor.dispatchCommand, getDocumentSignal: editor.getDocumentSignal, manager, sceneLoader: loader })
  useLayoutEffect(() => { accept({ editor, imports }) })
  return <section>
    <ImportActivityBar activeCount={imports.activeCount} settlingCount={imports.settlingCount} label={imports.label} progress={imports.progress} onCancel={imports.cancel} />
    <p id="scene-counts">{editor.scene.composition.id}: {editor.scene.layers.length} layers · {editor.scene.timelines.length} timelines</p>
    <button id="pick" onClick={pick}>Choose Four Seasons project</button>
    <ManagedBudgetSection snapshot={budget.getSnapshot()} />
  </section>
}
/** Two presentation frames flush actual React subscriber updates, not a guessed native completion. */
async function tick(): Promise<void> { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame) }
/** Production renderer parity for the small two-rectangle SVG fixture; QA canvases
 * are evidence surfaces outside the private input ledger. No image tolerance. */
async function draw(result: ImportResult, parent: HTMLElement): Promise<Uint8ClampedArray> {
  const scene = emptyScene(); scene.layers = result.layers; scene.assets = result.assets
  scene.composition = { ...scene.composition, width: 64, height: 32 }
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32
  canvas.style.cssText = 'width:256px;height:128px;margin:8px;image-rendering:pixelated'
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  await withMediaFrame(scene, 0, context, {}, (assets, overrides) => canvasRenderer.render(context, scene, 0, null, assets, { overrides, renderMode: 'preview', background: 'transparent' }))
  const rgba = context.getImageData(0, 0, 64, 32).data
  const copy = document.createElement('img'); copy.alt = 'Legacy/current SVG native render'; copy.src = canvas.toDataURL(); copy.width = 256; copy.height = 128; parent.append(copy)
  canvas.width = canvas.height = 0
  return rgba
}

async function main() {
  const build = await (await fetch('document-input-sources.json')).json()
  document.body.innerHTML = `<style>body{font:14px system-ui;background:#111827;color:#e5e7eb;margin:24px;max-width:1100px}button{font:inherit;min-height:44px;border:1px solid #6b7280;border-radius:5px;background:#1f2937;color:white;padding:8px 16px;margin:4px;cursor:pointer}button:focus-visible{outline:2px solid #60a5fa}p{line-height:1.5}pre{white-space:pre-wrap}aside{padding:12px;border:1px solid #6b7280;display:flex;gap:16px;align-items:center}aside span{margin-left:8px}#harness{max-height:500px;overflow:auto;border:1px solid #374151;padding:12px}</style><h1>Bounded document input · native QA</h1><p id="status">Ready</p><button id="start">Run document checks</button><button id="continue" hidden>Continue inspection</button><div id="copies"></div><div id="harness"></div><pre id="summary"></pre><pre id="report" hidden></pre>`
  const start = document.querySelector('#start') as HTMLButtonElement, resume = document.querySelector('#continue') as HTMLButtonElement, status = document.querySelector('#status')!
  start.onclick = async () => {
    start.disabled = true
    const rows: { name: string; passed: boolean; details?: unknown }[] = [], snapshots: object[] = [], results: ImportResult[] = []
    const test = (name: string, passed: boolean, details?: unknown) => { rows.push({ name, passed, details }); if (!passed) throw new Error(name) }
    const budget = new ResourceBudget({ maxBytes: 512 * 1024 ** 2 }), queue = new BoundedJobQueue({ concurrency: 1, maxQueued: 8 })
    const reader = new BoundedTextReader({ budget }), gated = new GatedTextReader(reader), loader = new SceneDocumentLoader({ reader: gated, executor: queue })
    const manager = new ImportManager({ executor: queue }); manager.registerHandler(new SvgDocumentHandler(new BoundedTextReader({ budget, maxInputBytes: 16 * 1024 ** 2 }))); manager.registerHandler(new ChoronoSceneHandler(reader))
    const pause = async (label: string) => { status.textContent = label; resume.hidden = false; await tick(); await new Promise<void>(yes => { resume.onclick = () => { resume.hidden = true; yes() } }) }
    const makeHold = () => ({ entered: gate(), finish: gate() })
    const sceneFile = (name: string) => { const scene = emptyScene(); scene.composition.id = name; scene.layers = [newRectLayer()]; return new File([JSON.stringify(scene)], `${name}.json`, { type: 'application/json' }) }
    let bridge!: Bridge, hold: Hold | null = null, mounted = false
    const root = createRoot(document.querySelector('#harness')!), toasts: string[] = [], detach = _onToastEmit(value => toasts.push(value.message))
    let pickResolve: (() => void) | undefined
    const pickedState: { value: { name: string; bytes: number; layers: number; timelines: number; durationMs: number } | null } = { value: null }
    const pick = () => openDocumentFilePicker({ accept: '.json,application/json', getDocumentSignal: bridge.editor.getDocumentSignal, onFiles: files => {
      const file = files[0]
      void bridge.imports.openScene(file, scene => {
        pickedState.value = { name: file.name, bytes: file.size, layers: scene.layers.length, timelines: scene.timelines.length, durationMs: scene.composition.durationMs }
        bridge.editor.resetScene(scene)
      }).then(() => pickResolve?.())
    } })
    try {
      const unicode = new Blob([new Uint8Array([239,187,191,65,240,159,152,128,255])])
      const expected = await unicode.text()
      test('native Blob UTF-8 BOM/replacement semantics preserved by bounded reader', await reader.withBlob(unicode, text => text === expected))
      const raw = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><script>bad()</script><rect width="32" height="32" fill="red" onclick="bad()"/><rect x="32" width="32" height="32" fill="blue"/></svg>'
      const file = new File([raw], 'native.svg', { type: 'image/svg+xml' })
      const before = await new LegacySvgHandler().handle(file); results.push(before)
      const after = await manager.importFileAs(file, 'image/svg+xml'); results.push(after)
      const a = await draw(before, document.querySelector('#copies')!), b = await draw(after, document.querySelector('#copies')!)
      test('real DOM SVG conversion preserves exact production-renderer RGBA versus immutable legacy handler', a.length === b.length && a.every((value, i) => value === b[i]))
      const at = (x: number) => Array.from(b.slice((16 * 64 + x) * 4, (16 * 64 + x) * 4 + 4))
      test('parity fixture contains actual red/blue geometry rather than empty matching frames', at(8).join() === '255,0,0,255' && at(48).join() === '0,0,255,255')
      const sanitized = await (await fetch(after.assets[0].url!)).text()
      test('owned SVG source remains sanitized with unchanged security warnings', !sanitized.includes('<script') && !sanitized.includes('onclick') && after.warnings.length === before.warnings.length)
      results.forEach(releaseImportSources); await tick()
      test('SVG transient text/binary and creator sources drain after release', budget.getSnapshot().chargedBytes === 0 && assetSourcePool.getSnapshot().ownedUrls === 0)
      const fragment = sceneFile('merge'), merge = await manager.importFileAs(fragment, 'application/chorono+json'); results.push(merge)
      test('real scene merge transaction preserves editable layers', merge.commands[0].execute(emptyScene()).layers.length === 1 && budget.getSnapshot().chargedBytes === 0)
      const deniedBudget = new ResourceBudget({ maxBytes: fragment.size * 3 - 1 })
      const denied = await new SceneDocumentLoader({ reader: new BoundedTextReader({ budget: deniedBudget }) }).load(fragment).then(() => false, error => String(error).includes('text'))
      test('native file/text overlap refuses before JSON conversion and cleans original bytes', denied && deniedBudget.getSnapshot().chargedBytes === 0)
      const tiny = new BoundedTextReader({ maxInputBytes: 4 })
      test('native dishonest Blob size cannot bypass actual input byte cap', await tiny.withBlob(Object.defineProperty(new Blob(['12345']), 'size', { value: 1 }), () => false).catch(error => String(error).includes('byte limit')))
      flushSync(() => root.render(<StrictMode><Harness manager={manager} loader={loader} budget={budget} accept={value => { bridge = value }} pick={pick} /></StrictMode>)); mounted = true
      hold = makeHold(); gated.hold = hold
      const oldFile = sceneFile('old'), old = bridge.imports.openScene(oldFile, scene => bridge.editor.resetScene(scene)); await hold.entered.promise
      const current = bridge.imports.openScene(sceneFile('current'), scene => bridge.editor.resetScene(scene)); await tick()
      test('latest open cancels previous UI scope but retains actual input/text and queue capacity', bridge.imports.activeCount === 1 && bridge.imports.settlingCount === 1 && queue.getSnapshot().active === 1 && queue.getSnapshot().queued === 1 && budget.getSnapshot().chargedBytes === oldFile.size * 3)
      snapshots.push({ phase: 'post-text-decode consumer gate', budget: budget.getSnapshot(), queue: queue.getSnapshot() })
      await pause('INSPECT: cancelled old open retains input/text; newest project is queued')
      hold.finish.release(); hold = null
      test('only newest prepared project is adopted; no late old toast/error', await old === false && await current === true && bridge.editor.getScene().composition.id === 'current' && toasts.length === 0)
      hold = makeHold(); gated.hold = hold
      const stale = bridge.imports.openScene(sceneFile('stale'), scene => bridge.editor.resetScene(scene)); await hold.entered.promise
      flushSync(() => bridge.editor.resetScene(emptyScene())); hold.finish.release(); hold = null
      test('external project reset discards a late scene-open result', await stale === false && bridge.editor.getScene().composition.id !== 'stale')
      const beforeBad = bridge.editor.getScene()
      test('malformed project does not replace current document', await bridge.imports.openScene(new File(['{}'], 'bad.json'), scene => bridge.editor.resetScene(scene)) === false && bridge.editor.getScene() === beforeBad)
      hold = makeHold(); gated.hold = hold
      const cancel = bridge.imports.openScene(sceneFile('cancel'), scene => bridge.editor.resetScene(scene)); await hold.entered.promise; await tick()
      await pause('INSPECT: click Cancel imports, then Continue inspection; text consumer remains gated')
      test('real cancel button retains active text/input ownership through consumer settlement', bridge.imports.activeCount === 0 && bridge.imports.settlingCount === 1 && budget.getSnapshot().chargedBytes > 0 && queue.getSnapshot().active === 1)
      hold.finish.release(); hold = null
      test('cancelled open cannot replace scene and releases all transient bytes', await cancel === false && budget.getSnapshot().chargedBytes === 0)
      status.textContent = 'SELECT: Choose Four Seasons project using the real native picker'
      await new Promise<void>(yes => { pickResolve = yes })
      await tick()
      test('real native picker opens actual Four Seasons source with full original scene counts', !!pickedState.value && pickedState.value.layers === 4079 && pickedState.value.timelines === 2 && pickedState.value.durationMs === 48000, pickedState.value)
      test('full scene input/UTF-16 peak is admitted under same 512 MiB ledger then drained', !!pickedState.value && budget.getSnapshot().peakBytes >= pickedState.value.bytes * 3 && budget.getSnapshot().peakBytes < budget.getSnapshot().maxBytes && budget.getSnapshot().chargedBytes === 0)
      flushSync(() => bridge.editor.resetScene(emptyScene())); await tick()
      test('all actual outer work drains after opening and replacement', queue.getSnapshot().active === 0 && queue.getSnapshot().queued === 0)
      flushSync(() => root.unmount()); mounted = false; await tick()
      test('editor unmount leaves no original source ownership', assetSourcePool.getSnapshot().ownedUrls === 0 && assetSourcePool.getSnapshot().references === 0)
      status.textContent = 'COMPLETE'
    } catch (error) { status.textContent = `FAILED: ${String(error)}` }
    finally {
      hold?.finish.release(); if (mounted) root.unmount(); detach(); results.forEach(releaseImportSources); queue.dispose(); await tick()
      const report = { kind: 'bounded-document-native', status: status.textContent === 'COMPLETE' ? 'complete' : 'failed', rows, snapshots, picked: pickedState.value, build,
        final: { budget: budget.getSnapshot(), queue: queue.getSnapshot(), sources: assetSourcePool.getSnapshot() }, toasts, environment: { userAgent: navigator.userAgent } }
      document.querySelector('#report')!.textContent = JSON.stringify(report, null, 2)
      document.querySelector('#summary')!.textContent = JSON.stringify({ status: report.status, checks: rows.length, passed: rows.filter(row => row.passed).length, picked: pickedState.value, final: report.final }, null, 2)
    }
  }
}
void main()
