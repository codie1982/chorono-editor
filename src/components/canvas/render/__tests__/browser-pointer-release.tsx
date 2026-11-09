import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SceneCanvas from '@/components/SceneCanvas'
import PropertiesPanel from '@/components/PropertiesPanel'
import type { ToolMode } from '@/components/TopToolbar/ToolGroup'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { readSceneGuides } from '@/lib/editor/guides/SceneGuides'
import type { ChronoScene, Layer } from '@/lib/types'

type Point = { x: number; y: number }
interface Runtime { editor: EditorStateReturn; selected: string | null; mode: ToolMode; snap: boolean }
interface Check { name: string; passed: boolean; evidence: unknown }
let host: HTMLElement, live: Runtime | undefined
const checks: Check[] = [], trace: unknown[] = []

/** Deterministic source and actual production adapters, without a connected
 * user document. Geometry fits completely within the composition. */
function source(): ChronoScene {
  const base = emptyScene(), shape = (id: string, x: number, y: number): Layer => ({ ...newRectLayer(), id, name: id,
    size: { width: 80, height: 60 }, transform: { x, y, anchorX: 40, anchorY: 30, scaleX: 1, scaleY: 1, rotationDeg: 0 } })
  return { ...base, composition: { ...base.composition, width: 640, height: 420, durationMs: 2000, backgroundColor: '#ffffff' },
    layers: [shape('moving', 90, 90), shape('fixed', 430, 280)],
    timelines: [{ ...newTimeline(), id: 'main', durationMs: 2000, tracks: [], autoplay: false }] }
}

/** The mode buttons intentionally use ordinary click callbacks: switching
 * tools must not be mistaken for a missing pointer-up from the earlier drag. */
function Subject({ properties = false }: { properties?: boolean }) {
  const editor = useEditorState(source()), assets = useAssetCache(editor.scene.assets), snap = useSnapSettings()
  const [selected, select] = useState<string | null>(properties ? 'moving' : null), [mode, setMode] = useState<ToolMode>('select')
  const ids = useMemo(() => new Set(selected ? [selected] : []), [selected])
  const disarmLoss = useRef<(() => void) | undefined>()
  useEffect(() => () => disarmLoss.current?.(), [])
  useEffect(() => { snap.setEnabled(false) }, [])
  useLayoutEffect(() => { live = { editor, selected, mode, snap: snap.settings.enabled } })
  useEffect(() => {
    const observe = (event: PointerEvent) => {
      trace.push({ event: event.type, trusted: event.isTrusted, pointerId: event.pointerId, buttons: event.buttons,
        point: [event.clientX, event.clientY], target: event.target instanceof Element ? event.target.tagName : null,
        sourceRevision: editor.getRevision(), transaction: editor.isTransactionActive(), layers: editor.getScene().layers.map(layer => ({ id: layer.id, transform: layer.transform })) })
      if (trace.length > 60) trace.shift()
      document.getElementById('trace')!.textContent = JSON.stringify(trace, null, 2)
    }
    const events = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'] as const
    events.forEach(type => window.addEventListener(type, observe, true))
    return () => events.forEach(type => window.removeEventListener(type, observe, true))
  }, [editor.getScene, editor.getRevision, editor.isTransactionActive])
  return <><nav><button onClick={() => setMode('select')}>Select tool</button><button onClick={() => setMode('pan')}>Pan tool</button>
    <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
    <button onClick={() => { const viewport = host.querySelector('[data-testid="canvas-viewport"]'); assert(viewport, 'Missing viewport')
      viewport.addEventListener('pointerup', event => event.stopPropagation(), { once: true }) }}>Consume next pointer-up bubble</button>
    <button onClick={() => select(null)}>Deselect</button>
    <button onClick={() => {
      disarmLoss.current?.()
      const release = (event: PointerEvent) => {
        const element = canvas()
        if (!element.hasPointerCapture(event.pointerId)) return
        disarmLoss.current?.(); element.dataset.testCaptureReleased = 'true'
        element.releasePointerCapture(event.pointerId)
      }
      window.addEventListener('pointermove', release, true)
      disarmLoss.current = () => { window.removeEventListener('pointermove', release, true); disarmLoss.current = undefined }
    }}>Release capture during next drag</button></nav>
    <output>Mode {mode} · Layers {editor.scene.layers.length} · Undo {String(editor.canUndo)} · Transaction {String(editor.isTransactionActive())}</output>
    <div style={{ display: 'flex', height: 650 }}><section data-panel="canvas" style={{ display: 'flex', position: 'relative', flex: 1, minWidth: 0 }}>
      <SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap} selectedLayerId={selected} selectedLayerIds={ids}
        timeMs={0} toolMode={mode} panMode={mode === 'pan'} onPanModeChange={next => setMode(next ? 'pan' : 'select')}
        onToolModeChange={setMode} onSelectLayer={id => select(id)} selectedTimeline={editor.scene.timelines[0]} />
    </section>{properties && <aside data-panel="properties" style={{ display: 'flex', width: 280, minHeight: 0 }}>
      <PropertiesPanel layer={editor.scene.layers.find(layer => layer.id === selected) ?? null} scene={editor.scene}
        composition={editor.scene.composition} allLayers={editor.scene.layers} allTimelines={editor.scene.timelines}
        parameters={editor.scene.parameters} dispatchCommand={editor.dispatchCommand} currentTimeMs={0} selectedTimelineId="main"
        onLayerChange={next => { const previous = editor.getScene().layers.find(layer => layer.id === next.id)
          if (previous) editor.dispatchCommand(makeUpdateLayerCmd(next.id, next, previous)) }} onCompositionChange={() => {}} />
    </aside>}</div><pre data-testid="pointer-source">{JSON.stringify({ scene: editor.scene, selected, mode,
      transaction: editor.isTransactionActive(), canUndo: editor.canUndo }, null, 2)}</pre></>
}

