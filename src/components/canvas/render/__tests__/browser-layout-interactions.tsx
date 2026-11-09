import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SceneCanvas from '@/components/SceneCanvas'
import PropertiesPanel from '@/components/PropertiesPanel'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newCircleLayer, newRectLayer, newTimeline } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'
import { evaluateTimelines } from '@/lib/evaluator'
import { resolveLayerWorldBounds } from '@/lib/geometry/resolveLayerWorldBounds'
import { buildViewportKeyframeCommands } from '@/lib/editor/viewportKeyframes'
import { createLayerSelection, toggleLayerSelection, type LayerSelection } from '@/lib/selection/layerSelection'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { acquirePortableScene } from '@/lib/export/portable/PortableSceneOutput'
import { acquireRasterImage } from '@/lib/export/raster/RasterExportEngine'
import { acquireOutputCanvas, OutputResources } from '@/lib/export/resources'
import { makeSceneGuidesCmd } from '@/lib/editor/guides/SceneGuides'

type Point = { x: number; y: number }
interface Fixture { scene: ChronoScene; selected: string[]; primary: string | null; timeMs?: number; diagnostic?: boolean; properties?: boolean }
interface Runtime { editor: EditorStateReturn; selection: LayerSelection; snap: boolean }
interface Check { name: string; passed: true; evidence: unknown }
let runtime: Runtime | undefined, host: HTMLElement
const checks: Check[] = []
const pointerTrace: unknown[] = [], canvasNodes = new WeakMap<Element, number>()
const sourceNodes = new WeakMap<object, number>(), documents = new WeakMap<object, number>()
let canvasNodeSequence = 0, sourceSequence = 0, documentSequence = 0

/** Test-only capture observer. Read actual pointer/capture state, authored
 * transforms and editor lifecycle without patching production pointer APIs. */
function tracePointer(phase: string, event?: PointerEvent) {
  const state = runtime, element = host.querySelector('canvas'), target = event?.target
  if (element && !canvasNodes.has(element)) canvasNodes.set(element, ++canvasNodeSequence)
  const source = state?.editor.getScene(), documentSignal = state?.editor.getDocumentSignal(), rect = element?.getBoundingClientRect()
  if (source && !sourceNodes.has(source)) sourceNodes.set(source, ++sourceSequence)
  if (documentSignal && !documents.has(documentSignal)) documents.set(documentSignal, ++documentSequence)
  pointerTrace.push({ phase, type: event?.type, trusted: event?.isTrusted, pointerId: event?.pointerId,
    target: target instanceof Element ? `${target.tagName}${target.getAttribute('data-testid') ? `:${target.getAttribute('data-testid')}` : ''}${target.getAttribute('aria-label') ? `:${target.getAttribute('aria-label')}` : ''}` : undefined,
    client: event ? [event.clientX, event.clientY] : undefined, canvasNode: element && canvasNodes.get(element),
    canvasConnected: element?.isConnected, captured: !!event && !!element?.hasPointerCapture(event.pointerId),
    canvasRect: rect && [rect.left, rect.top, rect.width, rect.height], source: source && sourceNodes.get(source),
    document: documentSignal && documents.get(documentSignal), documentAborted: documentSignal?.aborted,
    selection: state && Array.from(state.selection.selectedIds), transaction: state?.editor.isTransactionActive(), canUndo: state?.editor.canUndo,
    layers: state?.editor.getScene().layers.map(layer => ({ id: layer.id, parentId: layer.parentId ?? null, x: layer.transform.x, y: layer.transform.y })) })
  if (pointerTrace.length > 100) pointerTrace.shift()
  const output = document.getElementById('pointer-trace'); if (output) output.textContent = JSON.stringify(pointerTrace, null, 2)
}

/** Real production canvas and editor lifecycle; the fixture supplies only
 * ordinary selection, evaluated animation and the same public key-command
 * callback as the main page. It never changes gap or guide implementation. */
function Subject({ fixture }: { fixture: Fixture }) {
  const editor = useEditorState(fixture.scene), assets = useAssetCache(editor.scene.assets), snap = useSnapSettings()
  const [selection, setSelection] = useState(() => createLayerSelection(fixture.selected, fixture.primary))
  const ids = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds]), timeMs = fixture.timeMs ?? 500
  const frame = useMemo(() => evaluateTimelines(editor.scene.timelines, timeMs), [editor.scene.timelines, timeMs])
  useEffect(() => { snap.setEnabled(false) }, [])
  useLayoutEffect(() => { runtime = { editor, selection, snap: snap.settings.enabled }; if (fixture.diagnostic) tracePointer('render') })
  useEffect(() => {
    if (!fixture.diagnostic) return
    const observe = (event: PointerEvent) => { tracePointer('capture', event); queueMicrotask(() => tracePointer('after-event', event)) }
    const blur = () => tracePointer('window-blur')
    const types = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture'] as const
    types.forEach(type => window.addEventListener(type, observe, true))
    window.addEventListener('blur', blur, true)
    return () => { types.forEach(type => window.removeEventListener(type, observe, true)); window.removeEventListener('blur', blur, true) }
  }, [fixture.diagnostic])
  return <><nav style={{ display: 'flex', gap: 8, padding: 8 }}>
    <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
    <button onClick={() => { snap.setEnabled(true); snap.setTarget('objects', false); snap.setTarget('points', false)
      snap.setTarget('grid', false); snap.setTarget('pixel', false); snap.setTarget('guides', true) }}>Enable guide snapping only</button>
    <button onClick={() => { const layer = editor.getScene().layers.find(item => item.id === 'right'); if (!layer) return
      editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { ...layer, transform: { ...layer.transform, x: layer.transform.x + 1 } }, layer)) }}>Manual layout edit</button>
    {fixture.diagnostic && <><button onClick={() => setSelection(createLayerSelection([]))}>Deselect all</button>
      <button onClick={() => setSelection(createLayerSelection(['circle-a'], 'circle-a'))}>Select first circle</button>
      <button onClick={() => { pointerTrace.length = 0; tracePointer('reset') }}>Reset pointer trace</button>
      <button onClick={() => { const viewport = host.querySelector('[data-testid="canvas-viewport"]'); assert(viewport, 'Missing pointer-up test boundary.')
        viewport.addEventListener('pointerup', event => { event.stopPropagation(); tracePointer('consumed-pointerup', event as PointerEvent) }, { once: true })
      }}>Consume next pointer-up bubble</button></>}
  </nav><output aria-label="Layout scene summary">Layers {editor.scene.layers.length} · Selection {Array.from(selection.selectedIds).join(', ')} · Transaction {String(editor.isTransactionActive())} · Undo {String(editor.canUndo)}</output>
  <div style={{ display: 'flex', height: 680 }}><section data-panel="canvas" style={{ display: 'flex', position: 'relative', flex: 1, minWidth: 0 }}>
    <SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap} selectedLayerId={selection.primaryId}
      selectedLayerIds={ids} timeMs={timeMs} overrides={frame} isPlaying={false} previewMode={false} toolMode="select"
      onSelectLayer={(id, shift = false) => setSelection(previous => !id ? createLayerSelection([])
        : shift ? toggleLayerSelection(previous, id) : createLayerSelection([id], id))}
      onSelectByGeometry={next => setSelection(createLayerSelection(next, Array.from(next)[0] ?? null))}
      onSelectLayers={next => setSelection(createLayerSelection(next, next[0] ?? null))}
      selectedTimeline={editor.scene.timelines[0] ?? null}
      buildLayerCommitCommands={changes => buildViewportKeyframeCommands(editor.getScene(), changes, {
        timelineId: editor.scene.timelines[0]?.id ?? '', timeMs, autoKeyframe: false,
      })} />
  </section>{fixture.properties && <div style={{ width: 280, display: 'flex', minHeight: 0 }}>
    <PropertiesPanel layer={editor.scene.layers.find(layer => layer.id === selection.primaryId) ?? null}
      scene={editor.scene} composition={editor.scene.composition} allLayers={editor.scene.layers} allTimelines={editor.scene.timelines}
      parameters={editor.scene.parameters} dispatchCommand={editor.dispatchCommand} currentTimeMs={timeMs} selectedTimelineId={editor.scene.timelines[0]?.id}
      onLayerChange={next => { tracePointer(`properties-update:${next.id}`); const previous = editor.scene.layers.find(layer => layer.id === next.id)
        if (previous) editor.dispatchCommand(makeUpdateLayerCmd(next.id, next, previous)); tracePointer('properties-committed') }}
      onCompositionChange={next => { const previous = editor.getScene(); tracePointer('composition-update')
        editor.dispatchCommand({ label: 'Update Composition', execute: source => ({ ...source, composition: next }), undo: () => previous }) }} />
  </div>}</div><pre data-testid="layout-scene-debug">{JSON.stringify({ selected: Array.from(selection.selectedIds), transaction: editor.isTransactionActive(), canUndo: editor.canUndo,
    timeMs, displayBounds: fixture.diagnostic ? editor.scene.layers.map(layer => ({ id: layer.id, bounds: resolveLayerWorldBounds(layer, editor.scene, timeMs, frame) })) : undefined,
    scene: editor.scene }, null, 2)}</pre></>
}

