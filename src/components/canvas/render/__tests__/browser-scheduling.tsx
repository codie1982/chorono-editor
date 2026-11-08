import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { ChronoScene } from '@/lib/types'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { useInteractiveRuntime } from '@/app/hooks/useInteractiveRuntime'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useCanvasRenderer } from '../../hooks/useCanvasRenderer'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'
import { renderWorkMonitor } from '@/lib/resources/performance/RenderWorkMonitor'
import { ProjectResourceMonitor } from '@/lib/resources/monitor/ProjectResourceMonitor'

interface Sample { stage: string; ms: number; knownBytes: number; heapBytes: number | null }
const samples: Sample[] = [], selected = new Set<string>(), drag = new Map<string, number>()
let armed = false, readResources: (() => { knownBytes: number; browser: { heap: { used: number } | null } }) | null = null
const record = renderWorkMonitor.record.bind(renderWorkMonitor)
// Test-only bounded probe on the real accounting boundary. It does not enter
// the measured interval or change production constructors / application routes.
renderWorkMonitor.record = (stage, ms, at) => {
  record(stage, ms, at)
  if (!armed || samples.length >= 2048) return
  const resources = readResources?.()
  samples.push({ stage, ms, knownBytes: resources?.knownBytes ?? 0, heapBytes: resources?.browser.heap?.used ?? null })
}

/** Actual production runtime + viewport hooks. The host owns its test canvas
 * and releases backing pixels on unmount; no connected scene is touched. */
