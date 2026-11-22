import { createLayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'
import { buildFitParentCommand } from '@/lib/editor/fitParent'
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
import { acquireRasterImage } from '@/lib/export/raster/RasterExportEngine'
import { useTimelineAuthoring } from '@/components/timeline/authoring/useTimelineAuthoring'
import { SetKeyControls, SetKeyReview } from '@/components/timeline/authoring/SetKeyControls'

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
  const editor = useEditorState(initial), assets = useAssetCache(editor.scene.assets), snap = useSnapSettings({ persist: false })
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [timelineId, setTimelineId] = useState(initial.timelines[0]?.id ?? '')
  const [mode, setMode] = useState<ToolMode>('select'), ids = useMemo(() => new Set(selected ? [selected] : []), [selected])
  const creation = useShapeCreationTool({ toolMode: mode, setToolMode: setMode, onSelect: setSelected,
    documentSignal: editor.getDocumentSignal(), getScene: editor.getScene })
  const { template, kind } = creation
  const authoring = useTimelineAuthoring({ scene: editor.scene, editor, timelineId, selectedId: selected, selectedIds: ids,
    selectedKeyIds: new Set(), currentTimeMs: 0, isPlaying: false, onSeek: () => {}, onActivateTimeline: setTimelineId })
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
  const add = (nextKind: string, origin?: Point) => {
    const definition = layerRegistry.get(nextKind); if (!definition) return
    const layer = definition.createDefault()
    if (creation.choose(nextKind, layer, () => definition.createDefault(), origin)) return true
    creation.close(); editor.dispatchCommand(makeAddLayerCmd(layer)); setSelected(layer.id)
  }
  return <><nav style={{ display: 'flex', gap: 8, padding: 8 }}>
    <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
    <SetKeyControls controls={authoring} /><SetKeyReview controls={authoring} />
    <button onClick={() => setPreview(value => !value)}>Toggle clean preview</button>
    <button onClick={() => { const viewport = host.querySelector('[data-testid="canvas-viewport"]'); assert(viewport, 'Missing viewport')
      viewport.addEventListener('pointerup', event => event.stopPropagation(), { once: true }) }}>Consume next pointer-up bubble</button>
  </nav><output aria-label="Placement summary">Layers {editor.scene.layers.length} · Mode {mode} · Armed {template?.id ?? 'none'} · Undo {String(editor.canUndo)} · Transaction {String(editor.isTransactionActive())}</output>
  <div style={{ display: 'flex', height: 650 }}><aside style={{ display: 'flex', flexDirection: 'column', width: 280, minHeight: 0 }}>
    <LayerPanel layers={editor.scene.layers} selectedId={selected} selectedIds={ids} onSelect={id => setSelected(id)} onAdd={add} activeAddKind={creation.kind}
      getDocumentSignal={editor.getDocumentSignal} onAddImage={() => {}} onAddVideo={() => {}} onAddAudio={() => {}}
      onDelete={() => {}} onReorder={() => {}} onToggleFlag={() => {}} onRename={() => {}} />
  </aside><section style={{ display: 'flex', flex: 1, position: 'relative', minWidth: 0 }}>
    <SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap} selectedLayerId={selected} selectedLayerIds={ids}
      timeMs={0} isPlaying={false} previewMode={preview} toolMode={mode} onToolModeChange={setMode} onSelectLayer={setSelected}
      shapePlacementLayer={template} onShapePlacementComplete={creation.complete}
      shapePlacementHint={creation.hint}
      selectedTimeline={editor.scene.timelines[0]} menuHandlers={{ addLayer: add, fitParent: () => {
        const cmd = buildFitParentCommand(editor.getScene(), ids, { timelineId: 'main', timeMs: 0, autoKeyframe: false })
        if (cmd) editor.dispatchCommand(cmd)
      } }} />
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
function findControl(name: string): HTMLElement | undefined { return Array.from(host.querySelectorAll<HTMLElement>('button,[aria-label],label')).find(item =>
  item.title === name || item.getAttribute('aria-label') === name || item.textContent?.trim() === name
  || ((item instanceof HTMLButtonElement || item.tagName === 'LABEL') && Array.from(item.children).some(child => child.textContent?.trim() === name)))
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
/** Context-menu creation and fitting route through production owners. */
async function contextMenuChecks(mount: () => Promise<void>) {
  const menuItem = (label: string) => {
    const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(node => node.querySelector('span.flex-1')?.textContent?.trim() === label)
    assert(item, `Missing context action ${label}`); return item
  }
  const menuClick = async (label: string) => {
    const item = menuItem(label), submenu = Array.from(item.children).some(child => child.textContent?.trim() === '▶')
    flushSync(() => { if (submenu) item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: null })); else item.click() })
    await frames(3)
  }
  const rightClick = async (point: Point) => { const p = client(point); flushSync(() => canvas().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }))); await frames(3) }
  await mount(); const source = structuredClone(live().editor.getScene())
  await rightClick({ x: 200, y: 350 }); await menuClick('Add'); await menuClick('Basic Shapes'); await menuClick('Rectangle')
  assert(live().template && !live().editor.canUndo, 'Context Add did not arm without a source command')
  equal(live().editor.getScene(), source, 'Context Add created default geometry before drawing')
  const hint = host.querySelector<HTMLElement>('[data-testid="placement-start-reference"]')
  assert(hint?.dataset.x === '200' && hint.dataset.y === '350', 'Original right-click position was not marked')
  const template = live().template!
  await draw({ x: 200, y: 350 }, { x: 300, y: 410 })
  const contextShape = placed(template.id)
  close(contextShape.transform.x, 200, 'Context drawing X'); close(contextShape.transform.y, 350, 'Context drawing Y')
  close(contextShape.size!.width, 100, 'Context drawing width'); close(contextShape.size!.height, 60, 'Context drawing height')
  live().editor.undo(); await frames(); equal(live().editor.getScene(), source, 'Context creation Undo changed source')
  record('Context Add marks its original point, creates nothing before dragging, then draws with one Undo', { x: 200, y: 350, width: 100, height: 60 })
  await mount(); const before = structuredClone(live().editor.getScene())
  await rightClick({ x: 480, y: 310 }); await menuClick('Align'); await menuClick('Fit Parent')
  const next = live().editor.getScene(), layer = next.layers.find(item => item.id === 'existing')!
  const box = createLayerWorldBoundsResolver(next)(layer)!
  close(box.x, 0, 'Fit Parent x'); close(box.y, 0, 'Fit Parent y')
  close(box.width, next.composition.width, 'Fit Parent width'); close(box.height, next.composition.height, 'Fit Parent height')
  live().editor.undo(); await frames(); equal(live().editor.getScene(), before, 'Fit Parent Undo changed existing content')
  record('Single-object Align → Fit Parent fills composition and undoes in one step', { bounds: box })
  const row = host.querySelector<HTMLElement>('[data-virtual-row="existing"]')!
  flushSync(() => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 200 }))); await frames(3)
  await menuClick('Add'); await menuClick('3D Objects')
  menuItem('Empty 3D Scene'); menuItem('Import GLB / glTF')
  equal(live().editor.getScene(), before, 'Opening Add menu changed source')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await frames()
  record('Layer row context Add offers Empty 3D Scene and import without creating on menu open', {})
}