/** Simple geometry matches the user's stacked-left/middle-right example. */
function rectangle(id: string, x: number, y: number): Layer {
  return { ...newRectLayer(), id, name: id, size: { width: 80, height: 60 },
    transform: { x, y, anchorX: 0, anchorY: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 },
    style: { fill: { type: 'solid', color: '#3b82f6', opacity: 100 } } }
}
/** Inline scene uses no media or connected user document. Optional keys keep
 * original metadata around the edit frame, so a one-key rewrite cannot pass. */
function fixture(kind: 'four' | 'animated' | 'parent' = 'four'): Fixture {
  const top = rectangle('top', 100, 100), middle = rectangle('middle', 100, 250)
  const bottom = rectangle('bottom', 100, 400), right = rectangle('right', 350, 250)
  const scene = { ...emptyScene(), layers: [top, middle, bottom, right] }
  scene.composition = { ...scene.composition, width: 900, height: 600, durationMs: 2000 }
  scene.timelines = [{ ...newTimeline(), id: 'position', durationMs: 2000, loop: false, layerIds: scene.layers.map(layer => layer.id), tracks: [] }]
  if (kind === 'animated') scene.timelines[0].tracks = [{ target: 'layers.right.transform.x', label: 'Human X', keyframes: [
    { id: 'first', timeMs: 0, value: 350, easing: { type: 'linear' }, tangentMode: 'broken' },
    { id: 'last', timeMs: 1000, value: 390, easing: { type: 'linear' } },
  ] }]
  if (kind === 'parent') {
    const parent: Layer = { ...rectangle('parent', 100, 250), type: 'group', size: undefined,
      transform: { x: 100, y: 250, anchorX: 0, anchorY: 0, scaleX: 1.2, scaleY: 0.8, rotationDeg: 12 } }
    const child = { ...rectangle('child', 0, 0), parentId: parent.id }
    scene.layers = [parent, child, right]
    return { scene, selected: ['parent', 'child', 'right'], primary: 'right' }
  }
  return { scene, selected: kind === 'four' ? ['top', 'middle', 'bottom', 'right'] : ['middle', 'right'], primary: 'middle' }
}

/** User-reported context: ordinary circles, no selected layer, Select tool,
 * playhead 1200ms while the empty active timeline lasts 600ms. No user assets. */
function firstDragFixture(properties = false): Fixture {
  const positions = [[55, 40], [225, 40], [55, 145], [225, 145]]
  const scene = { ...emptyScene(), layers: positions.map(([x, y], index): Layer => ({
    ...newCircleLayer(), id: `circle-${String.fromCharCode(97 + index)}`, name: `Circle ${index + 1}`,
    size: { width: 50, height: 50 }, transform: { x, y, anchorX: 25, anchorY: 25, scaleX: 1, scaleY: 1, rotationDeg: 0 },
    style: { fill: { type: 'solid', color: '#3b82f6', opacity: 100 } },
  })) }
  scene.composition = { ...scene.composition, width: 360, height: 240, durationMs: 1200 }
  scene.timelines = [{ ...newTimeline(), id: 'empty-600', durationMs: 600, loop: false, layerIds: scene.layers.map(layer => layer.id), tracks: [] }]
  return { scene, selected: [], primary: null, timeMs: 1200, diagnostic: true, properties }
}
/** Fail loudly, including absent controls, instead of recording skipped passes. */
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
/** Read after actual production React commits. */
function live(): Runtime { assert(runtime, 'Layout subject did not mount.'); return runtime }
/** Full authored comparison retains metadata and unrelated source fields. */
function equal(a: unknown, b: unknown, message: string) { assert(JSON.stringify(a) === JSON.stringify(b), message) }
/** Subpixel tolerance for independently queried composition-space bounds. */
function close(a: number, b: number, message: string) { assert(Number.isFinite(a) && Math.abs(a - b) < 1e-4, `${message}: ${a} != ${b}`) }
/** Yield through actual browser paints rather than fixed timeout guesses. */
async function frames(count = 2) { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame) }
/** Public exact accessible names keep fixture assertions independent of hooks. */
function control(name: string): HTMLElement {
  const item = Array.from(document.querySelectorAll<HTMLElement>('[aria-label],button,input,select')).find(el => el.getAttribute('aria-label') === name || el.tagName === 'BUTTON' && el.textContent?.trim() === name)
  assert(item, `Missing public layout control '${name}'.`); return item
}
/** Click production DOM handlers. */
async function click(name: string) { flushSync(() => control(name).click()); await frames() }
/** Native value setter routes input changes through React's actual handler. */
async function value(name: string, next: number | string) {
  const el = control(name) as HTMLInputElement
  flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, String(next))
    el.dispatchEvent(new Event('input', { bubbles: true })) }); await frames()
}
/** Locate one visible nearest-neighbor annotation, not a reconstructed solver. */
function gap(axis: 'x' | 'y', before: string, after: string): HTMLElement {
  const item = host.querySelector<HTMLElement>(`[data-gap-axis="${axis}"][data-gap-before-id="${before}"][data-gap-after-id="${after}"]`)
  assert(item, `Missing ${axis} gap ${before} → ${after}.`); return item
}
/** Full pointer activation exercises selection-preserving pointer ownership
 * before the ordinary click opens the real numeric controls. */
