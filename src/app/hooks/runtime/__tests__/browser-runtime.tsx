import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { ChronoScene } from '@/lib/types'
import { useInteractiveRuntime, type FrameEvalResult } from '../../useInteractiveRuntime'
import { usePlayback } from '../../usePlayback'
import { StateMachineRuntime } from '@/lib/statemachine'
import { useCanvasRenderer } from '@/components/canvas/hooks/useCanvasRenderer'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'
import { ProjectResourceMonitor } from '@/lib/resources/monitor/ProjectResourceMonitor'
import { installRuntimeFrameProbe } from './runtimeFrameProbe'
import { runtimeFixture } from './runtimeFixture'
import { runRuntimeChecks, type RuntimeCheckHost, type RuntimeObservation } from './runtimeChecks'

const probe = installRuntimeFrameProbe(), assets = new Map(), drag = new Map<string, number>()
let syncCalls = 0
const sync = StateMachineRuntime.prototype.sync
// Isolated test probe only; production StateMachineRuntime is not instrumented.
StateMachineRuntime.prototype.sync = function (definition) { syncCalls++; sync.call(this, definition) }

/** Actual hook consumer with the same frame memo inputs as the editor. Test
 * observations are bounded metadata; runtime state/scene remain owned by hooks. */
function Subject({ scene, canvas, observe }: { scene: ChronoScene; canvas: boolean; observe(value: RuntimeObservation): void }) {
  const playback = usePlayback({ maxDuration: 5000, wrapAtEnd: false })
  const runtime = useInteractiveRuntime(scene, { playbackDriven: playback.isPlaying }), evaluations = useRef(0)
  const { handleSeek } = playback
  useLayoutEffect(() => handleSeek(500), [handleSeek])
  const seen = useRef<RuntimeObservation['seen']>([])
  const frame = useMemo(() => {
    evaluations.current++
    const wallMs = performance.now()
    return { value: runtime.evaluateFrame(playback.currentTimeMs), wallMs }
    // Old counters remain in the test host so the captured before hook can run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, playback.currentTimeMs, runtime.paramValues, runtime.segmentState, runtime.frameRevision, runtime.segmentTick, runtime.smTestTick])
  useEffect(() => runtime.onEvent(event => {
    if (seen.current.length < 256) seen.current.push({ type: event.type, refId: event.refId, dx: event.dx })
  }), [runtime.onEvent])
  useLayoutEffect(() => observe({ runtime, frame: frame.value, evaluations: evaluations.current, wallMs: frame.wallMs, seen: seen.current,
    playback: { timeMs: playback.currentTimeMs, isPlaying: playback.isPlaying, toggle: playback.handlePlayToggle } }))
  return <section>
    <p>Global playhead {playback.isPlaying ? 'playing' : 'paused'} at {Math.round(playback.currentTimeMs)} ms · state {runtime.smRuntimes.get('machine')?.currentStateId} · value {String(frame.value.paramValues.get('value'))}</p>
    <p>Evaluations {evaluations.current} · queued-input/frame revision {runtime.frameRevision ?? 'unavailable in before version'}</p>
    {canvas && <FrameCanvas scene={scene} frame={frame.value} />}
  </section>
}

/** The real viewport adapter consumes the observed frame; the test owns and
 * zeroes its canvas on unmount, without changing renderer/resource ownership. */
function FrameCanvas({ scene, frame }: { scene: ChronoScene; frame: FrameEvalResult }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useCanvasRenderer(ref, { scene, timeMs: 500, assets, selectedLayerId: null, snapEnabled: false,
    snapToGridOn: false, gridSize: 10, overrides: frame.overrides, paramValues: frame.paramValues, dragOverrides: drag, hideEditorUI: true })
  useEffect(() => { const owned = ref.current; return () => { if (owned) owned.width = owned.height = 0 } }, [])
  return <canvas ref={ref} data-runtime-canvas width={480} height={270} style={{ border: '1px solid #64748b' }} />
}

/** User-visible test controls on a standalone loopback origin. No production
 * test route, scene import/write, hidden evaluate bridge or localStorage use. */
function Host() {
  const [scene, setScene] = useState(runtimeFixture), [generation, setGeneration] = useState(0)
  const [mounted, setMounted] = useState(true), [canvas, setCanvas] = useState(false)
  const [running, setRunning] = useState(false), [report, setReport] = useState<unknown>(null)
  const bridge = useRef<RuntimeObservation>()
  const variant = new URLSearchParams(location.search).get('variant') ?? 'after'
  const host: RuntimeCheckHost = {
    mount: source => { setScene(source); setGeneration(value => value + 1); setMounted(true); setCanvas(false) },
    unmount: () => setMounted(false), read: () => bridge.current!, syncCount: () => syncCalls,
    replaceDefinition: () => setScene(source => ({ ...source,
      stateMachines: source.stateMachines?.map(machine => ({ ...machine, name: `${machine.name} edited` })) })),
  }
  const run = async () => {
    setRunning(true)
    try {
      const results = await runRuntimeChecks(host, probe)
      const finalScene = runtimeFixture(), serialized = JSON.stringify(finalScene)
      flushSync(() => { host.mount(finalScene); setCanvas(true) }); await probe.frames(5)
      bridge.current!.runtime.setParamOverride('value', .5)
      bridge.current!.runtime.dispatchSMEvent('enter'); await probe.frames(6)
      const final = bridge.current!, reference = document.createElement('canvas')
      reference.width = 480; reference.height = 270
      let hashes: string[]
      try {
        canvasRenderer.render(reference.getContext('2d')!, finalScene, 500, null, assets,
          { overrides: final.frame.overrides, paramValues: final.frame.paramValues, renderMode: 'preview' })
        hashes = await Promise.all([document.querySelector<HTMLCanvasElement>('[data-runtime-canvas]')!, reference].map(pixelHash))
      } finally { reference.width = reference.height = 0 }
      const knownBytes = new ProjectResourceMonitor({ scene: finalScene, media: assets, isPlaying: false }).getSnapshot().knownBytes
      const sourceUnchanged = serialized === JSON.stringify(finalScene)
      setReport({ ...results, passed: results.passed && hashes[0] === hashes[1] && sourceUnchanged && knownBytes < 512 * 1024 ** 2,
        variant, hashes, sourceUnchanged, knownBytes, knownGuardBytes: 512 * 1024 ** 2,
        environment: { userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio } })
    } catch (error) { setReport({ passed: false, variant, error: String(error) }) }
    finally { setRunning(false) }
  }
  return <main style={{ minHeight: '100vh', background: '#0b1020', color: '#e2e8f0', padding: 24, fontFamily: 'sans-serif' }}>
    <h1>Runtime input and frame ownership · {variant}</h1>
    <p>Real parameter, trigger, wire, state-machine, segment and viewport hooks. No connected project is modified.</p>
    <button disabled={running} onClick={run}>Run runtime checks</button>
    {mounted && <Subject key={generation} scene={scene} canvas={canvas} observe={value => { bridge.current = value }} />}
    <pre id="runtime-report" style={{ whiteSpace: 'pre-wrap' }}>{report ? JSON.stringify(report, null, 2) : running ? 'Running…' : 'Ready'}</pre>
  </main>
}

/** Full RGBA digest, outside runtime/evaluation timing. */
async function pixelHash(canvas: HTMLCanvasElement): Promise<string> {
  const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}
createRoot(document.getElementById('app')!).render(<Host />)