/** Real Canvas readback, preview and encoded PNG verify editor grid isolation;
 * controls use production View/Snap settings and never replace user source. */
async function viewportGridChecks(mount: () => Promise<void>) {
  await mount()
  const before = structuredClone(live().editor.getScene())
  const pixels = () => canvas().getContext('2d')!.getImageData(0, 0, canvas().width, canvas().height).data
  const sample = (x: number, y: number) => Array.from(canvas().getContext('2d')!.getImageData(x, y, 1, 1).data)
  // Chrome can switch a repeatedly read canvas from GPU to CPU rasterization.
  // Prime that transition and repaint before freezing the exact preview oracle.
  pixels(); pixels(); await click('Toggle clean preview'); await click('Toggle clean preview')
  const baseline = pixels().slice(), blue = sample(480, 310)
  /** Real PNG output before/after UI preferences, with explicit lease/bitmap
   * cleanup. A separate fresh render avoids conflating GPU/CPU edge coverage. */
  const exportPixels = async () => {
    const resources = new OutputResources(), lease = await acquireRasterImage(before, new Map(), { format: 'png' }, { resources })
    let bitmap: ImageBitmap | undefined
    const exported = document.createElement('canvas')
    try {
      bitmap = await createImageBitmap(lease.value.blob); exported.width = bitmap.width; exported.height = bitmap.height
      exported.getContext('2d')!.drawImage(bitmap, 0, 0)
      return exported.getContext('2d')!.getImageData(0, 0, bitmap.width, bitmap.height).data
    } finally { bitmap?.close(); exported.width = exported.height = 0; lease.release(); resources.dispose() }
  }
  const cleanPng = await exportPixels()
  /** Exact byte comparison with a bounded diagnostic identifying real pixels. */
  const expectClean = (actual: Uint8ClampedArray, message: string) => {
    const first = actual.findIndex((byte, i) => byte !== baseline[i])
    assert(first < 0, `${message}: first byte ${first}, pixel ${Math.floor(first / 4) % canvas().width},${Math.floor(first / 4 / canvas().width)}; expected ${Array.from(baseline.slice(first - first % 4, first - first % 4 + 4))}; actual ${Array.from(actual.slice(first - first % 4, first - first % 4 + 4))}`)
  }
  await click('View options'); await click('Viewport grid settings')
  assert(document.activeElement === host.querySelector('input[aria-label="Grid spacing"]'), 'Viewport settings did not initially focus spacing')
  await click('Show grid')
  assert(sample(240, 201)[0] < 255, 'Grid did not appear with snapping disabled')
  equal(sample(480, 310), blue, 'Behind grid painted over opaque content')
  record('View grid is visible independently of disabled snapping and draws behind layers', {})
  await click('Grid on top of layers')
  assert(JSON.stringify(sample(480, 310)) !== JSON.stringify(blue), 'Front grid did not paint over opaque layer')
  record('Grid on top of layers changes real pixels over an opaque object', {})
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Grid spacing"]')!
  assert(input, 'Viewport settings spacing input is missing')
  const type = async (value: string) => { flushSync(() => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }); await frames(3) }
  await type('40')
  assert(sample(240, 201)[0] < 255 && sample(260, 201)[0] === 255, 'Pixel spacing did not update drawn lines')
  await type('0'); assert(input.getAttribute('aria-invalid') === 'true', 'Invalid spacing was accepted')
  assert(sample(260, 201)[0] === 255, 'Invalid spacing changed rendered grid')
  flushSync(() => input.blur()); await frames()
  assert(input.value === '40', 'Invalid draft did not restore valid spacing')
  flushSync(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await frames()
  assert(!host.querySelector('[role="dialog"][aria-label="Viewport settings"]'), 'Escape did not dismiss settings')
  assert(document.activeElement === control('Viewport grid settings'), 'Settings did not restore entry focus')
  record('Viewport settings applies exact pixel spacing, rejects invalid drafts and restores keyboard focus', { sizePx: 40 })
  await click('View options'); await click('Snap settings'); await click('Enable Snapping'); await click('Snap to Grid')
  await click('Options')
  const shared = host.querySelector<HTMLInputElement>('input[aria-label="Snap grid spacing"]')!
  assert(shared?.value === '40', 'View and Snap spacing diverged')
  record('View and Snap controls share one pixel spacing setting', { sizePx: 40 })
  await click('Snap settings'); await click('Toggle clean preview')
  await frames(3)
  expectClean(pixels(), 'Clean preview differs')
  await click('Toggle clean preview')
  const gridPng = await exportPixels()
  assert(gridPng.length === cleanPng.length && gridPng.every((byte, i) => byte === cleanPng[i]), 'Grid preferences changed encoded PNG pixels')
  equal(live().editor.getScene(), before, 'Viewport preferences changed source')
  assert(!live().editor.canUndo, 'Viewport grid wrote Undo history')
  record('Clean preview and actual encoded PNG omit grid; source and Undo are unchanged', {})
}