async function openGap(axis: 'x' | 'y', before: string, after: string) { const label = gap(axis, before, after), r = label.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  pointer(label, 'pointerdown', point); pointer(label, 'pointerup', point); flushSync(() => label.click()); await frames() }
/** Compare selection membership independently of primary-ID ordering. */
function selected(ids: string[]) { equal(Array.from(live().selection.selectedIds).sort(), ids.slice().sort(), 'Measurement controls lost layer selection.') }
/** Query rendered/evaluated world bounds through the shared renderer contract. */
function bounds(scene: ChronoScene, id: string) {
  const layer = scene.layers.find(item => item.id === id); assert(layer, `Missing ${id}`)
  const result = resolveLayerWorldBounds(layer, scene, 500); assert(result, `Missing bounds for ${id}`); return result
}
/** Native pointer events use the public capture/window boundary, no stub refs. */
function pointer(target: EventTarget, type: string, point: Point, buttons = 1) {
  flushSync(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1,
    pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : buttons, clientX: point.x, clientY: point.y })))
}
/** Canvas CSS rectangle is the public composition/pan/zoom boundary. */
function canvas(): HTMLCanvasElement { const result = host.querySelector('canvas'); assert(result, 'Missing canvas'); return result }
/** Convert a composition point using the current actually displayed canvas. */
function clientPoint(point: Point): Point { const r = canvas().getBoundingClientRect(), size = live().editor.getScene().composition
  return { x: r.left + point.x * r.width / size.width, y: r.top + point.y * r.height / size.height } }
/** Actual renderer pixels substantiate the evaluated position; SVG labels or
 * source transforms alone do not prove the blue rectangle moved on screen. */
function bluePixel(point: Point): number[] { const el = canvas(), ctx = el.getContext('2d'); assert(ctx, 'Missing actual 2D render context.')
  const rgba = Array.from(ctx.getImageData(Math.round(point.x * el.width / 900), Math.round(point.y * el.height / 600), 1, 1).data)
  equal(rgba, [59, 130, 246, 255], 'Committed blue object did not render at its evaluated position.'); return rgba }
/** Select a public title without depending on an internal hook or state. */
function titled(title: string): HTMLElement { const result = Array.from(host.querySelectorAll<HTMLElement>('[title]')).find(item => item.title === title); assert(result, `Missing ${title}`); return result }
/** Stored guide data is source state; rendered line positions alone cannot
 * prove persistence or stable IDs after undo/redo. */
function guides(scene = live().editor.getScene()) { return scene.editorGuides?.guides ?? [] }
/** Observable proof appears only after all invariants for a check pass. */
function record(name: string, evidence: unknown) { checks.push({ name, passed: true, evidence }); document.getElementById('checks')!.textContent = checks.map(item => `✓ ${item.name}`).join('\n') }

/** Stacked rectangles have two vertical neighbors and only the aligned middle
 * horizontal neighbor; diagonals must not create all-pairs clutter. */