/** Setup failures abort; product assertions record all outcomes, permitting a
 * before bundle to demonstrate first-attempt failure followed by a good retry. */
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
function state() { assert(live, 'Fixture unavailable'); return live }
function canvas(): HTMLCanvasElement { const element = host.querySelector('canvas'); assert(element, 'Missing canvas'); return element }
function rect() { const r = canvas().getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
function client(point: Point): Point { const r = rect(), c = canvas(); return { x: r.x + point.x * r.width / c.width, y: r.y + point.y * r.height / c.height } }
function control(name: string): HTMLElement { const item = Array.from(host.querySelectorAll<HTMLElement>('button,[aria-label]')).find(element =>
  element.title === name || element.getAttribute('aria-label') === name || element.textContent?.trim() === name); assert(item, `Missing ${name}`); return item }
async function frames(n = 2) { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame) }
async function click(name: string) { flushSync(() => control(name).click()); await frames() }
function pointer(target: EventTarget, type: string, p: Point, buttons = type === 'pointerup' ? 0 : 1, pointerId = 1) {
  flushSync(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: pointerId === 1,
    button: type === 'pointermove' ? -1 : 0, buttons, pointerId, clientX: p.x, clientY: p.y })))
}
function shape() { return state().editor.getScene().layers.find(layer => layer.id === 'moving')! }
function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b) }
function near(a: number, b: number) { return Math.abs(a - b) < 1e-4 }
function check(name: string, passed: boolean, evidence: unknown) { checks.push({ name, passed, evidence });
  document.getElementById('checks')!.textContent = checks.map(item => `${item.passed ? '✓' : '✗'} ${item.name}`).join('\n') }

/** A fixed client endpoint is crucial: recomputing it from the panned canvas
 * after pointermove would conceal the real release-coordinate regression. */
