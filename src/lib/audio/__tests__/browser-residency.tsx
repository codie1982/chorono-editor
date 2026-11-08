import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioAssetService, getAudioAssetService } from '../AudioAssetService'
import { AudioEngine } from '../../audioEngine'
import { ResourceBudget } from '../../resources/budget'
import { CanvasSurfacePool } from '../../render/resources/CanvasSurfacePool'
import { emptyScene, newAudioLayer } from '../../defaults'
import type { ChronoScene } from '../../types'
import { downsampleAudioBuffer } from '../../timeline/audioWaveform'
import { ProjectResourceMonitor } from '../../resources/monitor/ProjectResourceMonitor'
import { useAudioEngine, type AudioEngineHandle } from '@/app/hooks/useAudioEngine'
import ResourceMonitorPanel from '@/components/resources/ResourceMonitorPanel'
import AudioWaveform from '@/components/timeline/AudioWaveform'
import { nativeStereoSource } from './nativeStereoSource'

/** Explicit native control gate; no arbitrary wait is used for panel inspection. */
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); return { promise, release } }
/** Bounded visible-frame acceptance wait, with a real failure deadline. */
async function until(check: () => boolean) {
  const end = performance.now() + 10000
  while (!check()) {
    if (performance.now() > end) throw new Error('Native acceptance condition timed out.')
    await new Promise(requestAnimationFrame)
  }
}

/** Private owner includes 3,002 valid distinct source URLs sharing one original
 * Blob. This tests decoded demand, not an artificial 3,000-original-file load. */
function fixture() {
  const blob = nativeStereoSource(), urls = Array.from({ length: 3002 }, () => URL.createObjectURL(blob))
  const scene = emptyScene()
  scene.assets = urls.map((url, index) => ({ id: `audio-${index}`, name: `WAV ${index + 1}`, url, type: 'audio', durationMs: 50 }))
  scene.timelines = [{ id: 't', durationMs: 12000, tracks: [], autoplay: false, loop: false }]
  const first = newAudioLayer('audio-0', 1000), second = newAudioLayer('audio-1', 1000)
  first.transform.x = 100000; first.audio!.loop = true
  second.startMs = 10000; second.endMs = 11000; second.audio!.loop = true
  scene.layers = [first, second]
  const budget = new ResourceBudget({ maxBytes: 65536 }), context = new AudioContext({ sampleRate: 48000 })
  const nativeDecode = context.decodeAudioData.bind(context)
  let decodes = 0
  context.decodeAudioData = ((data: ArrayBuffer) => { decodes++; return nativeDecode(data) }) as typeof context.decodeAudioData
  const service = new AudioAssetService({ budget, maxBytes: 65536, decodeReserveBytes: 24000, createContext: () => context })
  const pool = new CanvasSurfacePool({ budget, maxBytes: 65536 })
  const audio = () => ({ ...service.getMemorySnapshot(), ...service.describeAssets(scene.assets) })
  const monitor = new ProjectResourceMonitor({ scene, media: new Map(), isPlaying: false, audio }, { budget, pool })
  const inspection = gate()
  const keepers: Array<() => void> = []
  return { scene, urls, budget, context, service, pool, monitor, audio, inspection, keepers, decodes: () => decodes,
    release() { keepers.splice(0).forEach(release => release()); inspection.release() },
    async dispose() { this.release(); service.clear(); pool.dispose(); await service.dispose(); urls.forEach(url => URL.revokeObjectURL(url)) } }
}
interface ProbeState { scene: ChronoScene; time: number; wave: boolean }
interface ProbeBinding { handle?: AudioEngineHandle }
/** Uses the actual application hook and waveform component with their shared
 * editor service. Master volume is zero; no audible playback is required. */
function Probe({ state, binding }: { state: ProbeState; binding: ProbeBinding }) {
  const handle = useAudioEngine({ scene: state.scene, currentTimeMs: state.time, isPlaying: true, playbackSpeed: 1, masterVolume: 0 })
  useEffect(() => { binding.handle = handle; return () => { binding.handle = undefined } }, [handle, binding])
  return state.wave ? <div style={{ position: 'relative', width: 320, height: 64 }}>
    <AudioWaveform url={state.scene.assets[0].url} pixelsPerMs={4000} clipDurationMs={1000} />
  </div> : null
}

