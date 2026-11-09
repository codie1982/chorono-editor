import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SceneCanvas from '@/components/SceneCanvas'
import LayerPanel from '@/components/LayerPanel'
import type { ToolMode } from '@/components/TopToolbar/ToolGroup'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'
import { layerRegistry } from '@/lib/registry'
import { useShapeCreationTool } from '@/components/canvas/placement/useShapeCreationTool'
import { makeAddLayerCmd, makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { acquirePortableScene } from '@/lib/export/portable/PortableSceneOutput'
import { OutputResources } from '@/lib/export/resources'

type Point = { x: number; y: number }
interface Runtime { editor: EditorStateReturn; template: Layer | null; kind: string | null; selected: string | null; mode: ToolMode; snap: boolean }
interface Check { name: string; evidence: unknown }
let runtime: Runtime | undefined, host: HTMLElement
const checks: Check[] = [], pointerTrace: unknown[] = []

/** Isolated source includes an ordinary shape and a negative-position shape.
 * They detect accidental source changes while a new shape is being placed. */
function source(): ChronoScene {
  const rect = newRectLayer(), outside = newRectLayer(), scene = emptyScene()
  scene.composition = { ...scene.composition, width: 640, height: 420, durationMs: 2000, backgroundColor: '#ffffff' }
  scene.layers = [
    { ...rect, id: 'existing', name: 'Existing object', size: { width: 80, height: 60 }, transform: { ...rect.transform, x: 450, y: 280, anchorX: 40, anchorY: 30 } },
    { ...outside, id: 'outside', name: 'Outside object', size: { width: 60, height: 50 }, transform: { ...outside.transform, x: -100, y: 100, anchorX: 30, anchorY: 25 } },
  ]
  scene.timelines = [{ ...newTimeline(), id: 'main', durationMs: 2000, layerIds: undefined, tracks: [] }]
  return scene
}

/** Mount the actual Add menu, shared persistent creation hook and production
 * canvas. No repeat-factory policy or placement geometry is reconstructed in
 * the fixture. Existing editor, assets, snapping and history own their state. */
function Subject({ initial }: { initial: ChronoScene }) {
  const editor = useEditorState(initial), assets = useAssetCache(editor.scene.assets), snap = useSnapSettings()
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<ToolMode>('select'), ids = useMemo(() => new Set(selected ? [selected] : []), [selected])
  const creation = useShapeCreationTool({ toolMode: mode, setToolMode: setMode, onSelect: setSelected,
    documentSignal: editor.getDocumentSignal(), getScene: editor.getScene })
  const { template, kind } = creation
  useEffect(() => { snap.setEnabled(false) }, [])
  useLayoutEffect(() => { runtime = { editor, template, kind, selected, mode, snap: snap.settings.enabled } })
  useEffect(() => {
    const observe = (event: PointerEvent) => { pointerTrace.push({ type: event.type, trusted: event.isTrusted, client: [event.clientX, event.clientY],
      target: event.target instanceof Element ? event.target.tagName : null, transaction: editor.isTransactionActive(),
      layers: editor.getScene().layers.map(layer => ({ id: layer.id, x: layer.transform.x, y: layer.transform.y, size: layer.size })) })
      if (pointerTrace.length > 70) pointerTrace.shift()
      document.getElementById('pointer-trace')!.textContent = JSON.stringify(pointerTrace, null, 2)
    }
    window.addEventListener('pointerdown', observe, true); window.addEventListener('pointerup', observe, true)
    return () => { window.removeEventListener('pointerdown', observe, true); window.removeEventListener('pointerup', observe, true) }
  }, [editor.getScene, editor.isTransactionActive])
  const add = (nextKind: string) => {
    const definition = layerRegistry.get(nextKind); if (!definition) return
    const layer = definition.createDefault()
    if (creation.choose(nextKind, layer, () => definition.createDefault())) return true
    creation.close(); editor.dispatchCommand(makeAddLayerCmd(layer)); setSelected(layer.id)
  }
  return <><nav style={{ display: 'flex', gap: 8, padding: 8 }}>
    <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
    <button onClick={() => { const viewport = host.querySelector('[data-testid="canvas-viewport"]'); assert(viewport, 'Missing viewport')
      viewport.addEventListener('pointerup', event => event.stopPropagation(), { once: true }) }}>Consume next pointer-up bubble</button>
  </nav><output aria-label="Placement summary">Layers {editor.scene.layers.length} · Mode {mode} · Armed {template?.id ?? 'none'} · Undo {String(editor.canUndo)} · Transaction {String(editor.isTransactionActive())}</output>
  <div style={{ display: 'flex', height: 650 }}><aside style={{ display: 'flex', flexDirection: 'column', width: 280, minHeight: 0 }}>
    <LayerPanel layers={editor.scene.layers} selectedId={selected} selectedIds={ids} onSelect={id => setSelected(id)} onAdd={add} activeAddKind={creation.kind}
      getDocumentSignal={editor.getDocumentSignal} onAddImage={() => {}} onAddVideo={() => {}} onAddAudio={() => {}}
      onDelete={() => {}} onReorder={() => {}} onToggleFlag={() => {}} onRename={() => {}} />
  </aside><section style={{ display: 'flex', flex: 1, position: 'relative', minWidth: 0 }}>
    <SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap} selectedLayerId={selected} selectedLayerIds={ids}
      timeMs={0} isPlaying={false} previewMode={false} toolMode={mode} onToolModeChange={setMode} onSelectLayer={setSelected}
      shapePlacementLayer={template} onShapePlacementComplete={creation.complete}
      selectedTimeline={editor.scene.timelines[0]} />
  </section></div><pre data-testid="placement-debug">{JSON.stringify({ armed: template, mode, selected, canUndo: editor.canUndo,
    transaction: editor.isTransactionActive(), scene: editor.scene }, null, 2)}</pre></>
}

