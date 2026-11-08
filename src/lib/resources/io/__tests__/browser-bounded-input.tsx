import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BoundedBinaryReader } from '../BoundedBinaryReader'
import { ResourceBudget } from '../../budget'
import { AudioAssetService } from '@/lib/audio/AudioAssetService'
import { nativeStereoSource } from '@/lib/audio/__tests__/nativeStereoSource'
import { downsampleAudioBuffer } from '@/lib/timeline/audioWaveform'
import { nativePng, nativeFingerprint } from '@/lib/asset/visual/__tests__/nativeMediaFixtures'
import { browserVisualDecoder } from '@/lib/asset/visual/browserVisualDecoder'
import { assetSourcePool } from '@/lib/asset/sources'
import { ImportManager } from '@/lib/import/ImportManager'
import { ImageHandler } from '@/lib/import/handlers/asset/ImageHandler'
import { releaseImportSources } from '@/lib/import/resources/importSources'
import type { ImportResult, ImportEvent } from '@/lib/import/types'
import { emptyScene } from '@/lib/defaults'
import { ManagedBudgetSection } from '@/components/resources/ManagedBudgetSection'
import type { ResourceBudgetSnapshot } from '../../budget'

/** Controlled actual settlement boundary for native integration, not a timer. */
function gate() { let release!: () => void; const promise = new Promise<void>(yes => { release = yes }); return { promise, release } }

/** Real PNG handler with one post-native completion gate. It creates real asset
 * and transaction data; only result delivery is delayed to test stale rejection. */
class HeldImageHandler extends ImageHandler {
  readonly hold = gate()
  private completed?: ImportResult
  /** Borrow the native-converted result only for QA ownership observations. */
  get result(): ImportResult | undefined { return this.completed }
  /** Keep actual source ownership while the legacy converter ignores abort. */
  async handle(file: File): Promise<ImportResult> {
    const result = await super.handle(file)
    this.completed = result; await this.hold.promise
    return result
  }
}

/** Actual native reads/AudioContext/PNG import over a private bounded ledger.
 * The URL adapter maps one valid import URL to a private Blob fetch; no external
 * network or connected project is used. All source/context/buffer owners drain
 * in finally. Small image copies remain only as inspection artifacts. */