/** End-to-end lease, pressure, native-node and rapid-seek acceptance. Raw PCM
 * comparison uses the authoritative existing reducer; no samples are synthesized. */
async function checks(owner: ReturnType<typeof fixture>, inspect: () => Promise<void>,
  setProbe: (state: ProbeState) => void, binding: ProbeBinding) {
  const results: Array<{ name: string; passed: boolean; details?: unknown }> = []
  const test = (name: string, passed: boolean, details?: unknown) => results.push({ name, passed, details })
  const { service, scene, budget, pool } = owner
  const a = await service.acquire(scene.assets[0]), b = a.retain()
  test('two consumers share one exact 19200-byte stereo allocation', a.buffer === b.buffer && budget.getSnapshot().residentBytes === 19200)
  const peaks = downsampleAudioBuffer(b.buffer, 12)
  test('native stereo PCM and waveform extrema preserved', Math.abs(peaks.peaks[0] + 0.5) < 1e-4 && Math.abs(peaks.peaks[1] - 0.5) < 1e-4)
  service.clear(); a.release(); budget.reclaimIdle()
  test('clear retires PCM while surviving consumer stays valid and charged', b.buffer.length === 2400
    && service.getMemorySnapshot().residency!.retiredEntries === 1 && budget.getSnapshot().protectedBytes === 19200)
  const warm = await service.acquire(scene.assets[1]); warm.release()
  const scratch = pool.acquire(80, 128)
  test('scratch pressure evicts only idle PCM and preserves live PCM', !service.peek(scene.assets[1].url)
    && b.buffer.length === 2400 && budget.getSnapshot().chargedBytes === 60160, budget.getSnapshot())
  owner.keepers.push(() => b.release(), () => scratch.release())
  await inspect(); owner.release(); budget.reclaimIdle()
  test('final consumers return scratch and retired PCM charge to zero', budget.getSnapshot().chargedBytes === 0)

  const engine = new AudioEngine(service), before = owner.decodes()
  engine.setMasterVolume(0)
  await engine.prepareForTime(scene, 125, 1)
  engine.syncToTime(scene, 125, true, 1)
  test('offscreen audio stays scheduled with exact native looping source offset', engine.getState().sources.length === 1
    && Math.abs(engine.getState().sources[0].sourceOffsetSec - 0.025) < 1e-6)
  test('only one of 3002 registered unique sources is decoded for the first window', owner.decodes() - before === 1)
  const charges: number[] = []
  for (let i = 0; i < 10; i++) {
    const time = i % 2 ? 125 : 10025
    await engine.prepareForTime(scene, time, 1)
    engine.syncToTime(scene, time, true, 1)
    charges.push(budget.getSnapshot().chargedBytes)
  }
  test('ten alternating seeks reuse warm PCM without decode thrashing or rising charge', owner.decodes() - before === 2
    && charges.every(bytes => bytes === 38400), { decodes: owner.decodes() - before, charges })
  service.clear()
  test('cache invalidation preserves actual playing native source PCM', budget.getSnapshot().protectedBytes === 19200 && engine.getState().sources.length === 1)
  engine.dispose(); service.clearIdle(); budget.reclaimIdle()
  test('native source stop/dispose drops buffer references and all private charges', budget.getSnapshot().chargedBytes === 0)

  const shared = getAudioAssetService()
  shared.clearIdle()
  setProbe({ scene, time: 125, wave: false })
  await until(() => binding.handle?.getState().sources.length === 1)
  const sharedRate = shared.getContext().sampleRate
  const expectedSharedBytes = Math.round(sharedRate * 0.05) * 2 * Float32Array.BYTES_PER_ELEMENT
  test('application hook requests current demand instead of all registered assets', binding.handle!.getResources().assets.length === 1
    && shared.getMemorySnapshot().residency!.protectedBytes === expectedSharedBytes,
    { sampleRate: sharedRate, expectedSharedBytes, snapshot: shared.getMemorySnapshot() })
  setProbe({ scene, time: 125, wave: true })
  // A painted waveform proves overview loading; deep-zoom detail owns a second
  // PCM lease. Wait two visible commits after the native detail request drains.
  await until(() => document.querySelector('[aria-label="Audio waveform"] canvas') !== null)
  await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame)
  await until(() => shared.getMemorySnapshot().preparation!.active === 0)
  const empty = { ...scene, layers: [] }
  setProbe({ scene: empty, time: 125, wave: true })
  await until(() => binding.handle!.getState().sources.length === 0)
  shared.clearIdle()
  test('deep-zoom waveform keeps PCM pinned after playback demand leaves', shared.getMemorySnapshot().residency!.protectedBytes === expectedSharedBytes,
    { expectedSharedBytes, snapshot: shared.getMemorySnapshot() })
  setProbe({ scene: empty, time: 125, wave: false })
  await until(() => shared.getMemorySnapshot().residency!.protectedBytes === 0)
  shared.clearIdle()
  test('waveform unmount releases the final shared PCM consumer', shared.getMemorySnapshot().residency!.chargedBytes === 0)
  test('decoded eviction preserves original source URL for undo/reload', (await fetch(owner.urls[0])).ok)
  return { passed: results.every(row => row.passed), results, privateFinal: budget.getSnapshot(), sharedPcmFinal: shared.getMemorySnapshot(),
    environment: { userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } } }
}