async function moveObject(dx = 100, dy = 55) {
  const initial = structuredClone(shape()), from = client({ x: initial.transform.x + 40, y: initial.transform.y + 30 }), beforeFrame = rect()
  const to = { x: from.x + dx * beforeFrame.width / canvas().width, y: from.y + dy * beforeFrame.height / canvas().height }
  pointer(canvas(), 'pointerdown', from); await frames(); pointer(window, 'pointermove', to); await frames()
  const preview = structuredClone(shape()); pointer(window, 'pointerup', to); await frames()
  return { initial, preview, released: structuredClone(shape()), beforeFrame, afterFrame: rect() }
}
async function oneUndo(base: ChronoScene) { flushSync(() => state().editor.undo()); await frames()
  return same(state().editor.getScene(), base) && !state().editor.canUndo }
/** Use the native DOM setter/event path already used by the layout and Array
 * acceptance fixtures, so React receives a real controlled-input change. */
async function typeDraft(input: HTMLInputElement, text: string) {
  input.focus()
  flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true })) })
  await frames()
}
function propertyInput() { const input = host.querySelector<HTMLInputElement>('[data-panel="properties"] input')
  assert(input, 'Missing real PropertiesPanel input'); return input }
async function key(input: HTMLInputElement, value: string) {
  flushSync(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))); await frames()
}

/** Start Pan over the moving object's center, so its final cursor remains
 * over that same object after the view translation. Swallow only bubble-up. */
async function missPanRelease() {
  await click('Pan tool'); await click('Consume next pointer-up bubble')
  const from = client({ x: 130, y: 120 }), to = { x: from.x + 40, y: from.y + 20 }
  pointer(canvas(), 'pointerdown', from); pointer(window, 'pointermove', to); await frames()
  pointer(canvas(), 'pointerup', to); await frames(); await click('Select tool')
}

async function ordinaryChecks(mount: (properties?: boolean) => Promise<void>) {
  await mount(); const base = structuredClone(state().editor.getScene()), movement = await moveObject()
  check('First selection + drag commits the final coordinates', near(movement.released.transform.x, 190) && near(movement.released.transform.y, 145), movement)
  const after = structuredClone(state().editor.getScene()), frame = rect()
  pointer(window, 'pointermove', client({ x: 400, y: 250 }), 0); await frames()
  check('Released object ignores late unpressed motion', same(state().editor.getScene(), after) && same(rect(), frame), { frame })
  check('One undo restores the source after ordinary first drag', await oneUndo(base), { layers: state().editor.getScene().layers })
}

/** Replay the reported valid-preview/capture-loss/up chain through production
 * object and guide adapters. Capture loss itself must neither commit nor undo. */
async function captureLossChecks(mount: (properties?: boolean) => Promise<void>) {
  await mount(); let base = structuredClone(state().editor.getScene())
  const from = client({ x: 130, y: 120 }), moved = client({ x: 230, y: 175 }), end = client({ x: 250, y: 190 })
  pointer(canvas(), 'pointerdown', from); pointer(window, 'pointermove', moved); await frames()
  const preview = structuredClone(shape()); pointer(canvas(), 'lostpointercapture', moved); await frames()
  const afterLoss = structuredClone(shape()), retainedObject = same(shape(), preview)
    && state().editor.isTransactionActive() && !state().editor.canUndo
  pointer(window, 'pointermove', end); pointer(window, 'pointerup', end); await frames()
  // Append report rows only after up: a new row above the canvas shifts its
  // client rect and would itself change the fixed endpoint's world coordinates.
  check('Connected capture loss retains the first selected object preview until up', retainedObject, { preview, afterLoss })
  check('Real up after capture loss commits final object pose exactly once', near(shape().transform.x, 210)
    && near(shape().transform.y, 160) && await oneUndo(base), { afterUndo: shape() })

  await mount(); base = structuredClone(state().editor.getScene())
  const ruler = control('Horizontal ruler'), bar = ruler.getBoundingClientRect(), initial = { x: client({ x: 160, y: 0 }).x, y: bar.top + bar.height / 2 }
  const middle = client({ x: 280, y: 150 }), final = client({ x: 300, y: 160 })
  pointer(ruler, 'pointerdown', initial); pointer(window, 'pointermove', middle); await frames()
  pointer(canvas(), 'lostpointercapture', middle); await frames()
  const retained = state().editor.isTransactionActive() && near(readSceneGuides(state().editor.getScene()).guides[0]?.position ?? NaN, 280)
  pointer(window, 'pointermove', final); pointer(window, 'pointerup', final); await frames()
  const guide = readSceneGuides(state().editor.getScene()).guides[0]
  check('Guide survives connected capture loss and commits one final position', retained && near(guide?.position ?? NaN, 300)
    && await oneUndo(base), { guide, retained })
}

