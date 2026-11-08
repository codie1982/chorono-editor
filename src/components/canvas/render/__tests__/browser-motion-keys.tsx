import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SceneCanvas from '@/components/SceneCanvas'
import TimelinePanel from '@/components/TimelinePanel'
import CurveEditor from '@/components/timeline/CurveEditor'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newRectLayer, newTimeline, newMotionPathLayer } from '@/lib/defaults'
import { DEFAULT_TIMELINE_SETTINGS, type ChronoScene, type Layer, type TimelineSettings } from '@/lib/types'
import { DEFAULT_TIMELINE_GHOST_SETTINGS } from '@/lib/types/editor'
import { evaluateTimelines } from '@/lib/evaluator'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { buildViewportKeyframeCommands } from '@/lib/editor/viewportKeyframes'
import { buildTrajectoryModel, projectTrajectoryPosition } from '@/lib/timeline/trajectory'

type Point = { x: number; y: number }
interface Runtime { editor: EditorStateReturn; selected: Set<string>; layerId: string; timeMs: number; motion: boolean; snap: boolean; route: string }
interface Check { name: string; passed: true; evidence: unknown }
let runtime: Runtime | undefined
let host: HTMLElement
const checks: Check[] = []

/** Inline native source only: sparse y at 500 ms, a reflected animated parent,
 * and an unrelated second timeline catch scope/coordinate/identity regressions. */
function fixture(follow = false): ChronoScene {
  const scene = emptyScene(), hero = newRectLayer(), parent = newRectLayer(), decoy = newRectLayer()
  scene.composition = { ...scene.composition, width: 1000, height: 650, durationMs: 3000 }
  parent.id = 'parent'; parent.name = 'Animated reflected parent'; parent.type = 'group'; parent.size = undefined
  parent.transform = { x: 650, y: 280, anchorX: 0, anchorY: 0, rotationDeg: 20, scaleX: -1.2, scaleY: 0.8 }
  hero.id = 'hero'; hero.name = 'Motion hero'; hero.parentId = parent.id; hero.size = { width: 60, height: 40 }
  hero.transform = { x: 40, y: 0, anchorX: 8, anchorY: 5, rotationDeg: 0, scaleX: 1, scaleY: 1 }
  hero.style = { fill: { type: 'solid', color: '#22c55e', opacity: 100 } }
  decoy.id = 'decoy'; decoy.name = 'Unrelated timeline object'; decoy.transform = { ...decoy.transform, x: 60, y: 500 }
  const active = { ...newTimeline(), id: 'motion', name: 'Motion authoring', durationMs: 3000, loop: true, layerIds: [hero.id], tracks: [
    { target: 'layers.hero.transform.x', keyframes: [
      { id: 'x0', timeMs: 0, value: 40, easing: { type: 'linear' as const } },
      { id: 'x500', timeMs: 500, value: 100, easing: { type: 'easeOut' as const }, tangentMode: 'broken' as const },
      { id: 'x3000', timeMs: 3000, value: 180, easing: { type: 'linear' as const } },
    ] },
    { target: 'layers.hero.transform.y', keyframes: [
      { id: 'y0', timeMs: 0, value: 0, easing: { type: 'linear' as const } },
      { id: 'y3000', timeMs: 3000, value: 100, easing: { type: 'linear' as const } },
    ] },
    { target: 'layers.parent.transform.x', keyframes: [
      { id: 'parent0', timeMs: 0, value: 650, easing: { type: 'linear' as const } },
      { id: 'parent3000', timeMs: 3000, value: 700, easing: { type: 'linear' as const } },
    ] },
  ] }
  const other = { ...newTimeline(), id: 'decoy-timeline', durationMs: 3000, layerIds: [decoy.id], tracks: [
    { target: 'layers.decoy.transform.x', keyframes: [{ id: 'decoy-key', timeMs: 0, value: 75, easing: { type: 'linear' as const } }] },
  ] }
  scene.layers = [parent, hero, decoy]; scene.timelines = [active, other]
  if (follow) {
    const guide = newMotionPathLayer(); guide.id = 'guide'; guide.name = 'Follow source'
    guide.transform = { x: 400, y: 300, anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 }
    guide.path = { closed: false, anchors: [{ x: 0, y: 0 }, { x: 200, y: 80 }] }
    scene.layers.push(guide); hero.followPath = { pathLayerId: guide.id, progress: 0, orientToPath: false }
  }
  return scene
}