/** Only explicit controls run isolated acceptance work. Unmount releases owned
 * test sources/resources; the connected editor is never accessed or mutated. */
function Host() {
  const [owner, setOwner] = useState<ReturnType<typeof fixture> | null>(null), [status, setStatus] = useState('Ready')
  const [report, setReport] = useState<unknown>(null), [probe, setProbe] = useState<ProbeState>({ scene: emptyScene(), time: 0, wave: false })
  const binding = useRef<ProbeBinding>({}).current
  useEffect(() => () => { void owner?.dispose() }, [owner])
  return <main style={{ background: '#080d19', color: '#e2e8f0', minHeight: '100vh', fontFamily: 'sans-serif', padding: 20 }}>
    <h1>Audio PCM residency · native acceptance</h1>
    <p>64 KiB private budget · real Web Audio / hook / waveform · 3002 registered sources · silent master</p>
    <button disabled={status === 'Running' || status === 'Inspect protected PCM'} onClick={async () => {
      setStatus('Running'); setReport(null); await owner?.dispose()
      const next = fixture(); setOwner(next)
      try {
        const result = await checks(next, async () => { setStatus('Inspect protected PCM'); await next.inspection.promise; setStatus('Running') }, setProbe, binding)
        setReport(result); setStatus(result.passed ? 'PASS' : 'FAIL')
      } catch (error) { setReport({ passed: false, error: String(error) }); setStatus('FAIL') }
    }}>Run native checks</button>{' '}
    <button disabled={status !== 'Inspect protected PCM'} onClick={() => owner?.inspection.release()}>Release protected resources</button>
    <p id="audio-status" role="status">{status}</p>
    <Probe state={probe} binding={binding} />
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(400px, 600px)', gap: 20 }}>
      <pre id="audio-report" style={{ whiteSpace: 'pre-wrap' }}>{report ? JSON.stringify(report, null, 2) : 'Awaiting native completion'}</pre>
      {owner && <div style={{ display: 'flex', minHeight: 0, height: 760 }}>
        <ResourceMonitorPanel scene={owner.scene} assets={new Map()} isPlaying={false} source={owner.monitor}
          audio={{ getResources: owner.audio, getState: () => ({ contextState: 'idle', masterVolume: 0,
            meter: { peak: 0, rms: 0, clipped: false }, loadingAssetIds: [], errors: {}, sources: [] }) }} />
      </div>}
    </div>
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
