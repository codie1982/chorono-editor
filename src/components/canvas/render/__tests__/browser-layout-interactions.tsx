import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SceneCanvas from '@/components/SceneCanvas'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'
import { evaluateTimelines } from '@/lib/evaluator'
import { resolveLayerWorldBounds } from '@/lib/geometry/resolveLayerWorldBounds'
import { buildViewportKeyframeCommands } from '@/lib/editor/viewportKeyframes'
import { createLayerSelection, toggleLayerSelection, type LayerSelection } from '@/lib/selection/layerSelection'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { acquirePortableScene } from '@/lib/export/portable/PortableSceneOutput'
import { OutputResources } from '@/lib/export/resources'
import { makeSceneGuidesCmd } from '@/lib/editor/guides/SceneGuides'

type Point = { x: number; y: number }
interface Fixture { scene: ChronoScene; selected: string[]; primary: string; timeMs?: number }
interface Runtime { editor: EditorStateReturn; selection: LayerSelection; snap: boolean }
interface Check { name: string; passed: true; evidence: unknown }
let runtime: Runtime | undefined, host: HTMLElement
const checks: Check[] = []

/** Real production canvas and editor lifecycle; the fixture supplies only
 * ordinary selection, evaluated animation and the same public key-command
 * callback as the main page. It never changes gap or guide implementation. */
function Subject({ fixture }: { fixture: Fixture }) {
  const editor = useEditorState(fixture.scene), assets = useAssetCache(editor.scene.assets), snap = useSnapSettings()
  const [selection, setSelection] = useState(() => createLayerSelection(fixture.selected, fixture.primary))
  const ids = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds]), timeMs = fixture.timeMs ?? 500
  const frame = useMemo(() => evaluateTimelines(editor.scene.timelines, timeMs), [editor.scene.timelines, timeMs])
  useEffect(() => { snap.setEnabled(false) }, [])
  useLayoutEffect(() => { runtime = { editor, selection, snap: snap.settings.enabled } })
  return <><nav style={{ display: 'flex', gap: 8, padding: 8 }}>
    <button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
    <button onClick={() => { snap.setEnabled(true); snap.setTarget('objects', false); snap.setTarget('points', false)
      snap.setTarget('grid', false); snap.setTarget('pixel', false); snap.setTarget('guides', true) }}>Enable guide snapping only</button>
    <button onClick={() => { const layer = editor.getScene().layers.find(item => item.id === 'right')!
      editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { ...layer, transform: { ...layer.transform, x: layer.transform.x + 1 } }, layer)) }}>Manual layout edit</button>
  </nav><output aria-label="Layout scene summary">Layers {editor.scene.layers.length} · Selection {Array.from(selection.selectedIds).join(', ')}</output>
  <section data-panel="canvas" style={{ display: 'flex', position: 'relative', height: 680 }}>
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
  </section><pre data-testid="layout-scene-debug">{JSON.stringify({ selected: Array.from(selection.selectedIds), scene: editor.scene }, null, 2)}</pre></>
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
function clientPoint(point: Point): Point { const r = canvas().getBoundingClientRect(); return { x: r.left + point.x * r.width / 900, y: r.top + point.y * r.height / 600 } }
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

/** Mouse coordinates come from the actual canvas after pan and zoom; guide
 * and ruler markings must use that same mapping without a playback loop. */
async function cursorCheck(mount: (source?: Fixture) => Promise<void>) {
  const source = fixture(); source.scene.editorGuides = { version: 1, guides: [{ id: 'cursor-v', axis: 'v', position: 240 }, { id: 'cursor-h', axis: 'h', position: 175 }] }
  await mount(source); const point = { x: 240, y: 175 }
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
    assert(x && y && Math.abs(x.getBoundingClientRect().left - expected.x) < 0.1 && Math.abs(y.getBoundingClientRect().top - expected.y) < 0.1, 'Cursor ruler marks did not align with actual canvas pixels.') }
  aligned(); await inspect(); flushSync(() => titled('Zoom in (Cmd+scroll)').click()); await frames(); aligned(); await inspect()
  const start = clientPoint({ x: 650, y: 450 }), end = { x: start.x + 25, y: start.y - 15 }
  flushSync(() => canvas().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 1, buttons: 4, clientX: start.x, clientY: start.y })))
  pointer(window, 'pointermove', end, 4); pointer(window, 'pointerup', end, 0); await frames(); aligned(); await inspect()
  record('Cursor ruler/crosshair coordinates remain aligned after real zoom and middle-mouse pan', { compositionPoint: point })
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
  document.body.innerHTML = '<style>body{margin:16px;background:#0f172a;color:#e2e8f0;font:14px system-ui}body>button,nav>button{padding:7px 11px;background:#1d4ed8;color:white;border:1px solid #64748b;border-radius:5px}button:disabled{opacity:.4}#layout-host{width:1180px;max-width:100%;border:1px solid #475569;display:flex;flex-direction:column}pre{white-space:pre-wrap;overflow-wrap:anywhere}#checks{color:#86efac}</style><h1>Selection gaps and ruler guides native acceptance</h1><p>Actual SceneCanvas + editor/history + key commands · isolated inline sources · connected documents unchanged</p><button id="run-layout">Run layout checks</button><button id="inspect">Open editable fixture</button><p id="status">Ready</p><pre id="checks"></pre><section id="layout-host"></section><pre id="report">No checks run.</pre>'
  host = document.getElementById('layout-host')!; const root = createRoot(host); let generation = 0
  const run = document.getElementById('run-layout') as HTMLButtonElement, inspect = document.getElementById('inspect') as HTMLButtonElement
  const mount = async (source = fixture()) => { runtime = undefined; flushSync(() => root.render(<Subject key={++generation} fixture={source} />)); await frames(4); assert(!live().snap, 'Fixture snap did not disable.') }
  inspect.onclick = async () => { await mount() }
  run.onclick = async () => { run.disabled = inspect.disabled = true; checks.length = 0; document.getElementById('checks')!.textContent = ''; const started = performance.now(); let manifest: unknown
    try { document.getElementById('status')!.textContent = 'Running actual layout controls…'; const metadata = await (await fetch('layout-interactions-sources.json')).json(); manifest = { sourceManifest: 'layout-interactions-sources.json', bundleSha256: metadata.bundleSha256, sourceFiles: metadata.sources.length }
      await nearestChecks(mount); await animatedCheck(mount); await parentCheck(mount); await cancellationChecks(mount)
      await cursorCheck(mount); await guideCancelCheck(mount); await guideCreationCheck(mount); await guideEditingCheck(); await guideSnapCheck(mount)
      await staleGuideStartCheck(mount); await guidePaddingCheck(mount)
      document.getElementById('status')!.textContent = `PASS · ${checks.length} checks`; document.getElementById('report')!.textContent = JSON.stringify({ passed: true, checks, manifest, elapsedMs: performance.now() - started, dpr: devicePixelRatio, userAgent: navigator.userAgent, scope: 'Native DOM controls through real SceneCanvas/editor/key-command adapters; no user document.' }, null, 2)
    } catch (error) { document.getElementById('status')!.textContent = 'FAIL'; document.getElementById('report')!.textContent = JSON.stringify({ passed: false, error: String(error), checks, manifest }, null, 2) }
    finally { run.disabled = inspect.disabled = false }
  }
}
void main().catch(error => { document.body.textContent = `Layout acceptance setup failed: ${String(error)}` })
