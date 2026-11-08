import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioAssetService } from '../AudioAssetService'
import { AudioEngine } from '../../audioEngine'
import { nativeStereoSource } from './nativeStereoSource'
import { downsampleAudioBuffer } from '../../timeline/audioWaveform'
import { emptyScene } from '../../defaults'
import { ProjectResourceMonitor } from '../../resources/monitor/ProjectResourceMonitor'
import ResourceMonitorPanel from '@/components/resources/ResourceMonitorPanel'

/** A native completion gate, not a clock/timeout. Used only to hold actual async
 * work for explicit panel inspection or deterministic cancellation ordering. */
function gate() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

/** Actual PCM WAV generated with the production encoder. Opposed channels verify
 * that sharing/cancellation does not corrupt PCM or cancel waveform extrema. */

/** Private test ownership: no connected scene, production singleton or external
 * URL is modified. Fetch/decode use native browser APIs. The optional completion
 * gate deliberately simulates a slow/non-abortable native completion. */
function fixture() {
  const urls = Array.from({ length: 8 }, () => URL.createObjectURL(nativeStereoSource()))
  const context = new AudioContext({ sampleRate: 48000 }), nativeDecode = context.decodeAudioData.bind(context)
  const firstFetches = gate(), fetching = gate(), inspection = gate()
  let fetches = 0, decoded = 0, activeDecode = 0, maxDecode = 0
  let decodeGate: ReturnType<typeof gate> | null = null, decodeStarted: ReturnType<typeof gate> | null = null
  let waitingDecodes = 0
  // Adapter delegates actual decoding to this browser AudioContext. It never
  // synthesizes AudioBuffer results; the gate only delays their delivery.
  context.decodeAudioData = ((bytes: ArrayBuffer) => {
    decoded++; activeDecode++; maxDecode = Math.max(maxDecode, activeDecode)
    const hold = decodeGate
    if (hold && ++waitingDecodes === 2) decodeStarted!.release()
    return nativeDecode(bytes).then(async buffer => { await hold?.promise; return buffer })
      .finally(() => { activeDecode-- })
  }) as typeof context.decodeAudioData
  const service = new AudioAssetService({ maxConcurrent: 2, maxQueued: 4, createContext: () => context,
    fetch: async (url, options) => {
      fetches++; if (fetches === 2) firstFetches.release()
      await fetching.promise
      return fetch(url, options)
    } })
  const scene = emptyScene()
  scene.assets = urls.map((url, index) => ({ id: `audio-${index}`, name: `Native WAV ${index + 1}`, type: 'audio', url, durationMs: 50 }))
  const audio = () => ({ ...service.getMemorySnapshot(), assets: [] })
  const monitor = new ProjectResourceMonitor({ scene, media: new Map(), isPlaying: false, audio })
  return { urls, service, scene, monitor, firstFetches, fetching, inspection,
    stats: () => ({ fetches, decoded, maxDecode }),
    holdDecodes() { waitingDecodes = 0; decodeGate = gate(); decodeStarted = gate(); return { ready: decodeStarted.promise, release: decodeGate.release } },
    allowDecodes() { decodeGate?.release(); decodeGate = null },
    async dispose() { inspection.release(); fetching.release(); decodeGate?.release(); await service.dispose(); urls.forEach(url => URL.revokeObjectURL(url)) } }
}

/** Full service acceptance. Each request immediately attaches rejection handling
 * so deliberately cancelled jobs cannot create spurious unhandled rejections. */