/** Assertion failures stay visible with source diagnostics. */
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
/** Read committed production React adapter state. */
function live(): Runtime { assert(runtime, 'Placement subject not mounted'); return runtime }
/** Source comparisons include unrelated metadata and animation records. */
function equal(a: unknown, b: unknown, message: string) { assert(JSON.stringify(a) === JSON.stringify(b), message) }
/** Permit only floating point coordinate conversion noise. */
function close(a: number, b: number, message: string) { assert(Math.abs(a - b) < 1e-4, `${message}: ${a} != ${b}`) }
/** Wait for real browser painting and React effects. */
async function frames(n = 2) { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame) }
/** Find a mounted public control without opening or changing its UI. */
function findControl(name: string): HTMLElement | undefined { return Array.from(host.querySelectorAll<HTMLElement>('button,[aria-label]')).find(item =>
  item.title === name || item.getAttribute('aria-label') === name || item.textContent?.trim() === name)
}
/** Find public production buttons by exact accessible text or title. */
function control(name: string): HTMLElement { const element = findControl(name)
  assert(element, `Missing control '${name}'`); return element }
/** Activate the real Add menu event handler. */
async function click(name: string) { flushSync(() => control(name).click()); await frames() }
/** Select through the actual LayerPanel category/menu UI. */
async function arm(label = 'Rectangle') { if (!findControl(`Add ${label}`)) await click('Add Layer')
  await click(`Add ${label}`); assert(live().template, `Add ${label} did not arm placement`); return live().template! }
/** The persistent palette remains visible and identifies the exact active tool. */
function assertActivePalette(label = 'Rectangle') {
  assert(control(`Add ${label}`).getAttribute('aria-pressed') === 'true', `Add ${label} palette closed or lost active state`)
}
/** Read the actual native canvas backing and committed CSS box. */
function canvas(): HTMLCanvasElement { const element = host.querySelector('canvas'); assert(element, 'Missing canvas'); return element }
/** Map independent composition test coordinates through pan/zoom/layout. */
function client(point: Point): Point { const el = canvas(), rect = el.getBoundingClientRect()
  return { x: rect.left + point.x * rect.width / el.width, y: rect.top + point.y * rect.height / el.height } }