async function runChecks(show: (snapshot: ResourceBudgetSnapshot) => void, inspect: () => Promise<void>, copies: HTMLElement) {
  const rows: object[] = [], test = (name: string, passed: boolean, details?: unknown) => {
    rows.push({ name, passed, details }); if (!passed) throw new Error(name)
  }
  const budget = new ResourceBudget({ maxBytes: 512 * 1024 ** 2 }), reader = new BoundedBinaryReader({ maxBytes: 256 * 1024, budget })
  const wav = nativeStereoSource(), png = await nativePng(), sources = [assetSourcePool.create(wav), assetSourcePool.create(png)]
  const context = new AudioContext({ sampleRate: 48000 }), actualDecode = context.decodeAudioData.bind(context)
  const nativeHold = gate(), heldHandler = new HeldImageHandler()
  let observedDetached = false, decoded = false, audioError = '', importError = ''
  context.decodeAudioData = ((data: ArrayBuffer) => {
    const decoded = actualDecode(data); observedDetached ||= data.byteLength === 0
    return decoded.then(async buffer => { nativeDecoded(); await nativeHold.promise; return buffer })
  }) as typeof context.decodeAudioData
  /** Native readiness observation is distinct from the delayed service result. */
  function nativeDecoded() { decoded = true }
  const audio = new AudioAssetService({ budget, inputReader: reader, decodeReserveBytes: 24000, createContext: () => context })
  const fetchPng: typeof fetch = (_url, options) => fetch(sources[1].url, options)
  const manager = new ImportManager({ inputReader: reader, fetch: fetchPng }); manager.registerHandler(new ImageHandler())
  const delayed = new ImportManager({ inputReader: reader, fetch: fetchPng }); delayed.registerHandler(heldHandler)
  const events: ImportEvent[] = []; delayed.onImportEvent(event => events.push(event))
  const imports: ImportResult[] = [], pending: Promise<unknown>[] = [], pins: { release(): void }[] = []
  const canvases: HTMLCanvasElement[] = []
  /** Owned QA readback surface, never an application frame cache. */
  const surface = () => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32; canvases.push(canvas); return canvas }
  try {
    const tiny = new BoundedBinaryReader({ maxBytes: 4, budget })
    const dishonest = await tiny.readResponse(new Response(new Uint8Array(5), { headers: { 'content-length': '1' } })).then(() => false, error => error instanceof RangeError)
    test('native Response actual bytes reject dishonest Content-Length before copying', dishonest && tiny.getSnapshot().chargedBytes === 0)
    const result = await manager.importUrl('http://localhost/native.png'); imports.push(result)
    const project = result.commands[0].execute(emptyScene()), projectPin = assetSourcePool.retainAssets(project.assets, { transferCreators: true }); pins.push(projectPin)
    releaseImportSources(result)
    test('native PNG import creates its real layer/command and transfers source lifetime independently of input charge',
      project.layers.length === 1 && project.assets[0].width === 32 && project.assets[0].height === 32
      && budget.getSnapshot().categories.input.residentBytes === 0 && (await fetch(project.assets[0].url)).ok)
    const before = browserVisualDecoder({ kind: 'image', url: sources[1].url }, new AbortController().signal)
    const after = browserVisualDecoder({ kind: 'image', url: project.assets[0].url }, new AbortController().signal)
    try {
      await Promise.all([before.ready, after.ready])
      const canvas = surface(), equal = nativeFingerprint(before.element, canvas) === nativeFingerprint(after.element, canvas)
      test('bounded fetch/File conversion preserves exact native PNG pixels', equal)
      const image = document.createElement('img'); image.src = canvas.toDataURL(); image.alt = 'Imported native PNG'; copies.append(image)
    } finally { before.dispose(); after.dispose() }
    projectPin.release(); await Promise.resolve()
    const abortAudio = new AbortController(), abortImport = new AbortController()
    const oldAudio = audio.acquireUrl(sources[0].url, { signal: abortAudio.signal }).then(pin => { pins.push(pin); return '' }, error => { audioError = error.name; return error.name })
    const oldImport = delayed.importUrl('http://localhost/native.png', {}, undefined, { signal: abortImport.signal })
      .then(imported => { imports.push(imported); return '' }, error => { importError = error.name; return error.name })
    pending.push(oldAudio, oldImport)
    const readyDeadline = performance.now() + 20000
    while (!decoded || !heldHandler.result) {
      if (audioError || importError) throw new Error(`Native setup failed: ${audioError || importError}`)
      if (performance.now() > readyDeadline) throw new Error('Native input readiness timeout')
      await new Promise(requestAnimationFrame)
    }
    const working = budget.getSnapshot()
    test('encoded input and full File-copy overlap stay admitted during native conversion',
      working.categories.input.residentBytes === wav.size + png.size && working.categories.input.reservedBytes === png.size,
      { encodedWavBytes: wav.size, encodedPngBytes: png.size, observedDetached, input: working.categories.input })
    show(working); await inspect()
    abortAudio.abort(); abortImport.abort(); sources[0].release()
    test('cancelled native audio retains encoded bytes/PCM/source until actual settlement',
      await oldAudio === 'AbortError' && budget.getSnapshot().categories.input.residentBytes === wav.size + png.size && (await fetch(sources[0].url)).ok)
    heldHandler.hold.release(); test('late legacy import is rejected before completion event or command publication',
      await oldImport === 'AbortError' && events.map(event => event.type).join(',') === 'importStart,importError')
    test('cancelled PNG conversion releases its owned result source and both input scopes',
      !(await fetch(heldHandler.result!.assets[0].url).then(() => true, () => false)) && reader.getSnapshot().chargedBytes === wav.size)
    nativeHold.release()
    // Consumer cancellation is prompt; actual preparation settlement is separate.
    const end = performance.now() + 10000
    while (audio.getMemorySnapshot().preparation!.active) { if (performance.now() > end) throw new Error('Native settlement timeout'); await new Promise(requestAnimationFrame) }
    test('actual native settlement drops input charge and prevents late PCM cache publication', budget.getSnapshot().chargedBytes === 0 && !audio.peek(sources[0].url))
    const fresh = assetSourcePool.create(wav); sources.push(fresh)
    const pcm = await audio.acquireUrl(fresh.url); pins.push(pcm)
    const peaks = downsampleAudioBuffer(pcm.buffer, 12)
    test('fresh bounded input preserves real native stereo PCM and waveform extrema', pcm.buffer.length === 2400 && pcm.buffer.numberOfChannels === 2
      && Math.abs(peaks.peaks[0] + 0.5) < 1e-4 && Math.abs(peaks.peaks[1] - 0.5) < 1e-4)
    pcm.release(); audio.clearIdle()
    test('success and cancellation both drain registered input bytes', reader.getSnapshot().chargedBytes === 0 && budget.getSnapshot().chargedBytes === 0)
    return { passed: true, rows, final: budget.getSnapshot(), input: reader.getSnapshot(), observedDetached }
  } catch (error) { return { passed: false, error: String(error), rows, budget: budget.getSnapshot(), input: reader.getSnapshot() } }
  finally {
    heldHandler.hold.release(); nativeHold.release(); await audio.dispose(); await Promise.allSettled(pending)
    if (context.state !== 'closed') await context.close()
    imports.forEach(releaseImportSources); pins.forEach(pin => pin.release()); sources.forEach(source => source.release())
    canvases.forEach(canvas => { canvas.width = canvas.height = 0 }); show(budget.getSnapshot())
  }
}

/** Explicit controls inspect the production budget component during actual
 * native work. The root owns only private QA state; closing the page ends it. */
function Host() {
  const [status, setStatus] = useState('Ready'), [snapshot, setSnapshot] = useState<ResourceBudgetSnapshot | null>(null)
  const [report, setReport] = useState<unknown>(null), [resume, setResume] = useState<(() => void) | null>(null)
  const run = async () => {
    setStatus('Running')
    const result = await runChecks(setSnapshot, () => new Promise<void>(resolve => {
      setStatus('Inspect encoded input'); setResume(() => () => { setResume(null); setStatus('Running'); resolve() })
    }), document.getElementById('copies')!)
    const build = await (await fetch('bounded-input-sources.json')).json()
    setReport({ ...result, build, environment: { userAgent: navigator.userAgent, dpr: devicePixelRatio } }); setStatus(result.passed ? 'PASS' : 'FAIL')
  }
  return <main style={{ background: '#101827', color: '#e2e8f0', fontFamily: 'system-ui', padding: 20, minHeight: '100vh' }}>
    <h1>Bounded encoded input · native acceptance</h1><p>Actual Web Streams / WAV decode / PNG import · private 512 MiB ledger</p>
    <button disabled={status !== 'Ready'} onClick={run}>Run native input checks</button>
    <button disabled={!resume} onClick={() => resume?.()}>Continue checks</button><p id="status">{status}</p>
    <div id="copies" />
    <div style={{ maxWidth: 960 }}>{snapshot && <ManagedBudgetSection snapshot={snapshot} />}</div>
    <pre id="report" style={{ maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{report ? JSON.stringify(report, null, 2) : 'Ready'}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