async function checks(owner: ReturnType<typeof fixture>, inspect: () => Promise<void>) {
  const results: Array<{ name: string; passed: boolean; details?: unknown }> = []
  const test = (name: string, passed: boolean, details?: unknown) => results.push({ name, passed, details })
  const { service, urls } = owner
  const outcome = (url: string, signal?: AbortSignal) => service.loadUrl(url, { signal })
    .then(buffer => ({ buffer, error: '' }), error => ({ buffer: null, error: (error as Error).name }))
  const pending = urls.slice(0, 6).map(url => outcome(url))
  const excess = await outcome(urls[6])
  await owner.firstFetches.promise
  test('pipeline admits two active and four waiting jobs before native allocation',
    service.getMemorySnapshot().preparation!.active === 2 && service.getMemorySnapshot().preparation!.queued === 4
    && owner.stats().fetches === 2 && owner.stats().decoded === 0 && excess.error === 'RangeError', service.getMemorySnapshot().preparation)
  await inspect(); owner.fetching.release()
  const initial = await Promise.all(pending)
  test('six native WAV decodes drain without exceeding two native decoders', initial.every(row => row.buffer?.numberOfChannels === 2)
    && owner.stats().decoded === 6 && owner.stats().maxDecode <= 2, owner.stats())
  test('native opposed stereo PCM and waveform peaks are preserved', initial.every(row => {
    const peaks = downsampleAudioBuffer(row.buffer!, 12)
    return Math.abs(peaks.peaks[0] + 0.5) < 1e-4 && Math.abs(peaks.peaks[1] - 0.5) < 1e-4
      && row.buffer!.length === 2400 && row.buffer!.sampleRate === 48000
  }))
  service.clear()
  const held = owner.holdDecodes()
  const old = urls.slice(0, 4).map(url => outcome(url))
  await held.ready; service.cancelPending()
  const fresh = outcome(urls[7]), during = service.getMemorySnapshot().preparation!
  test('cancelled non-abortable completion retains both slots; fresh generation waits',
    during.active === 2 && during.queued === 1 && during.cancelled === 4, during)
  held.release(); owner.allowDecodes()
  const [oldResults, current] = await Promise.all([Promise.all(old), fresh])
  test('cancelled queued sources never decode and obsolete native results never reenter cache',
    oldResults.every(row => row.error === 'AbortError') && current.buffer !== null
    && urls.slice(0, 4).every(url => !service.peek(url)) && owner.stats().decoded === 9, owner.stats())
  test('fresh generation cache is reusable and preparation drains to zero', service.peek(urls[7]) === current.buffer
    && service.getMemorySnapshot().preparation!.active === 0 && service.getMemorySnapshot().preparation!.queued === 0)

  service.clear()
  // Both native decodes can be held, but only one URL is used here. The second
  // independent request is deduplicated, not a second decoder.
  const cancel = new AbortController(), one = outcome(urls[0], cancel.signal), two = outcome(urls[0])
  cancel.abort(); const [cancelled, survivor] = await Promise.all([one, two])
  test('one cancelled consumer leaves an independent same-URL consumer intact', cancelled.error === 'AbortError'
    && survivor.buffer !== null && service.peek(urls[0]) === survivor.buffer && owner.stats().decoded === 10)
  const engine = new AudioEngine(service), asset = owner.scene.assets[0]
  const oldEngine = engine.loadAsset(asset)
  engine.removeAsset(asset.id)
  const newEngine = engine.loadAsset(asset)
  await Promise.all([oldEngine, newEngine])
  test('engine removal and identical-URL re-add keeps exactly one current PCM reference', engine.getResourceSnapshot().assets.length === 1
    && engine.getState().loadingAssetIds.length === 0 && Object.keys(engine.getState().errors).length === 0)
  engine.dispose()
  test('engine disposal drops its references without deleting the shared cache', engine.getResourceSnapshot().assets.length === 0 && !!service.peek(urls[0]))
  service.cancelPending()
  test('cancellation and cache cleanup preserve source URL ownership', (await fetch(urls[0])).ok && service.getMemorySnapshot().bytes === 0)
  return { passed: results.every(row => row.passed), results, final: service.getMemorySnapshot(), stats: owner.stats(),
    environment: { userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, sampleRate: 48000 } }
}

/** Explicit controls let the native test inspect the real resource panel during
 * actual queued work. Unmount aborts service ownership and releases its URLs. */
function Host() {
  const [owner, setOwner] = useState<ReturnType<typeof fixture> | null>(null)
  const [status, setStatus] = useState('Ready'), [report, setReport] = useState<unknown>(null)
  useEffect(() => () => { void owner?.dispose() }, [owner])
  return <main style={{ background: '#080d19', color: '#e2e8f0', minHeight: '100vh', fontFamily: 'sans-serif', padding: 20 }}>
    <h1>Audio preparation · native acceptance</h1>
    <p>Real Web Audio · two active jobs · four waiting jobs · private sources and service</p>
    <button disabled={status === 'Running' || status === 'Inspect active preparation'} onClick={async () => {
      setStatus('Running'); setReport(null)
      await owner?.dispose()
      const next = fixture(); setOwner(next)
      try {
        const result = await checks(next, async () => {
          setStatus('Inspect active preparation')
          await next.inspection.promise; setStatus('Running')
        })
        setReport(result); setStatus(result.passed ? 'PASS' : 'FAIL')
      } catch (error) { setReport({ passed: false, error: String(error) }); setStatus('FAIL') }
    }}>Run native checks</button>{' '}
    <button disabled={status !== 'Inspect active preparation'} onClick={() => owner?.inspection.release()}>Complete preparation</button>
    <p id="audio-status" role="status">{status}</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(400px, 600px)', gap: 20 }}>
      <pre id="audio-report" style={{ whiteSpace: 'pre-wrap' }}>{report ? JSON.stringify(report, null, 2) : 'Awaiting native completion'}</pre>
      {owner && <div style={{ display: 'flex', minHeight: 0, height: 760 }}>
        <ResourceMonitorPanel scene={owner.scene} assets={new Map()} isPlaying={false}
          audio={{ getResources: () => ({ ...owner.service.getMemorySnapshot(), assets: [] }),
            getState: () => ({ contextState: 'idle', masterVolume: 1, meter: { peak: 0, rms: 0, clipped: false }, loadingAssetIds: [], errors: {}, sources: [] }) }} source={owner.monitor} />
      </div>}
    </div>
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