/** Dispatch through native window/capture boundaries, without stubbing refs. */
function pointer(target: EventTarget, type: string, point: Point, shiftKey = false) { flushSync(() => target.dispatchEvent(new PointerEvent(type,
  { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0,
    buttons: type === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y, shiftKey }))) }
/** Begin on native canvas, sample and release through the shared pointer owner. */
async function draw(from: Point, to: Point, shift = false, consumed = false) { pointer(canvas(), 'pointerdown', client(from), shift); await frames()
  pointer(window, 'pointermove', client(to), shift); await frames()
  pointer(consumed ? canvas() : window, 'pointerup', client(to), shift); await frames() }
/** Read the specific stable template ID after production commit. */
function placed(id: string): Layer { const layer = live().editor.getScene().layers.find(item => item.id === id); assert(layer, `Missing committed ${id}`); return layer }
/** Source insertion must be a single atomic history entry. */
async function undoOnce(before: ChronoScene, after: ChronoScene) { flushSync(() => live().editor.undo()); await frames()
  equal(live().editor.getScene(), before, 'One undo did not restore exact source'); assert(!live().editor.canUndo, 'Placement created multiple undo steps')
  flushSync(() => live().editor.redo()); await frames(); equal(live().editor.getScene(), after, 'Redo changed authored placement') }
/** Record only checks whose complete invariants passed. */
function record(name: string, evidence: unknown) { checks.push({ name, evidence }); document.getElementById('checks')!.textContent = checks.map(item => `✓ ${item.name}`).join('\n') }

/** Real Add/drag/release must retain unrelated source, render the new rectangle,
 * and round-trip through the portable scene contract with its stable ID. */
async function creationChecks(mount: () => Promise<void>) {
  await mount(); const before = structuredClone(live().editor.getScene()), template = await arm()
  equal(live().editor.getScene(), before, 'Arming Add mutated source'); assert(!live().editor.canUndo, 'Arming Add wrote history')
  assert(getComputedStyle(canvas()).cursor === 'crosshair', 'Armed placement cursor is not crosshair')
  assertActivePalette()
  record('Layer Add arms crosshair placement without source/history changes', { templateId: template.id })
  pointer(canvas(), 'pointerdown', client({ x: 90, y: 70 })); await frames()
  equal(live().editor.getScene(), before, 'Pointer-down flashed default geometry into source')
  pointer(window, 'pointermove', { x: client({ x: 90, y: 70 }).x + 2, y: client({ x: 90, y: 70 }).y }); await frames()
  equal(live().editor.getScene(), before, 'Subthreshold pointer movement flashed default geometry')
  record('Pointer-down and tiny movement leave geometry absent until a real drag or release', { thresholdCssPx: 3 })
  pointer(window, 'pointermove', client({ x: 270, y: 180 })); await frames()
  assert(live().editor.isTransactionActive(), 'Dragging did not own a transaction'); assert(!live().editor.canUndo, 'Preview wrote history')
  assertActivePalette()
  record('Pointer-down and drag preview do not write undo history', { transaction: true })
  pointer(window, 'pointerup', client({ x: 290, y: 190 })); await frames()
  const layer = placed(template.id), after = structuredClone(live().editor.getScene())
  close(layer.transform.x, 90, 'Placed x'); close(layer.transform.y, 70, 'Placed y'); close(layer.size!.width, 200, 'Final up width'); close(layer.size!.height, 120, 'Final up height')
  assert(!live().editor.isTransactionActive() && live().template && live().template!.id !== template.id && live().mode === 'shape-draw' && live().selected === template.id, 'Release did not finish/select/rearm a fresh shape')
  assertActivePalette()
  record('Add palette remains visible and active through selection, drag preview and release', { kind: live().kind })
  equal(after.layers.filter(item => item.id !== template.id), before.layers, 'Placement changed existing objects')
  const rgba = Array.from(canvas().getContext('2d')!.getImageData(180, 120, 1, 1).data)
  equal(rgba, [59, 130, 246, 255], 'New rectangle did not render at placed coordinates')
  await undoOnce(before, after)
  record('Final pointer-up resamples coordinates, renders shape and commits one undo/redo', { x: 90, y: 70, width: 200, height: 120, rgba })
  const resources = new OutputResources(), lease = await acquirePortableScene(after, { resources })
  try { const loaded = JSON.parse(JSON.stringify(lease.value)) as ChronoScene; equal(loaded.layers, after.layers, 'Portable output changed placed source') }
  finally { lease.release(); resources.dispose() }
  record('Portable scene output preserves placed and unrelated objects', { stableId: template.id })
  const nextTemplate = live().template!; await draw({ x: 320, y: 70 }, { x: 430, y: 170 })
  const second = placed(nextTemplate.id); assert(second.id !== template.id && live().template!.id !== second.id, 'Repeat placement reused a committed ID')
  flushSync(() => live().editor.undo()); await frames(); equal(live().editor.getScene(), after, 'Repeat shape did not have its own undo step')
  flushSync(() => live().editor.undo()); await frames(); equal(live().editor.getScene(), before, 'First repeated shape undo failed'); assert(!live().editor.canUndo, 'Repeat shapes added extra history')
  record('Persistent drawing creates unique objects without reopening Add and gives each one undo', { first: template.id, second: second.id })
}

