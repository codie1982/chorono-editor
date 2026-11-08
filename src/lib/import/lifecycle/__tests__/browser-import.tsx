import { StrictMode, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useImport, type UseImportReturn } from '@/app/hooks/useImport'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { ImportActivityBar } from '@/components/import/ImportActivityBar'
import { MediaResourcesSection } from '@/components/resources/MediaResourcesSection'
import { ProjectResourceMonitor } from '@/lib/resources/monitor/ProjectResourceMonitor'
import { ImageHandler } from '../../handlers/asset/ImageHandler'
import { ImportManager } from '../../ImportManager'
import { emptyScene } from '@/lib/defaults'
import { BoundedJobQueue } from '@/lib/resources/jobs'
import { BoundedBinaryReader } from '@/lib/resources/io'
import { ResourceBudget } from '@/lib/resources/budget'
import { assetSourcePool } from '@/lib/asset/sources'
import { _onToastEmit } from '@/lib/toast/toast'
import type { ImportOptions, ImportResult, ImportProgress, ImportPreflight } from '../../types'

/** Gate AFTER real native PNG conversion, not a simulated native-busy claim. */
function gate() { let release!: () => void; const promise = new Promise<void>(yes => { release = yes }); return { promise, release } }
interface Hold { entered: ReturnType<typeof gate>; finish: ReturnType<typeof gate> }
/** Native adapter with controlled delivery for late-result/ownership testing. */
class GatedImage extends ImageHandler {
  calls = 0
  hold: Hold | null = null
  previewHold: Hold | null = null
  sources: string[] = []
  async handle(file: File, options?: ImportOptions, progress?: (value: ImportProgress) => void): Promise<ImportResult> {
    this.calls++
    const hold = this.hold; this.hold = null
    const result = await super.handle(file, options, progress)
    this.sources.push(result.assets[0].url!)
    if (hold) { hold.entered.release(); await hold.finish.promise; progress?.({ stage: 'reading', label: 'Obsolete progress', progress: 0.1 }) }
    return result
  }
  async preflight(file: File): Promise<ImportPreflight> {
    const hold = this.previewHold; this.previewHold = null
    const result = await super.preflight(file)
    if (hold) { hold.entered.release(); await hold.finish.promise }
    return result
  }
}
interface Bridge { editor: EditorStateReturn; imports: UseImportReturn }
/** Use the real hook/StrictMode/source owner and resource UI, no duplicate commit implementation. */
function Harness({ manager, budget, queue, accept }: { manager: ImportManager; budget: ResourceBudget; queue: BoundedJobQueue; accept(value: Bridge): void }) {
  const editor = useEditorState(emptyScene())
  const imports = useImport({ dispatchCommand: editor.dispatchCommand, getDocumentSignal: editor.getDocumentSignal, manager })
  const [query, setQuery] = useState({ page: 0, search: '' })
  useLayoutEffect(() => { accept({ editor, imports }) })
  const monitor = new ProjectResourceMonitor({ scene: editor.scene, media: new Map(), isPlaying: false }, { importPreparation: queue, budget })
  return <section>
    <ImportActivityBar activeCount={imports.activeCount} settlingCount={imports.settlingCount} label={imports.label} progress={imports.progress} onCancel={imports.cancel} />
    <p id="document-counts">Current document: {editor.scene.layers.length} layers · {editor.scene.assets.length} assets</p>
    {editor.scene.assets.map(asset => <img key={asset.id} src={asset.url} alt="Adopted PNG source" width={96} height={96} style={{ imageRendering: 'pixelated' }} />)}
    <MediaResourcesSection snapshot={monitor.getSnapshot()} query={query} onQuery={setQuery} />
  </section>
}

/** Wait for browser/React presentation, without changing application state. */
async function tick(): Promise<void> { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame) }
/** Native source must become unreachable after last owned lease, not just disappear from JSON. */
async function revoked(url: string): Promise<boolean> { try { await fetch(url); return false } catch { return true } }