/** Real production panels share one editor, key Set and local playhead. The
 * harness only supplies ordinary public callbacks; no key table or drag stub
 * substitutes for TimelinePanel, CurveEditor or SceneCanvas interaction. */
function Subject({ source }: { source: ChronoScene }) {
  const editor = useEditorState(source), assets = useAssetCache(editor.scene.assets), snap = useSnapSettings()
  const [selected, setSelected] = useState(new Set<string>()), [layerId, setLayer] = useState('hero')
  const [timeMs, setTime] = useState(0), [motion, setMotion] = useState(false), [route, setRoute] = useState('')
  const [timelineId, setTimeline] = useState('motion')
  const [tool, setTool] = useState<'select' | 'pen'>('select')
  const [settings, setSettings] = useState<TimelineSettings>({ ...DEFAULT_TIMELINE_SETTINGS, snapEnabled: false, snapToFrame: false, snapToKeyframes: false })
  const selectedLayers = useMemo(() => new Set([layerId]), [layerId])
  const overrides = useMemo(() => evaluateTimelines(editor.scene.timelines, timeMs), [editor.scene.timelines, timeMs])
  useEffect(() => { snap.setEnabled(false) }, [])
  useLayoutEffect(() => { runtime = { editor, selected, layerId, timeMs, motion, snap: snap.settings.enabled, route } })
  return <>
    <nav style={{ display: 'flex', gap: 8, padding: 8 }}>
      <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
      <button onClick={() => setTime(3000)}>Seek endpoint</button>
      <button onClick={() => { const current = editor.getScene().layers.find(layer => layer.id === 'parent')!
        editor.dispatchCommand(makeUpdateLayerCmd(current.id, { ...current, transform: { ...current.transform, x: current.transform.x + 1 } }, current)) }}>Manual parent edit</button>
    </nav>
    <section data-panel="canvas" style={{ display: 'flex', position: 'relative', height: 740, minHeight: 740 }}>
      <SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap} timeMs={timeMs} overrides={overrides}
        selectedLayerId={layerId} selectedLayerIds={selectedLayers} selectedKeyframeIds={selected}
        onSelectLayer={id => { if (id) setLayer(id) }} onSelectKeyframes={setSelected} onSeekKeyframe={setTime}
        selectedTimeline={editor.scene.timelines.find(timeline => timeline.id === timelineId) ?? null}
        onMotionEditingChange={setMotion} onEditMotionTiming={id => setRoute(`progress:${id}`)}
        toolMode={tool} onToolModeChange={value => setTool(value === 'pen' ? 'pen' : 'select')} isPlaying={false}
        buildLayerCommitCommands={changes => buildViewportKeyframeCommands(editor.getScene(), changes, { timelineId, timeMs, autoKeyframe: false })} />
    </section>
    <section data-panel="timeline" style={{ height: 340, minHeight: 340, display: 'flex', flexDirection: 'column' }}>
      <TimelinePanel scene={editor.scene} editor={editor} settings={settings} onSettingsChange={setSettings}
        selectedLayerId={layerId} selectedLayerIds={selectedLayers} selectedTimelineId={timelineId} selectedKfIds={selected}
        currentTimeMs={timeMs} isPlaying={false} playbackSpeed={1} onTimeChange={setTime} onPlayToggle={() => {}}
        onSelectTimeline={setTimeline} onSelectKeyframes={setSelected} onSelectLayer={id => { if (id) setLayer(id) }}
        onToggleLayerFlag={() => {}} onPlaybackSpeedChange={() => {}} ghostSettings={DEFAULT_TIMELINE_GHOST_SETTINGS}
        onGhostUpdate={() => {}} onGhostToggle={() => {}} onGhostPreset={() => {}} />
    </section>
    <section data-panel="curve" style={{ height: 320, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
      <CurveEditor scene={editor.scene} editor={editor} selectedLayerId={layerId} selectedTimelineId={timelineId}
        currentTimeMs={timeMs} onTimeChange={setTime} selectedKfIds={selected} onSelectKeyframes={setSelected} />
    </section>
  </>
}

/** Fail loudly; an absent public control never becomes a successful check. */
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
/** Read after the real React editor has committed. */
function live(): Runtime { assert(runtime, 'Native motion subject did not mount.'); return runtime }
/** Compare full portable source data, including key IDs/easing/other timelines. */
function equal(a: unknown, b: unknown, message: string) { assert(JSON.stringify(a) === JSON.stringify(b), message) }
/** Composition-pixel precision for matrix/evaluator assertions. */
function close(a: number, b: number, message: string) { assert(Number.isFinite(a) && Math.abs(a - b) < 1e-4, `${message}: ${a} != ${b}`) }
/** Wait for actual browser frames, not fixed wall-clock sleeps. */
async function frames(count = 2) { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame) }
/** Resolve a public visible control by exact accessible name or text. */
function control(name: string): HTMLElement {
  const item = Array.from(host.querySelectorAll<HTMLElement>('button,input,select')).find(element =>
    element.getAttribute('aria-label') === name || (element.tagName === 'BUTTON' && element.textContent?.trim() === name))
  assert(item, `Missing public motion control '${name}'.`); return item
}
/** Dispatch a real button click through React's public handler. */
async function click(name: string) { flushSync(() => control(name).click()); await frames() }
/** Native value setter avoids React's value tracker swallowing input changes. */
async function value(name: string, next: string | number) {
  const element = control(name) as HTMLInputElement | HTMLSelectElement
  flushSync(() => { Object.getOwnPropertyDescriptor(element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(element, String(next))
    element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })) })
  await frames()
}
/** Current canvas projection includes actual pan, zoom, layout and DPI policy. */
function client(point: Point): Point {
  const canvas = host.querySelector('canvas')!, rect = canvas.getBoundingClientRect()
  return { x: rect.left + point.x * rect.width / canvas.width, y: rect.top + point.y * rect.height / canvas.height }
}
/** Observable center of a native SVG/DIV mark. */
function center(element: Element): Point { const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } }
/** Real pointer events use the initiating mouse ID, preserving native capture. */
function pointer(target: EventTarget, type: string, point: Point) {
  flushSync(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y })))
}
/** Find an actual viewport node by its explicit local authoring time. */
function node(timeMs: number): Element { const result = host.querySelector(`[data-motion-time-ms="${timeMs}"]`); assert(result, `Missing motion node at ${timeMs}ms.`); return result }
/** Select/seek through the real node; an unmoved pointer must not create undo. */
async function selectNode(timeMs: number) { const element = node(timeMs), point = center(element); pointer(element, 'pointerdown', point); pointer(window, 'pointerup', point); await frames() }
/** Place one Add/Draw point through the real SVG input surface. */
async function place(point: Point) { const surface = host.querySelector('[data-testid="motion-input-surface"]'); assert(surface, 'Missing native motion input surface.'); const p = client(point); pointer(surface, 'pointerdown', p); pointer(window, 'pointerup', p); await frames() }
/** Resolve an authored node using the same explicit domain owner as the UI. */
function model() { return buildTrajectoryModel(live().editor.getScene(), 'motion', 'hero') }
/** Record only after every source/DOM assertion for one case has passed. */
function record(name: string, evidence: unknown) { checks.push({ name, passed: true, evidence }); document.getElementById('checks')!.textContent = checks.map(check => `✓ ${check.name}`).join('\n') }

