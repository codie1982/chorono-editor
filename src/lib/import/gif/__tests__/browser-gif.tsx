import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GifImportService } from '../GifImportService'
import { mainThreadGifComposer } from '../browserGifPlatform'
import type { GifSheetComposer } from '../types'
import { GifDecodeWorkerClient } from '../../workers/GifDecodeWorkerClient'
import { animatedGif, staticGif, partialGif } from './gifFixtures'
import { ResourceBudget, type ResourceBudgetSnapshot } from '@/lib/resources/budget'
import { BoundedJobQueue } from '@/lib/resources/jobs'
import { GifHandler } from '../../handlers/asset/GifHandler'
import { ImportManager } from '../../ImportManager'
import { releaseImportSources } from '../../resources/importSources'
import type { ImportResult } from '../../types'
import { emptyScene } from '@/lib/defaults'
import { assetSourcePool } from '@/lib/asset/sources'
import { visualAssetService } from '@/lib/asset/visual'
import { withMediaFrame } from '@/lib/render/media/withMediaFrame'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'
import { ManagedBudgetSection } from '@/components/resources/ManagedBudgetSection'

/** Read native PNG pixels into a tiny owned QA canvas, outside application
 * timing/budget claims. Keep a visible copy; discard ImageBitmap in finally. */
async function pixels(blob: Blob, copies?: HTMLElement): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas')
  try {
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(bitmap, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    if (copies) { const image = document.createElement('img'); image.src = canvas.toDataURL(); image.alt = 'Native GIF sprite sheet'; image.style.cssText = 'width:128px;height:128px;image-rendering:pixelated;margin-right:16px'; copies.append(image) }
    return data
  } finally { bitmap.close(); canvas.width = canvas.height = 0 }
}
/** Independent exact solid-color/timing fixture, not another copy of composeGif. */
function expectedSheet(): Uint8Array {
  const data = new Uint8Array(8 * 8 * 4), colors = [[255, 0, 0, 255], [0, 0, 255, 255], [0, 255, 0, 255], [0, 0, 0, 0]]
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) data.set(colors[Math.floor(y / 4) * 2 + Math.floor(x / 4)], (y * 8 + x) * 4)
  return data
}

/** Frozen legacy all-frame composition for the ONE 3-frame/4×4 QA fixture.
 * Retaining three tiny frames here supplies independent pixel evidence that
 * immediate close in production preserves partial/transparent disposal history.
 * This bounded reference is never used for application conversion. */
async function legacyPartialPixels(): Promise<Uint8ClampedArray> {
  const decoder = new ImageDecoder({ data: partialGif(), type: 'image/gif', preferAnimation: true })
  const frames: VideoFrame[] = [], canvas = document.createElement('canvas')
  try {
    await Promise.all([decoder.tracks.ready, decoder.completed])
    for (let i = 0; i < 3; i++) frames.push((await decoder.decode({ frameIndex: i })).image)
    canvas.width = canvas.height = 8
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    frames.forEach((frame, i) => context.drawImage(frame, i % 2 * 4, Math.floor(i / 2) * 4))
    return context.getImageData(0, 0, 8, 8).data
  } finally { frames.forEach(frame => frame.close()); decoder.close(); canvas.width = canvas.height = 0 }
}

/** Actual worker/File/ImageDecoder/PNG/renderer checks. Post-native producer
 * delivery is explicitly gated for cancellation ownership inspection; it is
 * labelled as such rather than claiming native frames remain busy at that gate. */