/** Actual checkbox controls, world/CSS mapping, hover marker, Add gestures and
 * parent-local source commands share the production snap engine. */
async function snappingChecks(mount: (initial?: ChronoScene) => Promise<void>) {
  const configure = async (parent = false) => {
    if (!parent) { await click('View options'); await click('Viewport grid settings'); await click('Show grid'); await click('Close viewport settings'); await click('View options') }
    await click('Snap settings'); await click('Enable Snapping')
    await click('Snap to Object Edges'); await click('Snap to Points'); await click('Snap to Guides')
    await click(parent ? 'Snap to Parent Edges' : 'Snap to Grid')
    if (!parent) {
      await click('Options')
      const radius = host.querySelector<HTMLInputElement>('input[aria-label="Snap radius"]')!
      flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(radius, '6'); radius.dispatchEvent(new Event('input', { bubbles: true })) }); await frames()
      const input = host.querySelector<HTMLInputElement>('input[aria-label="Snap grid spacing"]')!
      flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '40'); input.dispatchEvent(new Event('input', { bubbles: true })) })
      await frames()
    }
    await click('Snap settings')
  }
  await mount(); await configure()
  const before = structuredClone(live().editor.getScene())
  canvas().scrollIntoView({ block: 'center' }); await frames(3)
  const p = client({ x: 83, y: 77 })
  flushSync(() => canvas().dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', pointerId: 1,
    clientX: p.x, clientY: p.y, buttons: 0 }))); await frames(3)
  const marker = host.querySelector<HTMLElement>('[data-testid="canvas-cursor-crosshair"]')
  assert(marker?.dataset.snapped === 'true' && marker.dataset.x === '80' && marker.dataset.y === '80', 'Pointer did not acquire the visible grid lattice')
  record('Mouse hover acquires the grid in composition pixels and shows a snap marker', { x: 80, y: 80 })
  const template = await arm()
  await draw({ x: 83, y: 77 }, { x: 197, y: 163 }, false, true)
  const created = placed(template.id)
  close(created.transform.x, 80, 'Snapped creation X'); close(created.transform.y, 80, 'Snapped creation Y')
  close(created.size!.width, 120, 'Snapped creation width'); close(created.size!.height, 80, 'Snapped creation height')
  await undoOnce(before, structuredClone(live().editor.getScene()))
  record('First shape gesture and final pointer-up acquire the same grid as the mouse', { x: 80, y: 80, width: 120, height: 80 })
  await mount(); await configure()
  await click('Snap settings'); await click('Snap to Object Edges')
  const boxes = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'))
  assert(boxes.some(box => box.dataset.snapTarget === 'Snap to Grid') && boxes.some(box => box.dataset.snapTarget === 'Snap to Object Edges'), 'Snap targets behave like exclusive radio options')
  await click('Snap settings')
  const row = host.querySelector<HTMLElement>('[data-virtual-row="existing"]')!
  flushSync(() => row.click()); await frames()
  await draw({ x: 480, y: 310 }, { x: 508, y: 310 }, false, true)
  close(live().editor.getScene().layers.find(layer => layer.id === 'existing')!.transform.x, 480, 'Move did not acquire shared grid')
  record('Multiple Snap checkboxes remain active together and moving objects use the viewport grid', { x: 480 })
  const beforeShape = structuredClone(live().editor.getScene()), nextTemplate = await arm()
  pointer(canvas(), 'pointerdown', client({ x: 83, y: 163 })); pointer(window, 'pointermove', client({ x: 151, y: 251 })); await frames()
  pointer(window, 'pointerup', client({ x: 155, y: 254 })); await frames()
  const finalShape = placed(nextTemplate.id)
  close(finalShape.size!.width, 80, 'Final release snapped to its own old preview X')
  close(finalShape.size!.height, 94, 'Final release snapped to its own old preview Y')
  live().editor.undo(); await frames(); equal(live().editor.getScene(), beforeShape, 'Drawing Undo changed preceding move')
  record('Object+grid drawing excludes its own draft from mouse-up acquisition and preserves preceding edits', { width: 80, height: 94 })
  const scene = source(), parent = { ...newRectLayer(), type: 'group' as const, id: 'parent', name: 'Parent', size: undefined }
  parent.transform = { ...parent.transform, x: 100, y: 50, anchorX: 0, anchorY: 0 }
  const frame = { ...newRectLayer(), id: 'parent-frame', name: 'Parent frame', parentId: parent.id, locked: true, size: { width: 400, height: 300 } }
  frame.transform = { ...frame.transform, x: 0, y: 0, anchorX: 0, anchorY: 0 }
  const child = { ...scene.layers[0], parentId: parent.id, transform: { ...scene.layers[0].transform, x: 100, y: 100 } }
  scene.layers = [parent, frame, child]
  await mount(scene); await configure(true)
  const childRow = host.querySelector<HTMLElement>('[data-virtual-row="existing"]')!
  flushSync(() => childRow.click()); await frames()
  await draw({ x: 230, y: 180 }, { x: 134, y: 82 }, false, true)
  const moved = live().editor.getScene().layers.find(layer => layer.id === child.id)!
  close(moved.transform.x, 0, 'Parent edge X did not convert into local space')
  close(moved.transform.y, 0, 'Parent edge Y did not convert into local space')
  equal(live().editor.getScene().layers.filter(layer => layer.id !== child.id), scene.layers.filter(layer => layer.id !== child.id), 'Parent snap changed parent or siblings')
  const after = structuredClone(live().editor.getScene()); await undoOnce(scene, after)
  record('Parent-only snapping aligns a child to its parent while preserving hierarchy and one Undo', { localX: 0, localY: 0 })
  await mount(); await configure()
  const original = structuredClone(live().editor.getScene())
  await click('Snap settings'); await click('Snap to Object Edges'); await click('Clear all')
  assert(!Array.from(host.querySelectorAll<HTMLInputElement>('input[data-snap-target]')).some(input => input.checked), 'Clear all left a target checked')
  equal(live().editor.getScene(), original, 'Clear all changed source'); assert(!live().editor.canUndo, 'Clear all wrote history')
  record('Tabbed Snap palette clears multiple targets without changing source/history', {})
}