async function stalePanObjectChecks(mount: (properties?: boolean) => Promise<void>) {
  await mount(); const base = structuredClone(state().editor.getScene()); await missPanRelease()
  const first = await moveObject(), firstGood = near(first.released.transform.x, 190) && near(first.released.transform.y, 145)
  let retry: Awaited<ReturnType<typeof moveObject>> | null = null
  if (!firstGood) retry = await moveObject()
  check('A consumed Pan release cannot corrupt the next object release', firstGood && same(first.beforeFrame, first.afterFrame), { first, retry })
  if (firstGood) check('First object drag after Pan owns exactly one undo', await oneUndo(base), { base })
}

async function stalePanGuideChecks(mount: (properties?: boolean) => Promise<void>) {
  await mount(); const base = structuredClone(state().editor.getScene()); await missPanRelease()
  const ruler = control('Horizontal ruler'), bar = ruler.getBoundingClientRect(), frame = rect()
  const from = { x: client({ x: 160, y: 0 }).x, y: bar.top + bar.height / 2 }, to = { x: from.x + 120 * frame.width / 640, y: frame.y + 150 }
  pointer(ruler, 'pointerdown', from); await frames(); pointer(window, 'pointermove', to); await frames(); pointer(window, 'pointerup', to); await frames()
  const guides = readSceneGuides(state().editor.getScene()).guides
  check('First guide release after Pan uses a stable canvas frame', guides.length === 1 && near(guides[0].position, 280) && same(rect(), frame), { guides, frame, afterFrame: rect() })
  check('Guide release owns one undo and preserves object source', await oneUndo(base), { layers: state().editor.getScene().layers })
}

async function foreignPointerChecks(mount: (properties?: boolean) => Promise<void>) {
  await mount(); await click('Pan tool'); const frame = rect(), from = client({ x: 130, y: 120 }), to = { x: from.x + 20, y: from.y + 10 }
  pointer(canvas(), 'pointerdown', from, 1, 1); pointer(window, 'pointermove', to, 1, 2); pointer(window, 'pointerup', to, 0, 2); await frames()
  const foreignFrame = rect(); pointer(window, 'pointermove', to, 1, 1); await frames(); const ownedFrame = rect()
  pointer(window, 'pointerup', to, 0, 1); await frames(); pointer(window, 'pointermove', { x: to.x + 100, y: to.y + 100 }, 0, 1); await frames()
  check('Pan ignores foreign pointers and ends on its initiating release', same(frame, foreignFrame) && near(ownedFrame.x - frame.x, 20)
    && near(ownedFrame.y - frame.y, 10) && same(rect(), ownedFrame), { frame, foreignFrame, ownedFrame, finalFrame: rect() })
}

async function focusedInputChecks(mount: (properties?: boolean) => Promise<void>) {
  await mount(true); const base = structuredClone(state().editor.getScene())
  const input = propertyInput()
  input.focus(); await frames(); const movement = await moveObject()
  check('A focused property input cannot roll the object back on release', near(movement.released.transform.x, 190) && near(movement.released.transform.y, 145), movement)
  input.blur(); await frames()
  check('Unchanged property blur does not add a second undo after a drag', await oneUndo(base), { source: state().editor.getScene() })
}

/** Text edits share the real inspector's source/history path. A controlled
 * prop update deliberately replaces any typed draft, matching product policy. */