async function nearestChecks(mount: (source?: Fixture) => Promise<void>) {
  await mount(); const items = host.querySelectorAll('[data-gap-axis]')
  assert(items.length === 3, `Expected three nearest gaps, found ${items.length}.`)
  gap('y', 'top', 'middle'); gap('y', 'middle', 'bottom'); gap('x', 'middle', 'right')
  assert(!host.querySelector('[data-gap-before-id="top"][data-gap-after-id="right"]'), 'Diagonal top/right measurement was shown.')
  record('Four-rectangle selection shows two vertical gaps and one horizontal gap without diagonals', { annotations: items.length })
  const before = structuredClone(live().editor.getScene())
  await openGap('x', 'middle', 'right'); selected(['top', 'middle', 'bottom', 'right'])
  const input = control('Gap (px)'); input.focus(); selected(['top', 'middle', 'bottom', 'right'])
  await value('Gap (px)', 240); await click('Apply gap edit')
  const after = live().editor.getScene(), a = bounds(after, 'middle'), b = bounds(after, 'right')
  close(b.x - a.x - a.width, 240, 'Applied horizontal gap'); selected(['top', 'middle', 'bottom', 'right'])
  const rgba = bluePixel({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  for (const id of ['top', 'middle', 'bottom']) equal(after.layers.find(layer => layer.id === id), before.layers.find(layer => layer.id === id), `Gap moved fixed/unrelated ${id}.`)
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Gap undo did not restore exact source.'); assert(!live().editor.canUndo, 'Gap edit created multiple history steps.')
  flushSync(() => live().editor.redo()); equal(live().editor.getScene(), after, 'Gap redo changed source records.')
  record('Gap label editing retains selection, fixes active object and commits one undo/redo', { gap: 240, movingId: 'right', rgba })
}

/** Existing keys preserve identity/easing/timing; the edit adds only the pose
 * key at the displayed playhead through the production viewport adapter. */
async function animatedCheck(mount: (source?: Fixture) => Promise<void>) {
  await mount(fixture('animated')); const before = structuredClone(live().editor.getScene())
  await openGap('x', 'middle', 'right'); await value('Gap (px)', 250); await click('Apply gap edit')
  const after = live().editor.getScene(), a = bounds(after, 'middle'), b = bounds(after, 'right')
  close(b.x - a.x - a.width, 250, 'Keyed gap evaluated position')
  const old = before.timelines[0].tracks[0], current = after.timelines[0].tracks.find(track => track.target === old.target)!
  for (const key of old.keyframes) equal(current.keyframes.find(item => item.id === key.id), key, 'Measurement rewrote an existing key.')
  assert(current.keyframes.some(key => key.timeMs === 500), 'Gap edit omitted displayed-frame key.')
  selected(['middle', 'right']); flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Keyed gap undo incomplete.')
  record('Animated gap writes the displayed pose while preserving surrounding human keys', { oldKeyIds: old.keyframes.map(key => key.id), editedTimeMs: 500 })
}

/** Root normalization prevents selected parent+child from being moved twice. */
async function parentCheck(mount: (source?: Fixture) => Promise<void>) {
  await mount(fixture('parent')); const before = structuredClone(live().editor.getScene())
  assert(host.querySelectorAll('[data-gap-axis]').length === 1, 'Selected child created duplicate parent measurement.')
  await openGap('x', 'parent', 'right'); await value('Gap (px)', 120); await click('Apply gap edit')
  const after = live().editor.getScene(), a = bounds(after, 'parent'), b = bounds(after, 'right')
  close(b.x - a.x - a.width, 120, 'Parent group gap')
  equal(after.layers.find(layer => layer.id === 'child'), before.layers.find(layer => layer.id === 'child'), 'Selected child was transformed twice.')
  equal(after.layers.find(layer => layer.id === 'right'), before.layers.find(layer => layer.id === 'right'), 'Active peer did not remain fixed.')
  selected(['parent', 'child', 'right']); flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Parent gap undo incomplete.')
  record('Parent+child normalization moves only the group root under rotated nonuniform scale', { fixed: 'right', moving: 'parent' })
}

/** Cancel and concurrent manual edits cannot apply a stale source plan. */
async function cancellationChecks(mount: (source?: Fixture) => Promise<void>) {
  await mount(); const before = structuredClone(live().editor.getScene())
  await openGap('x', 'middle', 'right'); await value('Gap (px)', 300)
  flushSync(() => control('Gap (px)').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await frames()
  equal(live().editor.getScene(), before, 'Escape committed a gap edit.'); assert(!live().editor.canUndo, 'Escape wrote history.'); selected(['top', 'middle', 'bottom', 'right'])
  record('Escape cancels measurement editing without dropping selection or writing history', { sourceUnchanged: true })
  await openGap('x', 'middle', 'right'); await value('Gap (px)', 320); await click('Cancel gap edit')
  equal(live().editor.getScene(), before, 'Cancel wrote a measurement edit.'); assert(!live().editor.canUndo, 'Cancel wrote history.')
  await openGap('x', 'middle', 'right'); await value('Gap (px)', 330); await click('Manual layout edit')
  const manual = structuredClone(live().editor.getScene()); assert((control('Apply gap edit') as HTMLButtonElement).disabled, 'Stale measurement Apply remained enabled.')
  await click('Apply gap edit'); equal(live().editor.getScene(), manual, 'Stale measurement overwrote manual source.')
  record('Cancel and concurrent manual source edit cannot commit a stale gap plan', { sourceGuard: true })
}

/** Mouse coordinates come from the actual canvas after pan and zoom. The
 * constant-CSS-size point, guides and ruler marks share that mapping without
 * intercepting input or writing source/history. Leaving cancels pending marks. */
async function cursorCheck(mount: (source?: Fixture) => Promise<void>) {
  const source = fixture(); source.scene.editorGuides = { version: 1, guides: [{ id: 'cursor-v', axis: 'v', position: 240 }, { id: 'cursor-h', axis: 'h', position: 175 }] }
  await mount(source); const point = { x: 240, y: 175 }, before = structuredClone(live().editor.getScene())
  let pointSize: { width: number; height: number } | undefined
  const aligned = () => { const expected = clientPoint(point)
    const v = host.querySelector('[data-testid="guide-line-cursor-v"]'), h = host.querySelector('[data-testid="guide-line-cursor-h"]'); assert(v && h, 'Alignment source guides disappeared.')
    const vr = v.getBoundingClientRect(), hr = h.getBoundingClientRect()
    assert(Math.abs(vr.left + vr.width / 2 - expected.x) < 0.1 && Math.abs(hr.top + hr.height / 2 - expected.y) < 0.1, 'Persisted guide chrome lagged behind actual canvas pan/zoom.')
    const tick = Array.from(control('Horizontal ruler').querySelectorAll('span')).find(item => item.textContent === '300')?.parentElement
    assert(tick && Math.abs(tick.getBoundingClientRect().left - clientPoint({ x: 300, y: 0 }).x) < 0.1, 'Ruler tick origin lagged behind canvas pan/zoom.') }
  const inspect = async () => { pointer(canvas(), 'pointermove', clientPoint(point), 0); await frames()
    const mark = host.querySelector<HTMLElement>('[data-testid="canvas-cursor-crosshair"]'); assert(mark, 'Cursor crosshair did not appear.')
    close(Number(mark.dataset.x), point.x, 'Cursor composition X'); close(Number(mark.dataset.y), point.y, 'Cursor composition Y')
    const x = host.querySelector('[data-testid="ruler-cursor-x"]'), y = host.querySelector('[data-testid="ruler-cursor-y"]'), expected = clientPoint(point)
    assert(x && y && Math.abs(x.getBoundingClientRect().left - expected.x) < 0.1 && Math.abs(y.getBoundingClientRect().top - expected.y) < 0.1, 'Cursor ruler marks did not align with actual canvas pixels.')
    const dot = host.querySelector('[data-testid="canvas-cursor-point"]'); assert(dot, 'Mouse point did not appear at the crosshair intersection.')
    const r = dot.getBoundingClientRect()
    assert(r.width > 0 && r.height > 0 && r.width <= 16 && r.height <= 16, 'Mouse point is missing or obscures the editing area.')
    assert(Math.abs(r.left + r.width / 2 - expected.x) < 0.1 && Math.abs(r.top + r.height / 2 - expected.y) < 0.1, 'Mouse point did not track actual canvas pixels.')
    assert(getComputedStyle(dot).pointerEvents === 'none', 'Mouse point intercepts viewport input.')
    if (pointSize) { close(r.width, pointSize.width, 'Point CSS width changed with zoom'); close(r.height, pointSize.height, 'Point CSS height changed with zoom') }
    else pointSize = { width: r.width, height: r.height }
  }
  aligned(); await inspect(); flushSync(() => titled('Zoom in (Cmd+scroll)').click()); await frames(); aligned(); await inspect()
  const start = clientPoint({ x: 650, y: 450 }), end = { x: start.x + 25, y: start.y - 15 }
  flushSync(() => canvas().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 1, buttons: 4, clientX: start.x, clientY: start.y })))
  pointer(window, 'pointermove', end, 4); pointer(window, 'pointerup', end, 0); await frames(); aligned(); await inspect()
  const viewport = host.querySelector('[data-testid="canvas-viewport"]'); assert(viewport, 'Missing viewport leave boundary.')
  pointer(canvas(), 'pointermove', clientPoint({ x: 245, y: 180 }), 0)
  pointer(viewport, 'pointerleave', clientPoint({ x: -1000, y: -1000 }), 0); await frames()
  assert(!host.querySelector('[data-testid="canvas-cursor-point"]') && !host.querySelector('[data-testid="canvas-cursor-crosshair"]'), 'Mouse point survived viewport leave or a pending pointer callback.')
  equal(live().editor.getScene(), before, 'Cursor motion wrote scene source.'); assert(!live().editor.canUndo, 'Cursor motion wrote history.')
  selected(['top', 'middle', 'bottom', 'right'])
  record('Mouse point and ruler/crosshair coordinates stay aligned after zoom/pan, pass input through and clear on leave', { compositionPoint: point, pointCssSize: pointSize, sourceUnchanged: true })
}