/** Assert all three actual panels reflect one shared native key selection. */
async function selectionChecks(mount: (source?: ChronoScene) => Promise<void>) {
  await mount(); await selectNode(500)
  assert(live().selected.has('x500') && live().timeMs === 500, 'Viewport selection did not select/seek native x500.')
  assert(host.querySelector('[data-panel="timeline"] [data-kf-id="x500"][aria-pressed="true"]'), 'TimelinePanel did not highlight viewport key.')
  assert(host.querySelector('[data-panel="curve"] [data-curve-key-id="x500"][data-curve-key-selected="true"]'), 'CurveEditor did not highlight viewport key.')
  assert(!live().editor.canUndo, 'Selecting an unmoved key created history.')
  record('viewport selection seeks and highlights Timeline/Curve', { selected: Array.from(live().selected), timeMs: live().timeMs })
  const timeline = host.querySelector('[data-panel="timeline"] [data-kf-id="x3000"]'); assert(timeline, 'Missing real timeline key.')
  flushSync(() => timeline.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))); await frames()
  assert(node(3000).getAttribute('aria-pressed') === 'true', 'Timeline selection did not highlight viewport node.')
  const curve = host.querySelector('[data-panel="curve"] [data-curve-key-id="x0"]'); assert(curve, 'Missing real curve key.')
  const p = center(curve); pointer(curve, 'pointerdown', p); pointer(window, 'pointerup', p); await frames()
  assert(node(0).getAttribute('aria-pressed') === 'true', 'Curve selection did not highlight viewport node.')
  record('Timeline and Curve selection highlight viewport nodes', { selected: Array.from(live().selected) })
}