/** Direction, default-click and modifier cases independently mount clean
 * history so an accidental accumulated command cannot satisfy assertions. */
async function geometryChecks(mount: () => Promise<void>) {
  await mount(); let template = await arm(); await draw({ x: 300, y: 220 }, { x: 120, y: 80 })
  let layer = placed(template.id); close(layer.transform.x, 120, 'Reverse x'); close(layer.transform.y, 80, 'Reverse y')
  close(layer.size!.width, 180, 'Reverse width'); close(layer.size!.height, 140, 'Reverse height')
  record('Reverse drag normalizes box dimensions', { position: layer.transform, size: layer.size })
  await mount(); template = await arm(); await draw({ x: 140, y: 100 }, { x: 140, y: 100 }); layer = placed(template.id)
  close(layer.transform.x, 140, 'Click x'); close(layer.transform.y, 100, 'Click y'); equal(layer.size, template.size, 'Click lost default size')
  record('Click places the default-sized shape at the click point', { size: layer.size })
  await mount(); template = await arm(); await draw({ x: 100, y: 80 }, { x: 240, y: 160 }, true); layer = placed(template.id)
  close(layer.size!.width, layer.size!.height, 'Shift box is not square')
  record('Shift constrains the drawn box', { size: layer.size })
  await mount(); template = await arm('Arrow'); await draw({ x: 300, y: 230 }, { x: 150, y: 90 }); layer = placed(template.id)
  close(layer.transform.x, 300, 'Arrow source x'); close(layer.transform.y, 230, 'Arrow source y')
  close(layer.shapeParams!.x2!, -150, 'Arrow signed x2'); close(layer.shapeParams!.y2!, -140, 'Arrow signed y2')
  record('Arrow preserves pointer-down origin and signed endpoint direction', { position: layer.transform, params: layer.shapeParams })
  await mount(); const before = structuredClone(live().editor.getScene()); template = await arm(); await draw({ x: 30, y: 70 }, { x: -80, y: 170 }); layer = placed(template.id)
  close(layer.transform.x, -80, 'Off-artboard x'); close(layer.size!.width, 110, 'Off-artboard width')
  await undoOnce(before, structuredClone(live().editor.getScene()))
  record('Pointer release outside composition preserves signed coordinates and one undo', { x: layer.transform.x, width: layer.size!.width })
}

/** Escape at either lifecycle stage, consumed bubbling release and native
 * cursor inheritance cover the reported first-release and hand-cursor issues. */
