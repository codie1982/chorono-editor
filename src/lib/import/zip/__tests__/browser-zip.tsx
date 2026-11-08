import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ZipReader } from '../ZipReader'
import { buildZip } from './zipFixtures'
import { ResourceBudget, type ResourceBudgetSnapshot } from '@/lib/resources/budget'
import { BoundedBinaryReader } from '@/lib/resources/io'
import { ImportManager } from '@/lib/import/ImportManager'
import { LottieDocumentHandler } from '@/lib/import/handlers/document/LottieDocumentHandler'
import { LottieMetadataReader } from '@/lib/import/handlers/document/lottie/LottieMetadataReader'
import { releaseImportSources } from '@/lib/import/resources/importSources'
import type { ImportResult } from '@/lib/import/types'
import { emptyScene } from '@/lib/defaults'
import { assetSourcePool } from '@/lib/asset/sources'
import { nativePng, nativeFingerprint } from '@/lib/asset/visual/__tests__/nativeMediaFixtures'
import { browserVisualDecoder } from '@/lib/asset/visual/browserVisualDecoder'
import { ManagedBudgetSection } from '@/components/resources/ManagedBudgetSection'

/** Real File/Web Streams/raw-DEFLATE, import command and source ownership check.
 * Private fixed-size fixtures only; no connected editor/user project is changed.
 * The inspection gate holds a real decoded entry, not an assumed timed delay. */
async function runChecks(show: (value: ResourceBudgetSnapshot) => void, inspect: () => Promise<void>, copies: HTMLElement) {
  const rows: { name: string; passed: boolean; details?: unknown }[] = []
  const test = (name: string, passed: boolean, details?: unknown) => { rows.push({ name, passed, details }); if (!passed) throw new Error(name) }
  const rejects = (pending: Promise<unknown>, expected: string) => pending.then(() => false, error => String(error).includes(expected))
  const json = JSON.stringify({ v: '5.7', w: 640, h: 360, fr: 30, ip: 10, op: 70, layers: [{ ty: 4 }] }), bytes = new TextEncoder().encode(json)
  const budget = new ResourceBudget({ maxBytes: 512 * 1024 ** 2 }), zip = new ZipReader({ budget, maxEntryBytes: 256 * 1024 })
  const input = new BoundedBinaryReader({ budget, maxBytes: 256 * 1024 }), metadata = new LottieMetadataReader({ budget })
  const manager = new ImportManager(); manager.registerHandler(new LottieDocumentHandler(metadata))
  const results: ImportResult[] = [], pins: { release(): void }[] = [], sources: { release(): void }[] = [], canvases: HTMLCanvasElement[] = []
  const hold = Promise.withResolvers<void>()
  let heldInput: Awaited<ReturnType<typeof input.readResponse>> | undefined, heldWork: Promise<unknown> | undefined
  try {
    const png = await nativePng(), pngBytes = new Uint8Array(await png.arrayBuffer())
    const buffer = await buildZip([{ name: 'manifest.json', data: new TextEncoder().encode('{}') },
      { name: 'animations/main.json', data: bytes, deflate: true, descriptor: 'signed' }, { name: 'images/icon.png', data: pngBytes }])
    const file = new File([buffer], 'native.lottie', { type: 'application/dotlottie' })
    const entries = zip.readEntries(buffer)
    const decoded = await zip.withEntry(buffer, entries[1], data => new TextDecoder().decode(data))
    test('native raw-DEFLATE with signed descriptor preserves exact animation JSON', decoded === json)
    const unsigned = await buildZip([{ name: 'a', data: bytes, deflate: true, descriptor: 'unsigned' }])
    test('native raw-DEFLATE supports unsigned ZIP32 data descriptors', await zip.withEntry(unsigned, zip.readEntries(unsigned)[0], data => new TextDecoder().decode(data)) === json)
    test('STORE output preserves exact archived PNG bytes', await zip.withEntry(buffer, entries[2], data => data.length === pngBytes.length && data.every((b, i) => b === pngBytes[i])))
    const decodedPng = await zip.extractLease(buffer, entries[2])
    const imageSource = await decodedPng.withCopy(data => assetSourcePool.create(new Blob([data], { type: 'image/png' }))).finally(() => decodedPng.release()); sources.push(imageSource)
    const originalSource = assetSourcePool.create(png); sources.push(originalSource)
    const before = browserVisualDecoder({ kind: 'image', url: originalSource.url }, new AbortController().signal)
    const after = browserVisualDecoder({ kind: 'image', url: imageSource.url }, new AbortController().signal)
    try {
      await Promise.all([before.ready, after.ready])
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32; canvases.push(canvas)
      test('native decoded archived PNG has identical RGBA pixels', nativeFingerprint(before.element, canvas) === nativeFingerprint(after.element, canvas))
      const img = document.createElement('img'); img.src = canvas.toDataURL(); img.alt = 'PNG extracted from ZIP'; copies.append(img)
    } finally { before.dispose(); after.dispose() }
    const preflight = await manager.preflight(file)
    test('real dotLottie preflight preserves size/fps/duration/layer metadata', preflight.summary.detectedFeatures.join('|') === '640×360 px|30 fps|2.00 s|1 layer(s)')
    const result = await manager.importFileAs(file, 'application/dotlottie'); results.push(result)
    const project = result.commands[0].execute(emptyScene()), pin = assetSourcePool.retainAssets(project.assets, { transferCreators: true }); pins.push(pin); releaseImportSources(result)
    test('real import command adopts one unchanged Lottie asset without claiming editable layers', project.assets.length === 1 && project.layers.length === 0
      && project.assets[0].width === 640 && project.assets[0].durationMs === 2000 && (await fetch(project.assets[0].url)).ok)
    pin.release(); await Promise.resolve()
    const dishonest = await buildZip([{ name: 'a', data: new Uint8Array(1024), deflate: true, declaredSize: 1 }]), tiny = new ZipReader({ budget, maxEntryBytes: 32 })
    test('actual native inflation rejects dishonest declared size at the decoded byte cap', await rejects(tiny.extractLease(dishonest, tiny.readEntries(dishonest)[0]), 'byte limit') && tiny.getSnapshot().chargedBytes === 0)
    const damaged = buffer.slice(0); new Uint8Array(damaged)[entries[2].localHeaderOffset + 30 + new TextEncoder().encode(entries[2].name).length] ^= 1
    test('stored CRC corruption rejects and releases output', await rejects(zip.extractLease(damaged, zip.readEntries(damaged)[2]), 'CRC') && zip.getSnapshot().chargedBytes === 0)
    const events: string[] = []; const off = manager.onImportEvent(e => events.push(e.type))
    test('malformed dotLottie fails import rather than publishing an empty fallback', await rejects(manager.importFileAs(new File(['PK broken'], 'bad.lottie'), 'application/dotlottie'), 'ZIP') && events.join(',') === 'importStart,importError'); off()
    const textBudget = new ResourceBudget({ maxBytes: bytes.length * 3 - 1 })
    test('metadata text overlap is refused before parsing and drains its original input', await rejects(new LottieMetadataReader({ budget: textBudget }).read(new File([bytes], 'a.json'), 'json'), 'metadata text') && textBudget.getSnapshot().chargedBytes === 0)
    heldInput = await input.readResponse(new Response(file.stream()))
    const started = Promise.withResolvers<void>(), abort = new AbortController()
    heldWork = zip.withEntry(heldInput.buffer, entries[1], async data => { started.resolve(); await hold.promise; return data.length }, { signal: abort.signal })
      .then(() => false, error => error.name === 'AbortError')
    await started.promise
    const working = budget.getSnapshot(); show(working); await inspect()
    abort.abort()
    test('original ZIP plus decoded entry stay charged through cancelled consumer settlement', budget.getSnapshot().chargedBytes === file.size + bytes.length,
      { archiveBytes: file.size, decodedBytes: bytes.length, input: working.categories.input })
    hold.resolve(); test('late cancelled decoded consumer is rejected before result delivery', await heldWork === true)
    heldInput.release()
    test('all ZIP/input/text scopes drain after success and failure', budget.getSnapshot().chargedBytes === 0 && zip.getSnapshot().chargedBytes === 0)
    return { passed: true, rows, final: budget.getSnapshot(), zip: zip.getSnapshot() }
  } catch (error) { return { passed: false, error: String(error), rows, final: budget.getSnapshot() } }
  finally {
    hold.resolve(); await heldWork; heldInput?.release(); results.forEach(releaseImportSources)
    pins.forEach(pin => pin.release()); sources.forEach(source => source.release()); canvases.forEach(c => { c.width = c.height = 0 }); show(budget.getSnapshot())
  }
}