/** Sparse-axis dragging must survive node identity/capture changes, fill y,
 * retain native x metadata, and move in the reflected parent's own key frame. */
async function sparseDragCheck(mount: (source?: ChronoScene) => Promise<void>) {
  await mount(); const before = structuredClone(live().editor.getScene()), oldNode = model().nodes.find(item => item.timeMs === 500)!
  assert(!oldNode.yKey, 'Sparse fixture unexpectedly has a y500 key.')
  const element = node(500), start = center(element), end = client({ x: oldNode.world.x + 18, y: oldNode.world.y - 11 })
  pointer(element, 'pointerdown', start); pointer(window, 'pointermove', end)
  assert(live().editor.isTransactionActive(), 'Sparse key preview lost its active pointer transaction.')
  pointer(window, 'pointerup', end); await frames()
  const after = live().editor.getScene(), next = model().nodes.find(item => item.timeMs === 500)!
  close(next.world.x - oldNode.world.x, 18, 'Sparse drag world X'); close(next.world.y - oldNode.world.y, -11, 'Sparse drag world Y')
  assert(next.xKey?.id === 'x500' && next.yKey, 'Sparse drag replaced x identity or failed to fill y.')
  const track = after.timelines[0].tracks.find(item => item.target === 'layers.hero.transform.x')!
  equal(track.keyframes.find(key => key.id === 'x500')?.easing, before.timelines[0].tracks[0].keyframes[1].easing, 'Dragging erased x easing.')
  equal(after.timelines[1], before.timelines[1], 'Dragging changed the decoy timeline.')
  equal(after.layers, before.layers, 'Dragging native keys changed raw source layers.')
  await click('Undo'); equal(live().editor.getScene(), before, 'Sparse key undo did not restore exact source.')
  assert(!live().editor.canUndo && live().editor.canRedo, 'Sparse key drag was not one undo.')
  record('sparse reflected-parent drag fills y with one undo', { before: oldNode.world, after: next.world, keyIds: next.keyIds })
}

/** Numeric inputs retime/value one node through native source commands. */
async function numericCheck(mount: (source?: ChronoScene) => Promise<void>) {
  await mount(); await selectNode(500); const before = structuredClone(live().editor.getScene()), point = model().nodes.find(item => item.timeMs === 500)!.world
  await value('Motion key World X', point.x + 15); await value('Motion key World Y', point.y - 5); await value('Motion key Time (ms)', 750)
  await click('Apply key values'); const after = model().nodes.find(item => item.timeMs === 750)
  assert(after?.xKey?.id === 'x500' && after.yKey, 'Numeric edit lost ID or sparse axis.')
  close(after.world.x, point.x + 15, 'Numeric world X'); close(after.world.y, point.y - 5, 'Numeric world Y')
  close(live().timeMs, 750, 'Numeric retime did not seek')
  await click('Undo'); equal(live().editor.getScene(), before, 'Numeric edit required multiple undo steps.')
  assert(!live().editor.canUndo, 'Numeric edit left extra history.')
  record('numeric world values and local retime are atomic', { destinationMs: 750, world: after.world })
}

/** Add at the exact loop endpoint must update end keys and render that pose,
 * rather than wrapping body/pointer interpretation to the first frame. */
async function endpointCheck(mount: (source?: ChronoScene) => Promise<void>) {
  await mount(); await click('Seek endpoint'); await click('Add position key'); await value('Motion key advance', 0)
  const target = { x: 470, y: 370 }; await place(target)
  const current = model(), end = current.nodes.find(item => item.timeMs === 3000)!
  close(end.world.x, target.x, 'Loop endpoint X'); close(end.world.y, target.y, 'Loop endpoint Y')
  assert(end.keyIds.includes('x3000') && end.keyIds.includes('y3000'), 'Endpoint edit replaced existing key IDs.')
  close(live().timeMs, 3000, 'Endpoint playhead wrapped')
  const canvas = host.querySelector('canvas')!, rgba = canvas.getContext('2d')!.getImageData(target.x, target.y, 1, 1).data
  assert(rgba[1] > rgba[0] + 40 && rgba[1] > rgba[2] + 30, `Actual canvas did not render green hero at the exact endpoint: ${Array.from(rgba)}`)
  record('Add Key edits and renders exact loop endpoint', { world: end.world, keyIds: end.keyIds, rgba: Array.from(rgba) })
}