function Subject({ scene, timeMs, width, ghost, pan, zoom }: { scene: ChronoScene; timeMs: number; width: number; ghost: boolean; pan: number; zoom: number }) {
  const canvas = useRef<HTMLCanvasElement>(null), viewport = useRef<HTMLDivElement>(null)
  const assets = useAssetCache(scene.assets), runtime = useInteractiveRuntime(scene)
  const frame = useMemo(() => renderWorkMonitor.measure('evaluation', () => runtime.evaluateFrame(timeMs)),
    // Mirrors the editor's current runtime frame invalidation contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, timeMs, runtime.paramValues, runtime.segmentState, runtime.frameRevision])
  const settings = useMemo(() => ({ enabled: ghost, beforeFrames: 1, afterFrames: 1, scope: 'all' as const,
    opacity: 15, fps: 30 }), [ghost])
  useCanvasRenderer(canvas, { scene, timeMs, assets, viewportRef: viewport, viewportKey: `${width}:${pan}:${zoom}`,
    selectedLayerId: null, selectedLayerIds: selected, snapEnabled: false, snapToGridOn: false, gridSize: 10,
    overrides: frame.overrides, paramValues: frame.paramValues, dragOverrides: drag, ghostSettings: settings,
    selectedTimeline: scene.timelines[0], hideEditorUI: true })
  useEffect(() => {
    const monitor = new ProjectResourceMonitor({ scene, media: assets, isPlaying: false })
    readResources = () => monitor.getSnapshot()
    return () => { readResources = null }
  }, [scene, assets])
  useEffect(() => {
    const owned = canvas.current
    return () => { if (owned) owned.width = owned.height = 0 }
  }, [])
  return <div ref={viewport} style={{ width, height: 280, overflow: 'hidden', border: '1px solid #475569' }}>
    <canvas ref={canvas} data-viewport-canvas width={scene.composition.width} height={scene.composition.height}
      style={{ width: 480, height: 270, transform: `translateX(${pan}px) scale(${zoom})`, transformOrigin: '0 0' }} />
    <output data-runtime-events>{frame.events.length}</output>
  </div>
}

/** Test fixture has an actual animated transform, with no time quantization. */
function smallScene(): ChronoScene {
  const scene = emptyScene(), layer = newRectLayer(), timeline = newTimeline()
  scene.composition = { ...scene.composition, width: 480, height: 270, durationMs: 48000 }
  layer.id = 'moving'; layer.transform.x = 30; layer.transform.y = 90
  timeline.id = 'move'; timeline.durationMs = 48000
  timeline.tracks = [{ target: 'layers.moving.transform.x', keyframes: [
    { id: 'begin', timeMs: 0, value: 30, easing: { type: 'linear' } },
    { id: 'end', timeMs: 48000, value: 350, easing: { type: 'linear' } },
  ] }]
  scene.layers = [layer]; scene.timelines = [timeline]
  return scene
}

/** Purpose-built browser controls. Repeated flushSync commits model independent
 * visual edits arriving before a frame; assertions use actual draw accounting
 * and full RGBA comparison, not React render counts or DOM-count proxies. */
function Host({ fourSeasons }: { fourSeasons: ChronoScene }) {
  const [scene, setScene] = useState(smallScene), [timeMs, setTime] = useState(0)
  const [width, setWidth] = useState(482), [ghost, setGhost] = useState(false)
  const [pan, setPan] = useState(0), [zoom, setZoom] = useState(1)
  const [mounted, setMounted] = useState(true), [running, setRunning] = useState(false)
  const [report, setReport] = useState<unknown>(null)
  const variant = new URLSearchParams(location.search).get('variant') ?? 'after'
  const drawSamples = () => samples.filter(sample => sample.stage === 'viewport')
  const reset = () => { samples.length = 0; armed = true }
  const run = async () => {
    setRunning(true)
    const results: unknown[] = []
    try {
      for (const [name, input] of [['simple', smallScene()], ['four-seasons', fourSeasons]] as const) {
        flushSync(() => { setScene(input); setTime(0); setWidth(482); setGhost(false); setPan(0); setZoom(1); setMounted(true) })
        await frames(5)
        reset()
        for (let i = 1; i <= 20; i++) flushSync(() => setTime(i * input.composition.durationMs / 40))
        await frames(3)
        const burst = drawSamples().slice(), evaluations = samples.filter(sample => sample.stage === 'evaluation').length
        assert(burst.length === (variant === 'after' ? 1 : 20), `${name}: unexpected burst draws ${burst.length}`)
        const hash = await comparePixels(input, input.composition.durationMs / 2)
        const idleBefore = drawSamples().length
        await frames(8)
        assert(drawSamples().length === idleBefore, `${name}: idle drawing continued`)
        reset()
        flushSync(() => setTime(input.composition.durationMs * .75))
        await frames(3)
        const seekHash = await comparePixels(input, input.composition.durationMs * .75)
        flushSync(() => setWidth(280)); await frames(5)
        assert(drawSamples().length >= 2, `${name}: resize did not redraw while paused`)
        flushSync(() => { setPan(-53); setZoom(1.4) }); await frames(5)
        const panZoomHash = await pixelHash(document.querySelector<HTMLCanvasElement>('[data-viewport-canvas]')!)
        const resources = samples.map(sample => sample.knownBytes)
        assert(resources.every(bytes => bytes <= 512 * 1024 * 1024), `${name}: known resource guard exceeded`)
        reset()
        flushSync(() => setTime(1))
        flushSync(() => setMounted(false))
        const atUnmount = drawSamples().length
        await frames(5)
        assert(drawSamples().length === atUnmount, `${name}: draw survived unmount`)
        if (variant === 'after') assert(atUnmount === 0, `${name}: cancelled task drew before a frame`)
        results.push({ name, passed: true, sourceLayers: input.layers.length, burstDraws: burst.length,
          evaluationPasses: evaluations, burstDrawMs: burst.reduce((n, sample) => n + sample.ms, 0),
          drawSamples: burst, hash, seekHash, panZoomHash, idleDraws: 0, knownGuardBytes: 512 * 1024 * 1024,
          peakSampledKnownBytes: Math.max(0, ...resources), cancelledDrawsAfterUnmount: 0 })
      }
      // Small ghost case checks the moved adapter's ordering on actual pixels.
      const input = smallScene()
      flushSync(() => { setScene(input); setTime(24000); setWidth(482); setGhost(true); setPan(0); setZoom(1); setMounted(true) })
      await frames(5)
      assert(document.querySelector('canvas')!.width === 480, 'Remount did not restore backing dimensions')
      const ghostHash = await pixelHash(document.querySelector<HTMLCanvasElement>('[data-viewport-canvas]')!)
      setReport({ passed: true, variant, results, ghostHash, environment: { userAgent: navigator.userAgent,
        width: innerWidth, height: innerHeight, dpr: devicePixelRatio } })
    } catch (error) { setReport({ passed: false, variant, results, error: String(error) }) }
    finally { armed = false; setRunning(false) }
  }
  return <main style={{ background: '#090d18', color: '#e2e8f0', minHeight: '100vh', padding: 20, fontFamily: 'sans-serif' }}>
    <h1>Viewport scheduling acceptance · {variant}</h1>
    <p>Real runtime and drawing hooks · isolated fixture · 512 MiB known-resource guard</p>
    <button disabled={running} onClick={run}>Run scheduling checks</button>
    <button disabled={running} onClick={() => { setScene(fourSeasons); setTime(36000); setWidth(482); setGhost(false); setPan(0); setZoom(1); setMounted(true) }}>View Four Seasons</button>
    <p>{scene.layers.length} layers · {timeMs} ms · {mounted ? 'mounted' : 'unmounted'}</p>
    {mounted && <Subject scene={scene} timeMs={timeMs} width={width} ghost={ghost} pan={pan} zoom={zoom} />}
    <pre id="scheduling-report" style={{ whiteSpace: 'pre-wrap' }}>{report ? JSON.stringify(report, null, 2) : running ? 'Running…' : 'Ready'}</pre>
  </main>
}

/** Reference uses the same synchronous native renderer and evaluated timeline;
 * readback/hashing is outside measured viewport work. Full detail and clean
 * frame match the test subject's profile; both canvases are released by owner. */
async function comparePixels(scene: ChronoScene, timeMs: number): Promise<string> {
  const actual = document.querySelector<HTMLCanvasElement>('[data-viewport-canvas]')!
  const reference = document.createElement('canvas')
  reference.width = actual.width; reference.height = actual.height
  try {
    canvasRenderer.render(reference.getContext('2d')!, scene, timeMs, null, new Map(), { renderMode: 'preview' })
    const [a, b] = await Promise.all([actual, reference].map(pixelHash))
    assert(a === b, `Last committed frame pixels differ: ${a} / ${b}`)
    return a
  } finally { reference.width = reference.height = 0 }
}
/** Full RGBA identity; readback is outside timed viewport work. */
async function pixelHash(canvas: HTMLCanvasElement): Promise<string> {
  const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}
/** Bounded browser frame turns, with no production observer or timer loop. */
async function frames(count: number) {
  for (let i = 0; i < count; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }

void fetch('four-seasons.chorono.json').then(response => {
  if (!response.ok) throw new Error('Missing Four Seasons fixture')
  return response.json()
}).then(scene => createRoot(document.getElementById('app')!).render(<Host fourSeasons={scene} />))