async function lifecycleChecks(mount: () => Promise<void>) {
  for (const outside of [false, true]) {
    await mount(); const before = structuredClone(live().editor.getScene()); await arm()
    const target = outside ? host.querySelector('[data-testid="canvas-viewport"]')! : canvas()
    flushSync(() => target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 10, clientY: 10 }))); await frames()
    equal(live().editor.getScene(), before, 'Right-click changed source'); assert(!live().template && live().mode === 'select' && !live().editor.canUndo, 'Right-click did not leave drawing mode')
    record(outside ? 'Right-click in outside workspace cancels persistent drawing' : 'Right-click on canvas cancels persistent drawing', { outside })
  }
  await mount(); const toggleSource = structuredClone(live().editor.getScene()); await arm(); await click('Add Rectangle')
  equal(live().editor.getScene(), toggleSource, 'Same Add kind toggle changed source'); assert(!live().template && live().mode === 'select' && !live().editor.canUndo, 'Same Add kind did not toggle drawing off')
  assert(control('Add Rectangle').getAttribute('aria-pressed') === 'false', 'Direct palette toggle did not clear active indicator')
  record('Choosing the active Add shape again toggles persistent drawing off', { kind: 'rect' })
  for (const dragging of [false, true]) {
    await mount(); const before = structuredClone(live().editor.getScene()); await arm()
    if (dragging) { pointer(canvas(), 'pointerdown', client({ x: 100, y: 80 })); pointer(window, 'pointermove', client({ x: 240, y: 180 })); await frames() }
    flushSync(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))); await frames()
    equal(live().editor.getScene(), before, 'Escape changed source'); assert(!live().editor.canUndo && !live().editor.isTransactionActive() && !live().template, 'Escape left armed/transaction/history state')
    record(dragging ? 'Escape cancels an active drawing with no source/history changes' : 'Escape cancels armed Add placement', { dragging })
  }
  await mount(); const before = structuredClone(live().editor.getScene()), template = await arm(); await click('Consume next pointer-up bubble')
  await draw({ x: 80, y: 70 }, { x: 230, y: 170 }, false, true); const layer = placed(template.id)
  close(layer.size!.width, 150, 'Consumed release width'); assert(!live().editor.isTransactionActive(), 'Consumed release stranded transaction')
  await undoOnce(before, structuredClone(live().editor.getScene()))
  record('Capture-phase release commits even when viewport consumes pointer-up bubbling', { width: layer.size!.width })
  await mount(); pointer(canvas(), 'pointermove', client({ x: 490, y: 310 })); await frames()
  assert(getComputedStyle(canvas()).cursor === 'crosshair', 'Selectable native shape cursor is not crosshair')
  const outside = host.querySelector<SVGRectElement>('[data-off-artboard-id="outside"]'); assert(outside, 'Outside outline not visible')
  assert(getComputedStyle(outside).cursor === 'crosshair', 'Outside object cursor is not crosshair')
  record('Native shape hover and outside outlines use the plus crosshair cursor', { native: getComputedStyle(canvas()).cursor, outside: getComputedStyle(outside).cursor })
  await mount(); const original = structuredClone(live().editor.getScene()); await arm(); pointer(canvas(), 'pointerdown', client({ x: 70, y: 60 })); pointer(window, 'pointermove', client({ x: 200, y: 160 })); await frames()
  flushSync(() => { const layer = live().editor.getScene().layers.find(item => item.id === 'existing')!
    live().editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { transform: { ...layer.transform, x: 455 } }, layer)) }); await frames()
  const changed = structuredClone(live().editor.getScene()); pointer(window, 'pointerup', client({ x: 220, y: 180 })); await frames()
  equal(live().editor.getScene(), changed, 'Stale gesture replaced external source'); assert(!live().editor.isTransactionActive(), 'External source conflict left transaction open')
  assert(original.layers[0].transform.x === 450 && changed.layers[0].transform.x === 455, 'Manual source command did not run')
  record('An intervening source edit survives stale pointer release', { x: changed.layers[0].transform.x })
}

/** A previous uncontrolled Pan toggle must not intercept the next Add tool.
 * Check real canvas placement and its CSS frame rather than only the cursor. */