async function runChecks(show: (s: ResourceBudgetSnapshot) => void, inspect: () => Promise<void>, copies: HTMLElement) {
  const rows: object[] = [], test = (name: string, passed: boolean, details?: unknown) => { rows.push({ name, passed, details }); if (!passed) throw new Error(name) }
  const budget = new ResourceBudget({ maxBytes: 512 * 1024 ** 2 }), jobs = new BoundedJobQueue({ concurrency: 2, maxQueued: 8 })
  const stats = { created: 0, terminated: 0 }, workerClient = new GifDecodeWorkerClient({ createWorker: () => {
    const worker = new Worker(new URL('gif-worker.js', document.baseURI), { type: 'module' }); stats.created++
    const terminate = worker.terminate.bind(worker); worker.terminate = () => { stats.terminated++; terminate() }
    return worker
  } })
  const service = new GifImportService({ budget, executor: jobs, worker: workerClient })
  const main = new GifImportService({ budget, executor: jobs, worker: false, main: mainThreadGifComposer })
  const file = new File([animatedGif()], 'native.gif', { type: 'image/gif' }), prepared: { release(): void }[] = [], results: ImportResult[] = [], pins: { release(): void }[] = []
  const hold = Promise.withResolvers<void>(), started = Promise.withResolvers<void>()
  let pending: Promise<string> | undefined
  try {
    const plan = await service.inspect(file)
    test('GIF preflight reads actual frame count and dimensions without starting a native worker', plan.frameCount === 3 && plan.width === 4 && plan.sheetBytes === 256 && stats.created === 0)
    const direct = await main.prepare(file); prepared.push(direct)
    const mainPixels = await pixels(direct.sheet!.blob, copies), expected = expectedSheet()
    test('main-thread native GIF decode preserves exact RGBA grid and averaged 200 ms timing', mainPixels.length === expected.length && mainPixels.every((b, i) => b === expected[i]) && direct.sheet!.avgFrameMs === 200)
    test('prepared PNG remains admitted until its consumer releases it', budget.getSnapshot().chargedBytes === direct.sheet!.blob.size)
    direct.release(); test('main-thread native frames/canvas/input drain after result release', budget.getSnapshot().chargedBytes === 0)
    const threaded = await service.prepare(file); prepared.push(threaded)
    const workerPixels = await pixels(threaded.sheet!.blob, copies)
    test('real worker uses the identical sequential compositor and exact native PNG pixels/timing', workerPixels.every((b, i) => b === mainPixels[i]) && threaded.sheet!.avgFrameMs === 200)
    threaded.release(); test('worker result closes its worker handle and drops transient charges', stats.created === 1 && stats.terminated === 1 && budget.getSnapshot().chargedBytes === 0)
    const partial = await service.prepare(new File([partialGif()], 'partial.gif')); prepared.push(partial)
    const partialPixels = await pixels(partial.sheet!.blob), legacyPixels = await legacyPartialPixels()
    test('immediate frame close preserves partial rectangles, transparency and disposal history versus legacy native composition', partialPixels.every((b, i) => b === legacyPixels[i]))
    partial.release()
    const manager = new ImportManager(); manager.registerHandler(new GifHandler(service))
    const result = await manager.importFileAs(file, 'image/gif'); results.push(result)
    const project = result.commands[0].execute(emptyScene()), pin = assetSourcePool.retainAssets(project.assets, { transferCreators: true }); pins.push(pin); releaseImportSources(result)
    test('real command/source adoption preserves an editable 3-frame sequence at 5 fps', project.layers.length === 1 && project.assets.length === 1 && project.layers[0].frameSequence?.frameCount === 3 && project.layers[0].frameSequence?.fps === 5)
    project.composition = { ...project.composition, width: 4, height: 4, durationMs: 1000 }
    // Chorono x/y are the unrotated box's top-left; anchors are pivot offsets.
    project.layers[0].transform = { ...project.layers[0].transform, x: 0, y: 0 }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4
    try {
      const context = canvas.getContext('2d', { willReadFrequently: true })!, colors = [[255, 0, 0], [0, 0, 255], [0, 255, 0], [255, 0, 0]]
      let equal = true
      const rendered: object[] = []
      const times = [0, 200, 400, 600]
      for (let i = 0; i < times.length; i++) {
        const time = times[i]
        await withMediaFrame(project, time, context, {}, (assets, overrides) => canvasRenderer.render(context, project, time, null, assets, { overrides, renderMode: 'preview' }))
        const rgba = context.getImageData(0, 0, 4, 4).data
        const differences = Array.from(rgba).filter((value, index) => value !== (index % 4 === 3 ? 255 : colors[i][index % 4])).length
        rendered.push({ timeMs: time, firstPixel: Array.from(rgba.slice(0, 4)), differentBytes: differences })
        equal &&= differences === 0
      }
      test('production renderer draws exact red/blue/green/loop frames at 0/200/400/600 ms', equal, rendered)
    } finally { canvas.width = canvas.height = 0; visualAssetService.clearIdle() }
    pin.release(); await Promise.resolve()
    const stillService = new GifImportService({ budget, executor: jobs, worker: false, main: false }), stillManager = new ImportManager(); stillManager.registerHandler(new GifHandler(stillService))
    const still = await stillManager.importFileAs(new File([staticGif()], 'still.gif'), 'image/gif'); results.push(still)
    test('bounded native static fallback preserves image dimensions and explicit still warning', still.assets[0].type === 'image' && still.assets[0].width === 4 && still.layers[0].type === 'image' && still.warnings.length === 1)
    releaseImportSources(still)
    const before = stats.created
    const capped = new GifImportService({ budget, executor: jobs, worker: workerClient, maxFrames: 2 })
    const cap = await capped.prepare(file).then(value => { value.release(); return false }, error => error instanceof RangeError)
    test('actual metadata caps reject before worker creation rather than falling back', cap && stats.created === before && budget.getSnapshot().chargedBytes === 0)
    const malformed = await service.prepare(new File([animatedGif().slice(0, -1)], 'bad.gif')).then(value => { value.release(); return false }, error => String(error).includes('GIF'))
    test('malformed GIF rejects before native work with no fallback asset', malformed && stats.created === before && budget.getSnapshot().chargedBytes === 0)
    const gated: GifSheetComposer = { compose: async (...args) => { const sheet = await workerClient.compose(...args); started.resolve(); await hold.promise; return sheet } }
    const delayed = new GifImportService({ budget, executor: jobs, worker: gated }), abort = new AbortController()
    pending = delayed.prepare(file, { signal: abort.signal }).then(value => { prepared.push(value); return '' }, error => error.name)
    await started.promise
    const working = budget.getSnapshot(); show(working); await inspect(); abort.abort()
    test('post-native result delivery keeps transferred-input/workspace/output policy admitted until producer settlement', working.chargedBytes === budget.getSnapshot().chargedBytes && working.chargedBytes > plan.encodeReserveBytes,
      { phase: 'native worker finished; producer result not delivered', policy: working.categories.input, chargedBytes: working.chargedBytes })
    hold.resolve(); test('cancelled producer publishes no late PNG result', await pending === 'AbortError')
    test('all native worker handles, queue jobs and transient bytes drain', stats.created === stats.terminated && jobs.getSnapshot().active === 0 && budget.getSnapshot().chargedBytes === 0)
    return { passed: true, rows, final: budget.getSnapshot(), jobs: jobs.getSnapshot(), workers: stats }
  } catch (error) { return { passed: false, error: String(error), rows, final: budget.getSnapshot(), jobs: jobs.getSnapshot(), workers: stats } }
  finally { hold.resolve(); await pending; prepared.forEach(x => x.release()); results.forEach(releaseImportSources); pins.forEach(x => x.release()); visualAssetService.clearIdle(); jobs.dispose(); show(budget.getSnapshot()) }
}