/** QA composition uses the actual managed-budget component and explicit native
 * completion gate. It owns no production route or persisted project state. */
function Host() {
  const [status, setStatus] = useState('Ready'), [snapshot, setSnapshot] = useState<ResourceBudgetSnapshot | null>(null)
  const [report, setReport] = useState<unknown>(null), [resume, setResume] = useState<(() => void) | null>(null)
  const run = async () => {
    setStatus('Running')
    const result = await runChecks(setSnapshot, () => new Promise<void>(resolve => {
      setStatus('Inspect ZIP input'); setResume(() => () => { setResume(null); setStatus('Running'); resolve() })
    }), document.getElementById('copies')!)
    const build = await (await fetch('zip-input-sources.json')).json()
    setReport({ ...result, build, environment: { userAgent: navigator.userAgent, dpr: devicePixelRatio } }); setStatus(result.passed ? 'PASS' : 'FAIL')
  }
  return <main style={{ background: '#101827', color: '#e2e8f0', fontFamily: 'system-ui', padding: 20, minHeight: '100vh' }}>
    <h1>Bounded ZIP / dotLottie · native acceptance</h1><p>Actual File streams · STORE / raw-DEFLATE · private 512 MiB ledger</p>
    <button disabled={status !== 'Ready'} onClick={run}>Run native ZIP checks</button>
    <button disabled={!resume} onClick={() => resume?.()}>Continue checks</button><p id="status">{status}</p>
    <div id="copies" /><div style={{ maxWidth: 960 }}>{snapshot && <ManagedBudgetSection snapshot={snapshot} />}</div>
    <pre id="report" style={{ maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{report ? JSON.stringify(report, null, 2) : 'Ready'}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