/** Enter an explicit three-point route without touching editor source. */
async function draftRoute(mode: 'append' | 'replace-range', startMs: number, endMs: number) {
  await click('Draw motion'); await value('Draw motion Start ms', startMs); await value('Draw motion End ms', endMs)
  await value('Draw motion existing keys', mode)
  const points = [{ x: 340, y: 360 }, { x: 420, y: 430 }, { x: 500, y: 350 }]
  for (const point of points) await place(point)
  return points
}

/** Draft Cancel/source purity and both explicit route policies use the actual
 * drawing controls; Apply must keep stable outside-range source records. */
async function drawingChecks(mount: (source?: ChronoScene) => Promise<void>) {
  await mount(); const before = structuredClone(live().editor.getScene())
  await draftRoute('append', 1200, 2200); equal(live().editor.getScene(), before, 'Route preview mutated source.')
  assert(!live().editor.canUndo, 'Route preview created history.'); await click('Cancel route')
  equal(live().editor.getScene(), before, 'Cancel route changed source.')
  record('three-point route preview and Cancel preserve source', { sourceUnchanged: true })
  const points = await draftRoute('append', 1200, 2200); await click('Apply route')
  for (let i = 0; i < points.length; i++) { const item = model().nodes.find(node => node.timeMs === 1200 + i * 500)!
    close(item.world.x, points[i].x, 'Append route X'); close(item.world.y, points[i].y, 'Append route Y') }
  equal(live().editor.getScene().timelines[1], before.timelines[1], 'Append route touched decoy timeline.')
  await click('Undo'); equal(live().editor.getScene(), before, 'Append route undo failed.')
  assert(!live().editor.canUndo, 'Append route created multiple undo entries.')
  record('append route commits three explicit local times once', { times: [1200, 1700, 2200], points })
  await mount(); const original = structuredClone(live().editor.getScene())
  const replacement = await draftRoute('replace-range', 0, 1000); await click('Apply route')
  for (let i = 0; i < replacement.length; i++) { const item = model().nodes.find(node => node.timeMs === i * 500)!
    close(item.world.x, replacement[i].x, 'Replacement route X'); close(item.world.y, replacement[i].y, 'Replacement route Y') }
  const remaining = live().editor.getScene().timelines[0].tracks[0].keyframes.find(key => key.timeMs === 3000)
  equal(remaining, original.timelines[0].tracks[0].keyframes.find(key => key.timeMs === 3000), 'Replace range changed an outside key.')
  await click('Undo'); equal(live().editor.getScene(), original, 'Replace range failed exact undo.')
  record('replace-range route preserves outside native keys', { replacedRange: [0, 1000], outsideId: remaining?.id })
}

/** Duplicate/delete are source commands; keyboard Escape cancels a genuine
 * in-flight sparse drag, including its provisional missing-axis key. */
async function editCancelChecks(mount: (source?: ChronoScene) => Promise<void>) {
  await mount(); await selectNode(500); const before = structuredClone(live().editor.getScene())
  await value('Duplicate motion keys offset ms', 250); await click('Duplicate keys')
  assert(model().nodes.some(item => item.timeMs === 750), 'Duplicate did not create offset node.')
  await click('Delete keys'); equal(live().editor.getScene(), before, 'Deleting duplicates changed original keys.')
  record('duplicate/delete preserve original IDs and timing', { original: 'x500', duplicateTimeMs: 750 })
  await mount(); const baseline = structuredClone(live().editor.getScene()), item = model().nodes.find(entry => entry.timeMs === 500)!
  const element = node(500); pointer(element, 'pointerdown', center(element)); pointer(window, 'pointermove', client({ x: item.world.x + 22, y: item.world.y + 9 }))
  assert(live().editor.isTransactionActive(), 'Escape fixture never started a drag.')
  assert(!element.isConnected, 'Sparse-axis preview did not replace the original one-axis node as expected.')
  // The original SVG node is detached once its missing y key is inserted.
  // Dispatch keyboard input where a real browser sends it after that remount,
  // while the shared session retains capture on the stable mounted canvas.
  const keyboardTarget = document.activeElement?.isConnected ? document.activeElement : host.querySelector('canvas')
  assert(keyboardTarget, 'Escape fixture has no connected keyboard target.')
  flushSync(() => keyboardTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))); await frames()
  assert(!live().editor.isTransactionActive(), 'Escape left motion transaction active.')
  equal(live().editor.getScene(), baseline, 'Escape did not restore key source.')
  assert(!live().editor.canUndo, 'Canceled key drag created history.')
  record('Escape cancels sparse motion preview without history', { restored: true })
}