/** QA host owns private fixtures and exposes the actual resource panel. */
function Host() {
  const [status, setStatus] = useState('Ready'), [snapshot, setSnapshot] = useState<ResourceBudgetSnapshot | null>(null)
  const [report, setReport] = useState<unknown>(null), [resume, setResume] = useState<(() => void) | null>(null)
  const run = async () => {
    setStatus('Running')
    const result = await runChecks(setSnapshot, () => new Promise<void>(resolve => {
      setStatus('Inspect producer settlement'); setResume(() => () => { setResume(null); setStatus('Running'); resolve() })
    }), document.getElementById('copies')!)
    const build = await (await fetch('gif-input-sources.json')).json()
    setReport({ ...result, build, environment: { userAgent: navigator.userAgent, dpr: devicePixelRatio } }); setStatus(result.passed ? 'PASS' : 'FAIL')
  }
  return <main style={{ background: '#101827', color: '#e2e8f0', fontFamily: 'system-ui', padding: 20, minHeight: '100vh' }}>
    <h1>Bounded GIF preparation · native acceptance</h1><p>Real Worker / ImageDecoder / PNG / renderer · private 512 MiB ledger</p>
    <button disabled={status !== 'Ready'} onClick={run}>Run native GIF checks</button>
    <button disabled={!resume} onClick={() => resume?.()}>Continue checks</button><p id="status">{status}</p>
    <div id="copies" /><div style={{ maxWidth: 960 }}>{snapshot && <ManagedBudgetSection snapshot={snapshot} />}</div>
    <pre id="report" style={{ maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{report ? JSON.stringify(report, null, 2) : 'Ready'}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