async function main() {
  const build = await (await fetch('import-lifecycle-sources.json')).json()
  document.body.innerHTML = `<style>body{font:14px system-ui;background:#111827;color:#e5e7eb;margin:24px;max-width:1050px}button{font:inherit;min-height:44px;border:1px solid #6b7280;border-radius:5px;background:#1f2937;color:#fff;padding:8px 16px;cursor:pointer}button:focus-visible{outline:2px solid #60a5fa}h3{margin-top:28px}p{line-height:1.6;color:#d1d5db}dl>div{display:flex;justify-content:space-between;border-bottom:1px solid #374151;padding:6px}dd{margin:0}aside{border:1px solid #4b5563;border-radius:6px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:16px}aside span{margin-left:8px}pre{white-space:pre-wrap}input{background:#1f2937;color:white}#harness{max-height:610px;overflow:auto;padding:12px;border:1px solid #374151}</style><h1>Import document lifetime · native QA</h1><p id="status">Ready</p><button id="start">Run native checks</button> <button id="continue" hidden>Continue inspection</button><div id="harness"></div><pre id="summary"></pre><pre id="report" hidden></pre>`
  const start = document.querySelector('#start') as HTMLButtonElement, resume = document.querySelector('#continue') as HTMLButtonElement
  const status = document.querySelector('#status')!, summary = document.querySelector('#summary')!
  start.onclick = async () => {
    start.disabled = true
    const rows: { name: string; passed: boolean; details?: unknown }[] = [], snapshots: object[] = []
    const test = (name: string, passed: boolean, details?: unknown) => { rows.push({ name, passed, details }); if (!passed) throw new Error(name) }
    const budget = new ResourceBudget({ maxBytes: 512 * 1024 ** 2 }), queue = new BoundedJobQueue({ concurrency: 1, maxQueued: 8 })
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8
    const context = canvas.getContext('2d')!; context.fillStyle = '#ff0000'; context.fillRect(0, 0, 8, 8)
    context.fillStyle = '#0000ff'; context.fillRect(4, 0, 4, 8)
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'))
    canvas.width = canvas.height = 0
    const manager = new ImportManager({ executor: queue, inputReader: new BoundedBinaryReader({ budget }), fetch: async () => new Response(blob, { headers: { 'content-type': 'image/png' } }) })
    const handler = new GatedImage(); manager.registerHandler(handler)
    const root = createRoot(document.querySelector('#harness')!)
    let bridge!: Bridge, mounted = true
    const toasts: string[] = [], detach = _onToastEmit(value => toasts.push(`${value.kind}: ${value.message}`))
    const pause = async (label: string) => {
      status.textContent = label; resume.hidden = false; await tick()
      await new Promise<void>(resolve => { resume.onclick = () => { resume.hidden = true; resolve() } })
    }
    const makeHold = () => ({ entered: gate(), finish: gate() })
    let hold: Hold | null = null
    try {
      flushSync(() => root.render(<StrictMode><Harness manager={manager} budget={budget} queue={queue} accept={value => { bridge = value }} /></StrictMode>))
      const oldIdentity = bridge.editor.getDocumentSignal()
      hold = makeHold(); handler.hold = hold
      const old = bridge.imports.importUrl('http://localhost/old.png'); await hold.entered.promise
      const oldSource = handler.sources[0]
      flushSync(() => bridge.editor.resetScene(emptyScene()))
      test('same-name document reset changes identity and aborts previous scope synchronously', oldIdentity.aborted && bridge.editor.getDocumentSignal() !== oldIdentity)
      const current = bridge.imports.importFile(new File([blob], 'current.png', { type: 'image/png' })); await tick()
      test('new document waits for actual old producer settlement; no stale layer is committed', queue.getSnapshot().active === 1 && queue.getSnapshot().queued === 1 && bridge.editor.getScene().layers.length === 0)
      test('UI shows new progress plus cancelled settlement without stale progress', bridge.imports.activeCount === 1 && bridge.imports.settlingCount === 1 && bridge.imports.label === 'current.png')
      const inspection = { budget: budget.getSnapshot(), queue: queue.getSnapshot(), ui: { active: bridge.imports.activeCount, settling: bridge.imports.settlingCount }, stage: 'post-native-delivery-gate' }; snapshots.push(inspection)
      test('cancelled URL encoded input and File-copy charge stay owned through real settlement', budget.getSnapshot().chargedBytes === blob.size * 2 && (await fetch(oldSource)).ok)
      await pause('INSPECT: old document cancelled; current import queued; native PNG conversion already finished')
      hold.finish.release(); hold = null
      const [oldResult, newResult] = await Promise.all([old, current]); await tick()
      test('only new document result is adopted and reported', oldResult === null && !!newResult && bridge.editor.getScene().assets[0]?.name === 'current.png' && toasts.length === 1 && toasts[0].includes('current.png'))
      test('late old source is revoked; current adopted source remains usable', await revoked(oldSource) && (await fetch(bridge.editor.getScene().assets[0].url!)).ok)
      const identity = bridge.editor.getDocumentSignal(), adoptedSource = bridge.editor.getScene().assets[0].url!
      flushSync(() => bridge.editor.undo()); test('undo preserves document identity and history retains original source', bridge.editor.getDocumentSignal() === identity && bridge.editor.getScene().layers.length === 0 && (await fetch(adoptedSource)).ok)
      flushSync(() => bridge.editor.redo()); test('redo restores editable layer without a new import', bridge.editor.getScene().layers.length === 1 && handler.calls === 2)
      const bitmap = await createImageBitmap(newResult!.assets.length ? blob : new Blob())
      try { test('native PNG dimensions remain exact through real handler', bitmap.width === newResult!.assets[0].width && bitmap.height === newResult!.assets[0].height && bitmap.width === 8) } finally { bitmap.close() }
      flushSync(() => bridge.editor.resetScene(emptyScene())); await tick()
      test('project replacement drops history source ownership', await revoked(adoptedSource))

      hold = makeHold(); handler.hold = hold
      const calls = handler.calls, batch = bridge.imports.importFiles([1, 2, 3].map(i => new File([blob], `batch-${i}.png`, { type: 'image/png' })))
      await hold.entered.promise; flushSync(() => bridge.editor.resetScene(emptyScene())); hold.finish.release(); hold = null
      test('one multi-file scope stops remaining files after document change', (await batch).length === 0 && handler.calls === calls + 1 && bridge.editor.getScene().layers.length === 0)
      hold = makeHold(); handler.previewHold = hold
      const preview = bridge.imports.preview(new File([blob], 'preview.png', { type: 'image/png' }))
      await hold.entered.promise; flushSync(() => bridge.editor.resetScene(emptyScene())); hold.finish.release(); hold = null
      test('late preflight cannot publish a modal result into a replacement document', await preview === null)

      const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
      const clipboardEntered = gate(), delivery = Promise.withResolvers<ClipboardItem[]>()
      const beforeClipboard = handler.calls
      try {
        // Controlled permission/read delivery; no real clipboard permission is requested.
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: () => { clipboardEntered.release(); return delivery.promise } } })
        const clipboard = bridge.imports.importFromClipboard(); await clipboardEntered.promise
        flushSync(() => bridge.editor.resetScene(emptyScene()))
        delivery.resolve([new ClipboardItem({ 'image/png': blob })])
        test('late clipboard permission/read delivery starts no import in a replacement document', await clipboard === null && handler.calls === beforeClipboard)
      } finally {
        if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
        else Reflect.deleteProperty(navigator, 'clipboard')
      }

      hold = makeHold(); handler.hold = hold
      const cancelled = bridge.imports.importUrl('http://localhost/user-cancel.png'); await hold.entered.promise; await tick()
      await pause('INSPECT: click Cancel imports, then Continue inspection; producer remains gated')
      test('real Cancel imports button cancels UI scope without freeing actual active slot', bridge.imports.activeCount === 0 && bridge.imports.settlingCount === 1 && queue.getSnapshot().active === 1)
      hold.finish.release(); hold = null
      test('user-cancelled result is discarded without success/error toast', await cancelled === null && bridge.editor.getScene().layers.length === 0 && toasts.length === 1)
      await tick()
      test('actual settlement drains jobs and explicit input charges', queue.getSnapshot().active === 0 && queue.getSnapshot().queued === 0 && budget.getSnapshot().chargedBytes === 0)
      flushSync(() => root.unmount()); mounted = false; await tick()
      test('unmount releases remaining original sources', assetSourcePool.getSnapshot().ownedUrls === 0)
      status.textContent = 'COMPLETE'
    } catch (error) { status.textContent = `FAILED: ${String(error)}` }
    finally {
      hold?.finish.release(); detach(); if (mounted) root.unmount(); queue.dispose(); await tick()
      const report = { kind: 'import-document-lifetime-native', build, status: rows.every(row => row.passed) && status.textContent === 'COMPLETE' ? 'complete' : 'failed', rows, snapshots,
        final: { budget: budget.getSnapshot(), queue: queue.getSnapshot(), sources: assetSourcePool.getSnapshot() }, toasts, environment: { userAgent: navigator.userAgent } }
      document.querySelector('#report')!.textContent = JSON.stringify(report, null, 2)
      summary.textContent = JSON.stringify({ status: report.status, checks: rows.length, passed: rows.filter(row => row.passed).length, final: report.final }, null, 2)
    }
  }
}
void main()