/** The selection status reserves normal-flow space outside the viewport.
 * Selecting/deselecting and replacing the real PropertiesPanel content must
 * not move the artboard or put the footer inside its pan/zoom transform. */
async function footerCheck(mount: (source?: Fixture) => Promise<void>) {
  await mount(firstDragFixture(true)); const source = structuredClone(live().editor.getScene())
  const inspect = () => {
    const workspace = host.querySelector('[data-testid="canvas-workspace"]'), viewport = host.querySelector('[data-testid="canvas-viewport"]')
    const footer = host.querySelector('[data-testid="canvas-selection-summary"]'); assert(workspace && viewport && footer, 'Missing viewport/footer boundaries.')
    assert(footer.parentElement === workspace && !viewport.contains(footer), 'Selection status remained inside the interactive or transformed artboard.')
    const f = footer.getBoundingClientRect(), v = viewport.getBoundingClientRect(), w = workspace.getBoundingClientRect()
    close(f.height, 32, 'Footer did not reserve 32 CSS pixels')
    assert(f.top >= v.bottom - .1 && f.bottom <= w.bottom + .1, 'Footer overlays rather than reserves viewport space.')
    assert(getComputedStyle(footer).transform === 'none' && getComputedStyle(workspace).transform === 'none', 'Footer inherits an artboard transform.')
    const r = canvas().getBoundingClientRect(); return [r.left, r.top, r.width, r.height]
  }
  const before = inspect(); await click('Select first circle'); equal(inspect(), before, 'First selection moved the displayed artboard.')
  await click('Deselect all'); equal(inspect(), before, 'Deselecting moved the displayed artboard.')
  equal(live().editor.getScene(), source, 'Footer or property selection wrote scene source.'); assert(!live().editor.canUndo, 'Footer selection wrote history.')
  record('Selection status stays outside the artboard in a reserved 32px footer through first selection and deselection', { footerCssHeight: 32, artboardUnchanged: true })
}

/** Synthetic events verify source/key/undo behavior for the reported empty
 * selection and 1200ms/600ms clock context, including off-artboard movement.
 * Trusted browser capture is deliberately left observable in the separate
 * editable diagnostic fixture; these dispatched events cannot prove UA capture. */
async function firstDragCheck(mount: (source?: Fixture) => Promise<void>) {
  await mount(firstDragFixture(true)); const evidence: unknown[] = []
  const deltas = [{ x: -110, y: -90 }, { x: 330, y: 0 }, { x: 0, y: 250 }]
  for (let index = 0; index < deltas.length; index++) {
    if (index === 1) await click('Deselect all')
    selected(index === 2 ? ['circle-a'] : [])
    const before = structuredClone(live().editor.getScene()), layer = before.layers[0], delta = deltas[index]
    const start = clientPoint({ x: layer.transform.x + 25, y: layer.transform.y + 25 }), rect = canvas().getBoundingClientRect()
    const end = { x: start.x + delta.x * rect.width / 360, y: start.y + delta.y * rect.height / 240 }
    pointer(canvas(), 'pointerdown', start); await frames(); pointer(window, 'pointermove', end); await frames(); pointer(window, 'pointerup', end); await frames(4)
    const current = live().editor.getScene(), moved = current.layers.find(item => item.id === 'circle-a')!
    close(moved.transform.x, layer.transform.x + delta.x, 'First drag X reverted or clamped')
    close(moved.transform.y, layer.transform.y + delta.y, 'First drag Y reverted or clamped')
    equal(current.layers.slice(1), before.layers.slice(1), 'First drag moved unrelated circles.'); selected(['circle-a'])
    assert(live().editor.canUndo && !live().editor.isTransactionActive(), 'First drag did not commit its transaction.')
    evidence.push({ startedSelected: index === 2, delta, committed: { x: moved.transform.x, y: moved.transform.y } })
    flushSync(() => live().editor.undo()); await frames(); equal(live().editor.getScene(), before, 'First drag undo did not restore complete source.')
    assert(!live().editor.canUndo, 'First drag wrote more than one undo entry.')
  }
  record('Empty selection first drag, repeated deselection and selected drag commit beyond artboard bounds in one undo', { timeMs: 1200, timelineMs: 600, propertiesPanel: true, attempts: evidence, pointerEvents: 'synthetic; trusted capture inspected separately' })
}

/** A target/ancestor widget can consume a release before the window bubble
 * phase. The owner must finish in capture phase and a subsequent capture-loss
 * event must not roll back its committed object/guide transaction. Only the
 * fixture DOM receives the consuming listener; production code is not patched. */
async function consumedReleaseCheck(mount: (source?: Fixture) => Promise<void>) {
  await mount(firstDragFixture(true)); const beforeObject = structuredClone(live().editor.getScene())
  const start = clientPoint({ x: 80, y: 65 }), end = clientPoint({ x: 110, y: 85 }), target = canvas()
  target.addEventListener('pointerup', event => event.stopPropagation(), { once: true })
  pointer(target, 'pointerdown', start); await frames(); pointer(window, 'pointermove', end); await frames()
  pointer(target, 'pointerup', end); pointer(target, 'lostpointercapture', end, 0); await frames()
  close(live().editor.getScene().layers[0].transform.x, 85, 'Consumed release rolled back first selected-object X')
  close(live().editor.getScene().layers[0].transform.y, 60, 'Consumed release rolled back first selected-object Y')
  assert(!live().editor.isTransactionActive(), 'Consumed object release left a transaction open.')
  flushSync(() => live().editor.undo()); await frames(); equal(live().editor.getScene(), beforeObject, 'Consumed object release undo failed.')
  assert(!live().editor.canUndo, 'Consumed object release wrote multiple history entries.')
  const source = fixture(); source.scene.editorGuides = { version: 1, guides: [{ id: 'consumed-v', axis: 'v', position: 260 }] }
  await mount(source); const beforeGuide = structuredClone(live().editor.getScene())
  const line = host.querySelector<HTMLElement>('[data-testid="guide-line-consumed-v"]'); assert(line, 'Missing release-consumer guide target.')
  line.addEventListener('pointerup', event => event.stopPropagation(), { once: true })
  const from = clientPoint({ x: 260, y: 450 }), to = clientPoint({ x: 300, y: 450 })
  pointer(line, 'pointerdown', from); pointer(window, 'pointermove', to); await frames()
  pointer(line, 'pointerup', to); pointer(line, 'lostpointercapture', to, 0); await frames()
  close(guides()[0].position, 300, 'Consumed guide release rolled back its committed position')
  assert(!live().editor.isTransactionActive(), 'Consumed guide release left a transaction open.')
  flushSync(() => live().editor.undo()); await frames(); equal(live().editor.getScene(), beforeGuide, 'Consumed guide release undo failed.')
  assert(!live().editor.canUndo, 'Consumed guide release wrote multiple history entries.')
  record('Target-consumed pointer-up commits first object and guide drags before capture loss without rollback', { objectDelta: { x: 30, y: 20 }, guideX: 300, sourceRestoredByOneUndo: true })
}

