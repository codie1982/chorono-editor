import { useEffect, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import Canvas from '@/components/SceneCanvas'
import ReferenceCanvas from 'canvas-reference'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import type { AssetCache } from '@/app/hooks/useAssetCache'
import { BaselineAssetsBridge } from '@/lib/resources/benchmark/__tests__/BaselineAssetsBridge'
import { evaluateTimelines } from '@/lib/evaluator'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import type { ChronoScene } from '@/lib/types'
import { ProjectResourceMonitor } from '@/lib/resources/monitor/ProjectResourceMonitor'
import { summarizeNumbers } from '@/lib/resources/performance/sampleStatistics'
import { DEFAULT_BASELINE_PROTOCOL } from '@/lib/resources/benchmark/types'
import { VisibleTimeClock } from '@/lib/resources/benchmark/VisibleTimeClock'
import { boundsPreparationCount, resetBoundsPreparation } from './boundsPreparationProbe'

type Side = 0 | 1
interface State { timeMs: number; selected: string | null; playing: boolean; preview?: boolean }
const panes = [document.createElement('section'), document.createElement('section')]
const roots = panes.map(pane => createRoot(pane)), selectedIds = new Set<string>()
const times = [0, 6000, 12000, 24000, 36000, 47999]

/** Actual editor canvas, commands, snap and viewport hooks; shared ready asset
 * pins are supplied by the existing production preparation bridge. Neither
 * localStorage nor a connected user document is touched. */
function Subject({ scene, assets, side, state }: { scene: ChronoScene; assets: AssetCache; side: Side; state: State }) {
  const editor = useEditorState(scene), snap = useSnapSettings()
  const overrides = useMemo(() => evaluateTimelines(scene.timelines, state.timeMs), [scene, state.timeMs])
  useEffect(() => { snap.setEnabled(false) }, []) // test profile: clean artboard
  const Component = side ? Canvas : ReferenceCanvas
  return <><Component scene={editor.scene} editor={editor} timeMs={state.timeMs} assets={assets} snap={snap}
    selectedLayerId={state.selected} selectedLayerIds={selectedIds} onSelectLayer={() => {}}
    overrides={overrides} isPlaying={state.playing} previewMode={state.preview} toolMode="select" />
    <button hidden data-history="undo" onClick={editor.undo}>Undo fixture edit</button>
    <button hidden data-history="redo" onClick={editor.redo}>Redo fixture edit</button></>
}

/** One synchronous real React update. The scalar preparation counter is read
 * outside timing. Scheduled canvas painting happens on the following RAF and
 * is deliberately not mislabelled as synchronous component time. */
function commit(side: Side, scene: ChronoScene, assets: AssetCache, state: State) {
  resetBoundsPreparation()
  const start = performance.now()
  flushSync(() => roots[side].render(<Subject scene={scene} assets={assets} side={side} state={state} />))
  const ms = performance.now() - start
  return { ms, preparations: boundsPreparationCount() }
}

/** Animated small fixture for actual selection, rulers and hover regression. */
function smallScene(): ChronoScene {
  const scene = emptyScene(), shape = newRectLayer(), timeline = newTimeline()
  shape.id = 'selected'; shape.transform.x = 80; shape.transform.y = 70; shape.size = { width: 100, height: 60 }
  timeline.tracks = [{ target: 'layers.selected.transform.x', keyframes: [
    { id: 'a', timeMs: 0, value: 80, easing: { type: 'linear' } },
    { id: 'b', timeMs: 1000, value: 180, easing: { type: 'linear' } },
  ] }]
  return { ...scene, layers: [shape], timelines: [timeline], composition: { ...scene.composition, width: 480, height: 270 } }
}

/** Exercise visible old/current DOM and actual Canvas output. No tolerance or
 * expected geometry implementation is duplicated in the test. */
async function functionalChecks(assets: AssetCache) {
  const scene = smallScene(), rows: object[] = []
  for (const playing of [false, true]) {
    const counts = [0, 1].map(side => commit(side as Side, scene, assets, { timeMs: playing ? 600 : 500, selected: 'selected', playing }).preparations)
    await frames(4)
    const selection = panes.map(pane => pane.querySelector<HTMLElement>('[data-testid="selection-frame"]')?.getAttribute('style') ?? null)
    assert(playing ? selection.every(value => value === null) : selection[0] !== null && selection[0] === selection[1], 'Selection frame parity failed')
    const ruler = panes.map(pane => Array.from(pane.querySelectorAll('.border-dashed')).map(element => element.getAttribute('style')))
    assert(ruler[0].length === 4 && JSON.stringify(ruler[0]) === JSON.stringify(ruler[1]), 'Live ruler extent parity failed')
    assert(counts.every(count => count >= 1), 'Visible selected rulers did not prepare bounds')
    rows.push({ case: playing ? 'selected-playback-rulers' : 'selected-paused', preparations: counts, selection, ruler: ruler[0], pixels: await comparePixels() })
  }
  for (const pane of panes) {
    click(pane, 'View options'); await frames(1); click(pane, 'Show ruler'); click(pane, 'View options')
  }
  const hidden = [0, 1].map(side => commit(side as Side, scene, assets, { timeMs: 700, selected: 'selected', playing: true }).preparations)
  assert(hidden[0] >= 1 && hidden[1] === 0, 'No-consumer selected playback still prepared bounds')
  await frames(3); rows.push({ case: 'selected-playback-rulers-off', preparations: hidden, pixels: await comparePixels() })
  for (const side of [0, 1] as const) {
    commit(side, scene, assets, { timeMs: 800, selected: null, playing: false })
    const canvas = panes[side].querySelector('canvas')!, rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + 180, clientY: rect.top + 90 }))
  }
  await frames(4)
  const hover = panes.map(pane => pane.querySelector('.hover-preview-in')?.getAttribute('style'))
  assert(hover[0] && hover[0] === hover[1], 'Hover geometry parity failed')
  rows.push({ case: 'live-hover', style: hover[0] })
  const preview = [0, 1].map(side => commit(side as Side, scene, assets, { timeMs: 900, selected: 'selected', playing: false, preview: true }).preparations)
  await frames(3)
  assert(preview[0] >= 1 && preview[1] === 0, 'Preview without visible bounds consumer still prepared bounds')
  rows.push({ case: 'selected-preview-rulers-off', preparations: preview, pixels: await comparePixels() })
  for (const side of [0, 1] as const) commit(side, scene, assets, { timeMs: 950, selected: 'selected', playing: false })
  await frames(3)
  const resized = []
  for (const pane of panes) {
    const frame = pane.querySelector<HTMLElement>('[data-testid="selection-frame"]')!
    const handle = Array.from(frame.querySelectorAll<HTMLElement>('[style]')).find(element => element.style.left === '100px' && element.style.top === '60px')!
    assert(handle, 'Resize handle did not return after preview')
    const rect = handle.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
    flushSync(() => handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y })))
    flushSync(() => window.dispatchEvent(new PointerEvent('pointermove', { clientX: x + 20, clientY: y + 10 })))
    await frames(2)
    const live = pane.querySelector<HTMLElement>('[data-testid="selection-frame"]')!
    assert(live.style.width === '120px' && live.style.height === '70px', 'Live resize preview geometry is stale')
    resized.push(live.getAttribute('style'))
    flushSync(() => window.dispatchEvent(new PointerEvent('pointerup', { clientX: x + 20, clientY: y + 10 })))
    await frames(2)
  }
  assert(resized[0] === resized[1], 'Resize preview parity failed')
  rows.push({ case: 'live-resize-and-commit', style: resized[0], pixels: await comparePixels() })
  for (const [history, width] of [['undo', '100px'], ['redo', '120px']] as const) {
    for (const pane of panes) flushSync(() => pane.querySelector<HTMLButtonElement>(`[data-history="${history}"]`)!.click())
    await frames(3)
    assert(panes.every(pane => pane.querySelector<HTMLElement>('[data-testid="selection-frame"]')?.style.width === width), `${history} did not invalidate geometry`)
    rows.push({ case: history, width, pixels: await comparePixels() })
  }
  assert(scene.layers[0].size!.width === 100, 'Test source scene was mutated')
  return rows
}