/** Resize via the real edge/corner controls. Grab offset and cross-axis pointer
 * motion must not change the pinned edge. Final release re-evaluates snap and
 * commits exactly the shown geometry, with one reversible source command. */
async function resizeAndInitialKeyChecks(mount: (initial?: ChronoScene) => Promise<void>) {
  const numeric = async (label: string, value: string) => {
    const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
    assert(input, `Missing ${label}`)
    flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) }); await frames()
  }
  const configure = async () => {
    await click('View options'); await click('Viewport grid settings'); await click('Show grid'); await click('Close viewport settings'); await click('View options')
    await click('Snap settings'); await click('Enable Snapping'); await click('Snap to Object Edges'); await click('Snap to Points'); await click('Snap to Guides'); await click('Snap to Grid'); await click('Options')
    await numeric('Snap grid spacing', '40'); await numeric('Snap radius', '12'); await click('Snap settings')
  }
  const cases = [
    { handle: 'e', start: { x: 532, y: 312 }, end: { x: 559, y: 332 }, x: 450, y: 280, w: 110, h: 60, marker: { x: 560, y: 310 } },
    { handle: 'se', start: { x: 532, y: 342 }, end: { x: 559, y: 360 }, x: 450, y: 280, w: 110, h: 80, marker: { x: 560, y: 360 } },
    { handle: 'nw', start: { x: 452, y: 282 }, end: { x: 439, y: 239 }, x: 440, y: 240, w: 90, h: 100, marker: { x: 440, y: 240 } },
    { handle: 'w', start: { x: 452, y: 312 }, end: { x: 439, y: 400 }, x: 440, y: 280, w: 90, h: 60, marker: { x: 440, y: 310 } },
    { handle: 'n', start: { x: 492, y: 282 }, end: { x: 550, y: 247 }, x: 450, y: 240, w: 80, h: 100, marker: { x: 490, y: 240 } },
    { handle: 's', start: { x: 492, y: 342 }, end: { x: 600, y: 360 }, x: 450, y: 280, w: 80, h: 80, marker: { x: 490, y: 360 } },
  ]
  for (const item of cases) {
    await mount(); await configure()
    const before = structuredClone(live().editor.getScene()), row = host.querySelector<HTMLElement>('[data-virtual-row="existing"]')!
    flushSync(() => row.click()); await frames()
    const handle = host.querySelector<HTMLElement>(`[data-handle="${item.handle}"]`)!
    assert(handle, 'Missing resize handle ' + item.handle)
    pointer(handle, 'pointerdown', client(item.start)); pointer(window, 'pointermove', client({ x: item.end.x - 3, y: item.end.y - 3 })); await frames(3)
    const marker = host.querySelector<HTMLElement>('[data-testid="geometry-snap-point"]')
    assert(marker, 'No acquired handle feedback for ' + item.handle)
    close(Number(marker.dataset.x), item.marker.x, 'Preview acquired handle X'); close(Number(marker.dataset.y), item.marker.y, 'Preview acquired handle Y')
    pointer(window, 'pointerup', client(item.end)); await frames(3)
    const after = structuredClone(live().editor.getScene()), layer = after.layers.find(value => value.id === 'existing')!
    close(layer.size!.width, item.w, 'Released resize width'); close(layer.size!.height, item.h, 'Released resize height')
    close(layer.transform.x, item.x, 'Released resize X'); close(layer.transform.y, item.y, 'Released resize Y')
    close(layer.transform.anchorX, 40, 'Resize changed pivot X'); close(layer.transform.anchorY, 30, 'Resize changed pivot Y')
    assert(!live().editor.isTransactionActive() && !host.querySelector('[data-testid="geometry-snap-point"]'), 'Release left stale snap feedback/session')
    await undoOnce(before, after)
    record(`Resize ${item.handle} acquires the displayed grid handle, retains its pinned edge and commits final mouse-up once`, item)
  }
  await mount(); const before = structuredClone(live().editor.getScene())
  flushSync(() => host.querySelector<HTMLElement>('[data-virtual-row="existing"]')!.click()); await frames()
  pointer(host.querySelector('[data-handle="e"]')!, 'pointerdown', client({ x: 530, y: 310 })); pointer(window, 'pointerup', client({ x: 557, y: 330 })); await frames()
  close(live().editor.getScene().layers[0].size!.width, 107, 'Disabled Snap still changed the resize')
  await undoOnce(before, structuredClone(live().editor.getScene())); record('Resize preserves free geometry when snapping is disabled', {})
  const emptyTimeline = source(); emptyTimeline.timelines = []
  await mount(emptyTimeline)
  flushSync(() => host.querySelector<HTMLElement>('[data-virtual-row="existing"]')!.click()); await frames()
  const setKey = host.querySelector<HTMLButtonElement>('[aria-label="Set Key"] button')!
  assert(!setKey.disabled, 'Set Key remains disabled with selected layer and no Timeline')
  flushSync(() => setKey.click()); await frames(3)
  const keyed = structuredClone(live().editor.getScene())
  assert(keyed.timelines.length === 1 && keyed.timelines[0].tracks.length > 0, 'First Set Key did not create Timeline and keys')
  assert(keyed.timelines[0].tracks.every(track => track.keyframes.length === 1 && track.keyframes[0].timeMs === 0), 'First Set Key used wrong time')
  equal(keyed.layers, emptyTimeline.layers, 'Set Key changed the artwork')
  await undoOnce(emptyTimeline, keyed)
  record('First Set Key without a Timeline creates it with keys and restores it in one Undo/Redo', { tracks: keyed.timelines[0].tracks.length })
}