/** Decode a real exported PNG, not the viewport canvas. The first circle is
 * fully outside while editor guides, a pointer point, selection and footer are
 * visible. Every pixel safely outside/inside the remaining native circles must
 * be white/blue respectively; only the one-pixel antialias fringe is excluded.
 * This verifies clipping/chrome exclusion and portable negative coordinates
 * while all encode/decode surfaces/bitmap lifetimes use the output owner. */
async function rasterClipCheck(mount: (source?: Fixture) => Promise<void>) {
  const source = firstDragFixture(true)
  source.scene.editorGuides = { version: 1, guides: [{ id: 'png-v', axis: 'v', position: 160 }, { id: 'png-h', axis: 'h', position: 110 }] }
  await mount(source)
  const from = clientPoint({ x: 80, y: 65 }), to = clientPoint({ x: -80, y: -80 })
  pointer(canvas(), 'pointerdown', from); await frames(); pointer(window, 'pointermove', to); pointer(window, 'pointerup', to); await frames()
  const before = structuredClone(live().editor.getScene()), outside = before.layers[0]
  assert(outside.transform.x + 50 < 0 && outside.transform.y + 50 < 0, 'Raster clipping source circle did not move fully outside the composition.')
  assert(host.querySelector('[data-off-artboard-id="circle-a"]'), 'Off-artboard source lost its editable viewport representation.')
  pointer(canvas(), 'pointermove', clientPoint({ x: 160, y: 110 }), 0); await frames()
  assert(host.querySelector('[data-testid="canvas-cursor-point"]') && host.querySelector('[data-testid="canvas-selection-summary"]'), 'Raster test did not retain real editor chrome.')
  const resources = new OutputResources({ maxBytes: 8 * 1024 ** 2, maxEntries: 64 })
  try {
    const raster = await acquireRasterImage(live().editor.getScene(), new Map(), { format: 'png', timeMs: 1200, scale: 1, background: 'scene' }, { resources })
    try {
      assert(raster.value.width === 360 && raster.value.height === 240 && raster.value.blob.type === 'image/png', 'Raster export included viewport/footer size instead of composition dimensions.')
      const decoded = await resources.run(async scope => {
        const bitmap = await scope.prepare(360 * 240 * 4, () => createImageBitmap(raster.value.blob), image => image.width * image.height * 4, image => image.close())
        const surface = acquireOutputCanvas(scope, 360, 240)
        try {
          assert(bitmap.value.width === 360 && bitmap.value.height === 240, 'Encoded PNG dimensions differ from reported raster dimensions.')
          surface.context.drawImage(bitmap.value, 0, 0)
          const pixels = scope.own(360 * 240 * 4, () => surface.context.getImageData(0, 0, 360, 240))
          const centers = before.layers.slice(1).map(layer => ({ x: layer.transform.x + 25, y: layer.transform.y + 25 }))
          let white = 0, blue = 0
          for (let y = 0; y < 240; y++) for (let x = 0; x < 360; x++) {
            const distance = Math.min(...centers.map(center => Math.hypot(x + .5 - center.x, y + .5 - center.y)))
            if (distance >= 24 && distance <= 26) continue
            const offset = (y * 360 + x) * 4, expected = distance < 24 ? [59, 130, 246, 255] : [255, 255, 255, 255]
            assert(expected.every((value, channel) => pixels.value.data[offset + channel] === value), `PNG contains missing geometry or editor chrome/shadow at ${x},${y}.`)
            if (distance < 24) blue++; else white++
          }
          const oldSpot = Array.from(surface.context.getImageData(80, 65, 1, 1).data), insideSpot = Array.from(surface.context.getImageData(250, 65, 1, 1).data)
          equal(oldSpot, [255, 255, 255, 255], 'Fully off-artboard circle remained at its old export position.')
          equal(insideSpot, [59, 130, 246, 255], 'In-bounds circle disappeared from the actual encoded PNG.')
          return { whitePixelsChecked: white, bluePixelsChecked: blue, oldSpot, insideSpot }
        } finally { surface.release(); bitmap.release() }
      })
      try {
        const portable = await acquirePortableScene(live().editor.getScene(), { resources })
        try { const loaded = JSON.parse(JSON.stringify(portable.value)) as ChronoScene
          equal(loaded.layers[0].transform, outside.transform, 'Portable JSON changed negative off-artboard coordinates.')
          equal(loaded.editorGuides, before.editorGuides, 'Portable JSON discarded editor guides.')
        } finally { portable.release() }
        equal(live().editor.getScene(), before, 'Raster/portable export changed source coordinates or guide metadata.'); selected(['circle-a'])
        flushSync(() => live().editor.undo()); await frames(); equal(live().editor.getScene(), source.scene, 'Raster export inserted history or broke the movement undo.')
        assert(!live().editor.canUndo, 'Raster export created an additional undo entry.')
        record('Actual 360x240 PNG clips fully off-artboard geometry and excludes editor chrome while portable JSON keeps negative coordinates', { width: 360, height: 240,
          outside: { x: outside.transform.x, y: outside.transform.y }, ...decoded.value, sourceUnchanged: true })
      } finally { decoded.release() }
    } finally { raster.release() }
  } finally { resources.dispose() }
}

/** Both ruler axes create serializable source guides at the final pointer
 * position; a drag is one history command, never one edit per movement. */