async function panToCreationChecks(mount: () => Promise<void>) {
  await mount()
  await click('Pan mode — drag the view instead of objects (middle-mouse always pans)')
  assert(getComputedStyle(canvas()).cursor === 'grab', 'Internal Pan was not activated')
  const template = await arm(), rect = canvas().getBoundingClientRect()
  assertActivePalette()
  await draw({ x: 80, y: 60 }, { x: 210, y: 160 })
  const layer = placed(template.id), after = canvas().getBoundingClientRect()
  close(layer.transform.x, 80, 'Pan-to-Add shape x'); close(layer.transform.y, 60, 'Pan-to-Add shape y')
  close(layer.size!.width, 130, 'Pan-to-Add width'); close(layer.size!.height, 100, 'Pan-to-Add height')
  close(after.x, rect.x, 'Drawing unexpectedly panned canvas x'); close(after.y, rect.y, 'Drawing unexpectedly panned canvas y')
  assertActivePalette(); assert(!live().editor.isTransactionActive(), 'Pan-to-Add stranded transaction')
  record('Choosing Add after internal Pan draws on the first gesture without panning', { position: layer.transform, size: layer.size })
}

/** Standalone QA retains live production controls, source state, pointer trace
 * and source/bundle manifest evidence. Connected user documents are untouched. */
async function main() {
  document.body.innerHTML = '<style>body{margin:16px;background:#0f172a;color:#e2e8f0;font:14px system-ui}body>button,nav>button{padding:7px 11px;background:#1d4ed8;color:white;border:1px solid #64748b;border-radius:5px}button:disabled{opacity:.4}#placement-host{width:1240px;max-width:100%;border:1px solid #475569;display:flex;flex-direction:column}pre{white-space:pre-wrap;overflow-wrap:anywhere}#checks{color:#86efac}</style><h1>Shape placement and crosshair acceptance</h1><p>Real LayerPanel Add + SceneCanvas + editor/history; isolated source, no connected document edits.</p><button id="run">Run placement checks</button><button id="inspect">Open editable placement fixture</button><p id="status">Ready</p><pre id="checks"></pre><section id="placement-host"></section><pre id="report">No checks run.</pre><h2>Pointer trace</h2><pre id="pointer-trace">Ready for trusted browser input.</pre>'
  host = document.getElementById('placement-host')!; const root = createRoot(host); let generation = 0
  const mount = async () => { runtime = undefined; pointerTrace.length = 0; flushSync(() => root.render(<Subject key={++generation} initial={source()} />)); await frames(4); assert(!live().snap, 'Fixture snap did not disable') }
  const run = document.getElementById('run') as HTMLButtonElement, inspect = document.getElementById('inspect') as HTMLButtonElement
  inspect.onclick = () => { void mount() }
  run.onclick = async () => { run.disabled = inspect.disabled = true; checks.length = 0; document.getElementById('checks')!.textContent = ''; const start = performance.now(); let manifest: unknown
    try { document.getElementById('status')!.textContent = 'Running production placement controls…'; const data = await (await fetch('shape-placement-sources.json')).json()
      manifest = { sourceManifest: 'shape-placement-sources.json', bundleSha256: data.bundleSha256, sourceFiles: data.sources.length }
      await creationChecks(mount); await geometryChecks(mount); await lifecycleChecks(mount); await panToCreationChecks(mount)
      document.getElementById('status')!.textContent = `PASS · ${checks.length} checks`; document.getElementById('report')!.textContent = JSON.stringify({ passed: true, checks, manifest, elapsedMs: performance.now() - start, dpr: devicePixelRatio, userAgent: navigator.userAgent }, null, 2)
    } catch (error) { document.getElementById('status')!.textContent = 'FAIL'; document.getElementById('report')!.textContent = JSON.stringify({ passed: false, error: String(error), checks, manifest }, null, 2) }
    finally { run.disabled = inspect.disabled = false }
  }
}
void main().catch(error => { document.body.textContent = `Shape placement QA setup failed: ${String(error)}` })