async function propertyDraftChecks(mount: (properties?: boolean) => Promise<void>) {
  await mount(true); let base = structuredClone(state().editor.getScene()), input = propertyInput()
  await typeDraft(input, '145'); await key(input, 'Enter'); input.focus(); input.blur(); await frames()
  const entered = structuredClone(shape())
  check('Typed property Enter writes once and untouched re-blur stays one undo', entered.transform.x === 145 && await oneUndo(base), { entered })

  await mount(true); base = structuredClone(state().editor.getScene()); input = propertyInput()
  await typeDraft(input, '90.00'); await key(input, 'Enter')
  check('Typing the existing numeric value creates no command', same(state().editor.getScene(), base) && !state().editor.canUndo, { text: input.value })

  await mount(true); base = structuredClone(state().editor.getScene()); input = propertyInput()
  await typeDraft(input, '345'); await key(input, 'Escape')
  check('Escape discards typed text before blur without committing stale text', same(state().editor.getScene(), base)
    && !state().editor.canUndo && input.value === '90', { text: input.value, source: shape() })

  await mount(true); base = structuredClone(state().editor.getScene()); input = propertyInput()
  await typeDraft(input, '345')
  flushSync(() => { const previous = shape(); state().editor.dispatchCommand(makeUpdateLayerCmd(previous.id,
    { transform: { ...previous.transform, x: 230 } }, previous)) }); await frames()
  const external = structuredClone(state().editor.getScene()), synchronizedText = input.value
  input.blur(); await frames()
  const preserved = same(state().editor.getScene(), external)
  check('External prop changes discard the draft and survive later blur', preserved && synchronizedText === '230' && await oneUndo(base),
    { synchronizedText, externalSource: external.layers })
}

/** Standalone QA with real production scene/selection/guide/property adapters.
 * Observational failures remain visible so before/after evidence can be saved. */
async function main() {
  document.body.innerHTML = '<style>body{margin:16px;background:#0f172a;color:#e2e8f0;font:14px system-ui}button{padding:6px 10px}nav{display:flex;gap:8px;padding:8px}#host{width:1240px;max-width:100%;border:1px solid #475569}pre{white-space:pre-wrap;overflow-wrap:anywhere}#checks{color:#86efac}</style><h1>Pointer release audit</h1><p>Production SceneCanvas + editor, Pan, guide and PropertiesPanel. Isolated test source.</p><button id="run">Run pointer release checks</button><button id="inspect">Open editable pointer fixture</button><p id="status">Ready</p><pre id="checks"></pre><section id="host"></section><pre id="report">No checks run.</pre><h2>Pointer trace</h2><pre id="trace">Ready.</pre>'
  host = document.getElementById('host')!; const root = createRoot(host); let generation = 0
  const mount = async (properties = false) => { live = undefined; trace.length = 0
    flushSync(() => root.render(<Subject key={++generation} properties={properties} />)); await frames(4); assert(!state().snap, 'Snap did not disable') }
  const run = document.getElementById('run') as HTMLButtonElement, inspect = document.getElementById('inspect') as HTMLButtonElement
  inspect.onclick = () => { void mount(true) }
  run.onclick = async () => { run.disabled = inspect.disabled = true; checks.length = 0; document.getElementById('checks')!.textContent = ''; const start = performance.now()
    try { document.getElementById('status')!.textContent = 'Running pointer lifecycle checks…'
      await ordinaryChecks(mount); await stalePanObjectChecks(mount); await stalePanGuideChecks(mount); await foreignPointerChecks(mount)
      await focusedInputChecks(mount); await propertyDraftChecks(mount); await captureLossChecks(mount)
      const passed = checks.every(check => check.passed)
      document.getElementById('status')!.textContent = `${passed ? 'PASS' : 'FAIL'} · ${checks.filter(check => check.passed).length}/${checks.length} checks`
      document.getElementById('report')!.textContent = JSON.stringify({ passed, checks, elapsedMs: performance.now() - start, dpr: devicePixelRatio, userAgent: navigator.userAgent }, null, 2)
    } catch (error) { document.getElementById('status')!.textContent = 'SETUP ERROR'; document.getElementById('report')!.textContent = JSON.stringify({ error: String(error), checks }, null, 2) }
    finally { run.disabled = inspect.disabled = false }
  }
}
void main().catch(error => { document.body.textContent = String(error) })