async function guideCreationCheck(mount: (source?: Fixture) => Promise<void>) {
  await mount(); const before = structuredClone(live().editor.getScene())
  const top = control('Horizontal ruler'), topRect = top.getBoundingClientRect(), start = { x: clientPoint({ x: 260, y: 0 }).x, y: topRect.top + topRect.height / 2 }
  pointer(top, 'pointerdown', start); pointer(window, 'pointerup', start); await frames()
  let list = guides(); assert(list.length === 1 && list[0].axis === 'v', 'Top ruler did not create one vertical guide.'); close(list[0].position, 260, 'Top ruler guide position')
  const verticalId = list[0].id, afterFirst = structuredClone(live().editor.getScene())
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Ruler create undo incomplete.'); assert(!live().editor.canUndo, 'Guide create produced multiple history entries.')
  flushSync(() => live().editor.redo()); equal(live().editor.getScene(), afterFirst, 'Guide redo changed ID or source.')
  const left = control('Vertical ruler'), leftRect = left.getBoundingClientRect(), down = { x: leftRect.left + leftRect.width / 2, y: clientPoint({ x: 0, y: 320 }).y }, end = { x: down.x + 50, y: clientPoint({ x: 0, y: 350 }).y }
  pointer(left, 'pointerdown', down); pointer(window, 'pointermove', end); pointer(window, 'pointerup', end); await frames()
  list = guides(); assert(list.length === 2 && list.some(item => item.id === verticalId), 'Second ruler replaced the first guide.')
  const horizontal = list.find(item => item.axis === 'h'); assert(horizontal, 'Left ruler did not create a horizontal guide.'); close(horizontal.position, 350, 'Ruler final drag position')
  selected(['top', 'middle', 'bottom', 'right'])
  record('Top click and left ruler drag create both guide axes, preserve selection and undo with stable IDs', { verticalId, horizontalId: horizontal.id })
}

/** Cancelling a real ruler pointer transaction must roll back its preview;
 * a late pointer-up after Escape must not resurrect a provisional guide. */
async function guideCancelCheck(mount: (source?: Fixture) => Promise<void>) {
  await mount(); const before = structuredClone(live().editor.getScene()), ruler = control('Horizontal ruler'), r = ruler.getBoundingClientRect()
  const start = { x: clientPoint({ x: 380, y: 0 }).x, y: r.top + r.height / 2 }, end = clientPoint({ x: 420, y: 100 })
  pointer(ruler, 'pointerdown', start); pointer(window, 'pointermove', end); await frames()
  assert(live().editor.isTransactionActive() && guides().length === 1, 'Ruler drag did not produce a real transaction preview.')
  flushSync(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await frames(); pointer(window, 'pointerup', end); await frames()
  equal(live().editor.getScene(), before, 'Escape failed to roll back provisional guide.'); assert(!live().editor.canUndo && !live().editor.isTransactionActive(), 'Guide cancellation left history or active transaction.')
  selected(['top', 'middle', 'bottom', 'right']); record('Escape rolls back ruler drag preview and ignores late pointer-up', { sourceUnchanged: true })
}

/** Numeric guide edits, locking, deletion and portable source round-trip all
 * use the live workspace controls rather than a fixture-specific command. */
async function guideEditingCheck() {
  const guide = guides().find(item => item.axis === 'v'); assert(guide, 'Missing vertical guide for editing.')
  const line = host.querySelector<HTMLElement>(`[data-testid="guide-line-${guide.id}"]`); assert(line, 'Missing editable guide line.')
  flushSync(() => line.click()); await frames(); await value('Guide position', 300); await click('Apply guide position')
  close(guides().find(item => item.id === guide.id)!.position, 300, 'Numeric guide position'); const afterEdit = structuredClone(live().editor.getScene())
  flushSync(() => live().editor.undo()); close(guides().find(item => item.id === guide.id)!.position, 260, 'Guide position undo')
  flushSync(() => live().editor.redo()); equal(live().editor.getScene(), afterEdit, 'Guide position redo changed source.')
  await click('Lock guide'); let locked = structuredClone(live().editor.getScene()); assert(guides().find(item => item.id === guide.id)!.locked, 'Lock guide did not persist.')
  const lockedLine = host.querySelector<HTMLElement>(`[data-testid="guide-line-${guide.id}"]`); assert(lockedLine, 'Locked guide disappeared.')
  const start = clientPoint({ x: 300, y: 450 }), end = clientPoint({ x: 340, y: 450 })
  pointer(lockedLine, 'pointerdown', start); pointer(window, 'pointermove', end); pointer(window, 'pointerup', end); await frames()
  equal(live().editor.getScene(), locked, 'Dragging locked guide changed source.')
  await click('Hide guide'); assert(guides().find(item => item.id === guide.id)!.hidden, 'Hide guide did not persist source visibility.')
  assert(!host.querySelector(`[data-testid="guide-line-${guide.id}"]`), 'Hidden guide line remained drawn.')
  await click('Show guide'); assert(!guides().find(item => item.id === guide.id)!.hidden, 'Show guide did not restore source visibility.')
  close(guides().find(item => item.id === guide.id)!.position, 300, 'Show guide changed position'); locked = structuredClone(live().editor.getScene())
  const resources = new OutputResources(), lease = await acquirePortableScene(live().editor.getScene(), { resources })
  try { const loaded = JSON.parse(JSON.stringify(lease.value)) as ChronoScene; equal(loaded.editorGuides, live().editor.getScene().editorGuides, 'Portable save/load lost guide source.') }
  finally { lease.release(); resources.dispose() }
  await click('Delete guide'); assert(!guides().some(item => item.id === guide.id), 'Delete guide left source record.')
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), locked, 'Delete guide undo failed to restore exact locked guide.')
  selected(['top', 'middle', 'bottom', 'right'])
  record('Guide numeric edit, lock, delete, undo and portable round-trip preserve source and selection', { id: guide.id, position: 300, locked: true })
}

/** Physical layer dragging consumes persisted guide targets through the real
 * SnapEngine. A locked guide still snaps; a hidden one does not. */
async function guideSnapCheck(mount: (source?: Fixture) => Promise<void>) {
  for (const hidden of [false, true]) {
    const source = fixture(); source.selected = ['top']; source.primary = 'top'
    source.scene.editorGuides = { version: 1, guides: [{ id: 'snap-guide', axis: 'v', position: 300, locked: true, hidden }] }
    await mount(source); const before = structuredClone(live().editor.getScene()); await click('Enable guide snapping only')
    const start = clientPoint({ x: 140, y: 130 }), end = clientPoint({ x: 262, y: 130 })
    pointer(canvas(), 'pointerdown', start); await frames(); pointer(window, 'pointermove', end); await frames(); pointer(window, 'pointerup', end); await frames()
    close(bounds(live().editor.getScene(), 'top').x, hidden ? 222 : 220, 'Persistent guide snapping')
    equal(guides(), source.scene.editorGuides.guides, 'Layer drag changed guide source.'); selected(['top'])
    flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Snapped drag undo incomplete.')
    record(hidden ? 'Hidden persisted guide does not snap layer dragging' : 'Locked persisted guide snaps layer edge through actual viewport dragging', { guideX: 300, finalLayerX: hidden ? 222 : 220 })
  }
}

/** A manual source update can become synchronous before the rendered guide
 * props refresh. Starting from that obsolete line must preserve the manual
 * command and refuse to open a stale pointer transaction. */