/** A manual source edit invalidates the prepared drawing plan; readonly Follow
 * Path actions route to real source selection/timing callbacks without x/y writes. */
async function sourceGuardChecks(mount: (source?: ChronoScene) => Promise<void>) {
  await mount(); await draftRoute('append', 1200, 2200); await click('Manual parent edit')
  const afterManual = structuredClone(live().editor.getScene())
  assert((control('Apply route') as HTMLButtonElement).disabled, 'Stale route remained applicable after parent edit.')
  assert(host.textContent?.includes('scene changed'), 'Stale source warning was not visible.')
  await click('Apply route'); equal(live().editor.getScene(), afterManual, 'Stale Apply overwrote manual edit.')
  record('manual parent edit invalidates route draft', { staleApplyDisabled: true })
  await mount(fixture(true))
  assert((control('Add position key') as HTMLButtonElement).disabled, 'Follow Path incorrectly allowed x/y source editing.')
  const before = structuredClone(live().editor.getScene()); await click('Edit Path Source')
  assert(live().layerId === 'guide', 'Follow Path source route did not select guide.')
  equal(live().editor.getScene(), before, 'Opening Follow Path source changed the scene.')
  await mount(fixture(true)); await click('Edit Progress Timing')
  assert(live().route === 'progress:hero', 'Progress timing action did not use public route callback.')
  record('Follow Path stays readonly and routes to geometry/timing', { sourceLayer: 'guide', timingRoute: live().route })
}

/** Public isolated runner leaves all actual panels mounted on failure and
 * exposes serializable evidence/source manifest. It never connects to a user
 * editor, replaces browser APIs or installs an application route. */
async function main() {
  document.body.innerHTML = '<style>body{margin:16px;background:#0f172a;color:#e2e8f0;font:14px system-ui}button{padding:7px 11px;background:#1d4ed8;color:white;border:1px solid #64748b;border-radius:5px}button:disabled{opacity:.4}#motion-host{width:1180px;max-width:100%;border:1px solid #475569;display:flex;flex-direction:column}pre{white-space:pre-wrap;overflow-wrap:anywhere}#checks{color:#86efac}</style><h1>Motion key native acceptance</h1><p>Actual SceneCanvas + TimelinePanel + CurveEditor · isolated inline sources · connected documents unchanged</p><button id="run-motion-keys">Run motion key checks</button><p id="status">Ready</p><pre id="checks"></pre><section id="motion-host"></section><pre id="report">No checks run.</pre>'
  host = document.getElementById('motion-host')!; const root = createRoot(host)
  const button = document.getElementById('run-motion-keys') as HTMLButtonElement; let generation = 0
  const mount = async (source = fixture()) => { runtime = undefined; flushSync(() => root.render(<Subject key={++generation} source={source} />)); await frames(4)
    assert(!live().snap, 'Fixture snapping did not disable.'); await click('Motion Keys'); assert(live().motion, 'Motion mode did not activate.') }
  const inspect = document.createElement('button'); inspect.textContent = 'Open editable fixture'; button.after(inspect)
  inspect.onclick = async () => { await mount(); await selectNode(500) }
  button.onclick = async () => {
    button.disabled = inspect.disabled = true; checks.length = 0; document.getElementById('checks')!.textContent = ''
    const status = document.getElementById('status')!, started = performance.now(); let manifest: unknown
    try {
      status.textContent = 'Running real motion-key controls…'
      const metadata = await (await fetch('motion-key-interactions-sources.json')).json()
      manifest = { sourceManifest: 'motion-key-interactions-sources.json', bundleSha256: metadata.bundleSha256, sourceFiles: metadata.sources.length }
      await selectionChecks(mount); await sparseDragCheck(mount); await numericCheck(mount); await endpointCheck(mount)
      await drawingChecks(mount); await editCancelChecks(mount); await sourceGuardChecks(mount)
      status.textContent = `PASS · ${checks.length} checks`
      document.getElementById('report')!.textContent = JSON.stringify({ passed: true, checks, manifest, elapsedMs: performance.now() - started,
        dpr: devicePixelRatio, userAgent: navigator.userAgent, scope: 'Native DOM events through actual three panels; no connected user document.' }, null, 2)
    } catch (error) { status.textContent = 'FAIL'; document.getElementById('report')!.textContent = JSON.stringify({ passed: false, error: String(error), checks, manifest }, null, 2) }
    finally { button.disabled = inspect.disabled = false }
  }
}
void main().catch(error => { document.body.textContent = `Motion acceptance setup failed: ${String(error)}` })