/** Read the full actual canvas buffers outside measured commits. */
async function comparePixels() {
  const hashes = await Promise.all(panes.map(async pane => {
    const canvas = pane.querySelector('canvas')!, bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  }))
  assert(hashes[0] === hashes[1], `Canvas pixel mismatch: ${hashes}`)
  return hashes[0]
}

/** Test-only UI button dispatch through mounted real React controls. */
function click(pane: HTMLElement, label: string) {
  const button = Array.from(pane.querySelectorAll('button')).find(button => button.title === label || button.textContent?.includes(label))
  assert(button, `Missing real UI button: ${label}`); flushSync(() => button.click())
}
/** Visible RAF turns, with no arbitrary sleeps or production timer additions. */
async function frames(count: number) { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame) }
/** Failed acceptance is an incomplete report, never a successful zero sample. */
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }

/** Own the isolated QA roots and ready font/media scope. Functional checks run
 * before the visible 60s warmup and 60 bounded AB/BA pairs; actual native drawing
 * occurs between measured commits. Reports retain exact source/build identities
 * and fail on missing readiness, changed pixels or exceeded memory guards.
 * The final real canvas stays mounted for visual review; closing the test page
 * owns teardown. This is not long-session, player-transport or OS/RSS acceptance. */
async function main() {
  document.body.innerHTML = '<style>body{background:#101827;color:#e5edf8;font:14px system-ui;padding:20px}#panes{display:flex;gap:16px;flex-wrap:wrap}section{position:relative;display:flex;width:960px;height:600px;border:1px solid #475569}pre{white-space:pre-wrap}#report{display:none}</style><h1>Editor geometry · real SceneCanvas</h1><p>Frozen reference / current · 512 MiB known-resource guard · no connected document</p><button id="run" disabled>Run geometry checks</button><p id="status">Preparing</p><pre id="summary"></pre><div id="panes"></div><div id="assets" hidden></div><pre id="report"></pre>'
  panes.forEach(pane => document.getElementById('panes')!.append(pane))
  const scene: ChronoScene = await (await fetch('four-seasons.chorono.json')).json()
  const build = await (await fetch('editor-geometry-sources.json')).json(), bridge = createRoot(document.getElementById('assets')!)
  const assets = await new Promise<AssetCache>((resolve, reject) => bridge.render(<BaselineAssetsBridge scene={scene} onReady={resolve} onError={reject} />))
  const monitor = new ProjectResourceMonitor({ scene, media: assets, isPlaying: true }), protocol = DEFAULT_BASELINE_PROTOCOL
  const button = document.getElementById('run') as HTMLButtonElement, status = document.getElementById('status')!
  button.disabled = false; status.textContent = 'Ready'
  button.onclick = async () => {
    button.disabled = true
    const samples: { timeMs: number; first: Side; before: ReturnType<typeof commit>; after: ReturnType<typeof commit>; knownBytes: number }[] = [], checkpoints: object[] = []
    const clock = new VisibleTimeClock(!document.hidden, performance.now()), visibility = () => clock.setVisible(!document.hidden, performance.now())
    document.addEventListener('visibilitychange', visibility)
    try {
      const functional = await functionalChecks(assets)
      for (const root of roots) flushSync(() => root.render(null))
      for (const side of [0, 1] as const) commit(side, scene, assets, { timeMs: 0, selected: null, playing: true })
      await frames(4)
      const started = clock.read(performance.now()); let cycle = 0
      while (clock.read(performance.now()) - started < protocol.warmupMs) {
        const order: Side[] = cycle % 2 ? [1, 0] : [0, 1]
        for (const side of order) commit(side, scene, assets, { timeMs: times[cycle % 6], selected: null, playing: true })
        cycle++; status.textContent = `Warming ${Math.round(clock.read(performance.now()) - started)} / 60000 ms`; await frames(1)
      }
      for (let repetition = 0; repetition < 10; repetition++) for (let point = 0; point < 6; point++) {
        const first: Side = (repetition + point) % 2 ? 1 : 0, rows = []
        for (const side of [first, 1 - first] as Side[]) rows[side] = commit(side, scene, assets, { timeMs: times[point], selected: null, playing: true })
        await frames(2)
        const snapshot = monitor.getSnapshot()
        assert(snapshot.knownBytes <= protocol.knownByteLimit && (snapshot.browser.heap?.used ?? 0) <= protocol.heapByteLimit, 'Memory guard exceeded')
        assert(rows[0].preparations >= 1 && rows[1].preparations === 0, 'Unexpected bounds preparation count')
        samples.push({ timeMs: times[point], first, before: rows[0], after: rows[1], knownBytes: snapshot.knownBytes })
        status.textContent = `Sampling ${samples.length}/60`
      }
      for (const timeMs of times) {
        for (const side of [0, 1] as const) commit(side, scene, assets, { timeMs, selected: null, playing: true })
        await frames(3); checkpoints.push({ timeMs, rgbaSha256: await comparePixels(), equal: true })
      }
      const report = { passed: true, build, protocol, scope: 'Synchronous actual SceneCanvas React commit; RAF painting excluded. Two live canvases share one asset scope.',
        before: summarizeNumbers(samples.map(row => row.before.ms)), after: summarizeNumbers(samples.map(row => row.after.ms)), samples, checkpoints, functional,
        peakSampledKnownBytes: Math.max(...samples.map(row => row.knownBytes)), environment: { userAgent: navigator.userAgent, dpr: devicePixelRatio } }
      document.getElementById('report')!.textContent = JSON.stringify(report, null, 2)
      document.getElementById('summary')!.textContent = JSON.stringify({ passed: true, before: report.before, after: report.after,
        boundsPreparations: [samples.reduce((n, row) => n + row.before.preparations, 0), samples.reduce((n, row) => n + row.after.preparations, 0)],
        checkpoints: checkpoints.length, functionalCases: functional.length, peakSampledKnownBytes: report.peakSampledKnownBytes }, null, 2)
      for (const root of roots) flushSync(() => root.render(null))
      panes[0].style.display = 'none'
      commit(1, scene, assets, { timeMs: 6000, selected: null, playing: true }); await frames(3)
      status.textContent = 'PASS'
    } catch (error) {
      status.textContent = 'FAIL'; document.getElementById('report')!.textContent = JSON.stringify({ passed: false, error: String(error), samples, checkpoints })
    } finally { document.removeEventListener('visibilitychange', visibility) }
  }
}
void main().catch(error => { document.getElementById('status')!.textContent = 'FAIL'; document.getElementById('report')!.textContent = JSON.stringify({ passed: false, error: String(error) }) })