async function staleGuideStartCheck(mount: (source?: Fixture) => Promise<void>) {
  const source = fixture(); source.scene.editorGuides = { version: 1, guides: [{ id: 'stale-v', axis: 'v', position: 260 }] }
  await mount(source); const line = host.querySelector<HTMLElement>('[data-testid="guide-line-stale-v"]'); assert(line, 'Missing stale-start guide.')
  let manual: ChronoScene | undefined; const point = clientPoint({ x: 260, y: 450 })
  flushSync(() => { const base = live().editor.getScene()
    live().editor.dispatchCommand(makeSceneGuidesCmd(base, [{ id: 'stale-v', axis: 'v', position: 280 }], 'Manual guide position'))
    manual = structuredClone(live().editor.getScene())
    line.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: point.x, clientY: point.y }))
  }); await frames()
  pointer(window, 'pointermove', clientPoint({ x: 340, y: 450 })); pointer(window, 'pointerup', clientPoint({ x: 340, y: 450 })); await frames()
  equal(live().editor.getScene(), manual, 'Stale guide pointer start overwrote a synchronous manual source edit.')
  assert(!live().editor.isTransactionActive(), 'Stale guide start left a transaction open.'); selected(['top', 'middle', 'bottom', 'right'])
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), source.scene, 'Stale guide start added a history entry.'); assert(!live().editor.canUndo, 'Stale guide start produced extra undo history.')
  record('Stale rendered guide start preserves a synchronous manual source edit', { manualGuideX: 280, sourceGuard: true })
}

/** Wide hit padding is for picking, not a position change. An ordinary click
 * within that padding creates no history, while subsequent movement uses the
 * original guide position plus pointer delta at the actual canvas scale. */
async function guidePaddingCheck(mount: (source?: Fixture) => Promise<void>) {
  const source = fixture(); source.scene.editorGuides = { version: 1, guides: [{ id: 'padding-v', axis: 'v', position: 300 }] }
  await mount(source); const before = structuredClone(live().editor.getScene()), line = host.querySelector<HTMLElement>('[data-testid="guide-line-padding-v"]'); assert(line, 'Missing padded guide hit target.')
  const center = clientPoint({ x: 300, y: 450 }), start = { x: center.x + 3, y: center.y }
  pointer(line, 'pointerdown', start); pointer(window, 'pointerup', start); await frames()
  equal(live().editor.getScene(), before, 'Picking guide hit padding changed its position.'); assert(!live().editor.canUndo, 'Guide padding click created history.')
  const end = { x: start.x + 30, y: start.y }, expected = 300 + 30 / (canvas().getBoundingClientRect().width / 900)
  pointer(line, 'pointerdown', start); pointer(window, 'pointermove', end); pointer(window, 'pointerup', end); await frames()
  close(guides().find(item => item.id === 'padding-v')!.position, expected, 'Guide padding drag did not preserve initial grab offset')
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Guide padding drag undo incomplete.'); assert(!live().editor.canUndo, 'Guide drag wrote multiple undo entries.')
  record('Guide padding click is inert and dragging preserves grab offset in one undo', { hitPaddingCssPx: 3, dragCssPx: 30, guidePosition: expected })
}

/** Isolated runner retains all live controls and source diagnostics on failure.
 * The browser owner serves this fixture and captures source/bundle proof. */
async function main() {
  document.body.innerHTML = '<style>body{margin:16px;background:#0f172a;color:#e2e8f0;font:14px system-ui}body>button,nav>button{padding:7px 11px;background:#1d4ed8;color:white;border:1px solid #64748b;border-radius:5px}button:disabled{opacity:.4}#layout-host{width:1180px;max-width:100%;border:1px solid #475569;display:flex;flex-direction:column}pre{white-space:pre-wrap;overflow-wrap:anywhere}#checks{color:#86efac}</style><h1>Selection gaps and ruler guides native acceptance</h1><p>Actual SceneCanvas + editor/history + key commands · isolated inline sources · connected documents unchanged</p><button id="run-layout">Run layout checks</button><button id="inspect">Open editable fixture</button><button id="first-drag">Open first-drag fixture</button><button id="main-style">Open main-style fixture</button><p id="status">Ready</p><pre id="checks"></pre><section id="layout-host"></section><pre id="report">No checks run.</pre><h2>Diagnostic pointer trace</h2><pre id="pointer-trace">Open first-drag fixture to trace real browser capture events.</pre>'
  host = document.getElementById('layout-host')!; const root = createRoot(host); let generation = 0
  const run = document.getElementById('run-layout') as HTMLButtonElement, inspect = document.getElementById('inspect') as HTMLButtonElement, firstDrag = document.getElementById('first-drag') as HTMLButtonElement, mainStyle = document.getElementById('main-style') as HTMLButtonElement
  const mount = async (source = fixture()) => { runtime = undefined; flushSync(() => root.render(<Subject key={++generation} fixture={source} />)); await frames(4); assert(!live().snap, 'Fixture snap did not disable.') }
  inspect.onclick = async () => { await mount() }
  firstDrag.onclick = async () => { pointerTrace.length = 0; await mount(firstDragFixture()) }
  mainStyle.onclick = async () => { pointerTrace.length = 0; await mount(firstDragFixture(true)) }
  run.onclick = async () => { run.disabled = inspect.disabled = firstDrag.disabled = mainStyle.disabled = true; checks.length = 0; document.getElementById('checks')!.textContent = ''; const started = performance.now(); let manifest: unknown
    try { document.getElementById('status')!.textContent = 'Running actual layout controls…'; const metadata = await (await fetch('layout-interactions-sources.json')).json(); manifest = { sourceManifest: 'layout-interactions-sources.json', bundleSha256: metadata.bundleSha256, sourceFiles: metadata.sources.length }
      await nearestChecks(mount); await animatedCheck(mount); await parentCheck(mount); await cancellationChecks(mount)
      await cursorCheck(mount); await footerCheck(mount); await firstDragCheck(mount); await consumedReleaseCheck(mount); await rasterClipCheck(mount); await guideCancelCheck(mount); await guideCreationCheck(mount); await guideEditingCheck(); await guideSnapCheck(mount)
      await staleGuideStartCheck(mount); await guidePaddingCheck(mount)
      document.getElementById('status')!.textContent = `PASS · ${checks.length} checks`; document.getElementById('report')!.textContent = JSON.stringify({ passed: true, checks, manifest, elapsedMs: performance.now() - started, dpr: devicePixelRatio, userAgent: navigator.userAgent, scope: 'Native DOM controls through real SceneCanvas/editor/key-command adapters; no user document.' }, null, 2)
    } catch (error) { document.getElementById('status')!.textContent = 'FAIL'; document.getElementById('report')!.textContent = JSON.stringify({ passed: false, error: String(error), checks, manifest }, null, 2) }
    finally { run.disabled = inspect.disabled = firstDrag.disabled = mainStyle.disabled = false }
  }
}
void main().catch(error => { document.body.textContent = `Layout acceptance setup failed: ${String(error)}` })