async function main() {
  document.body.innerHTML = '<style>body{margin:16px;background:#0f172a;color:#e2e8f0;font:14px system-ui}body>button,nav>button{padding:7px 11px;background:#1d4ed8;color:white;border:1px solid #64748b;border-radius:5px}button:disabled{opacity:.4}#placement-host{width:1240px;max-width:100%;border:1px solid #475569;display:flex;flex-direction:column}pre{white-space:pre-wrap;overflow-wrap:anywhere}#checks{color:#86efac}</style><h1>Shape placement and crosshair acceptance</h1><p>Real LayerPanel Add + SceneCanvas + editor/history; isolated source, no connected document edits.</p><button id="run">Run placement checks</button><button id="inspect">Open editable placement fixture</button><p id="status">Ready</p><pre id="checks"></pre><section id="placement-host"></section><pre id="report">No checks run.</pre><h2>Pointer trace</h2><pre id="pointer-trace">Ready for trusted browser input.</pre>'
  host = document.getElementById('placement-host')!; const root = createRoot(host); let generation = 0
  const mount = async (initial = source()) => { runtime = undefined; pointerTrace.length = 0; flushSync(() => root.render(<Subject key={++generation} initial={initial} />)); await frames(4); assert(!live().snap, 'Fixture snap did not disable') }
  const run = document.getElementById('run') as HTMLButtonElement, inspect = document.getElementById('inspect') as HTMLButtonElement
  inspect.onclick = () => { void mount() }
  run.onclick = async () => { run.disabled = inspect.disabled = true; checks.length = 0; document.getElementById('checks')!.textContent = ''; const start = performance.now(); let manifest: unknown
    try { document.getElementById('status')!.textContent = 'Running production placement controls…'; const data = await (await fetch('shape-placement-sources.json')).json()
      manifest = { sourceManifest: 'shape-placement-sources.json', bundleSha256: data.bundleSha256, sourceFiles: data.sources.length }
      await creationChecks(mount); await geometryChecks(mount); await lifecycleChecks(mount); await panToCreationChecks(mount); await contextMenuChecks(mount); await viewportGridChecks(mount); await snappingChecks(mount); await resizeAndInitialKeyChecks(mount)
      document.getElementById('status')!.textContent = `PASS · ${checks.length} checks`; document.getElementById('report')!.textContent = JSON.stringify({ passed: true, checks, manifest, elapsedMs: performance.now() - start, dpr: devicePixelRatio, userAgent: navigator.userAgent }, null, 2)
    } catch (error) { document.getElementById('status')!.textContent = 'FAIL'; document.getElementById('report')!.textContent = JSON.stringify({ passed: false, error: String(error), checks, manifest }, null, 2) }
    finally { run.disabled = inspect.disabled = false }
  }
}
void main().catch(error => { document.body.textContent = `Shape placement QA setup failed: ${String(error)}` })
