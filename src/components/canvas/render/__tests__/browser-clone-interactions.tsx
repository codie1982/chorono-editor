import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SceneCanvas from '@/components/SceneCanvas'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { useKeyboard } from '@/app/hooks/useKeyboard'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'
import { evaluateTimelines } from '@/lib/evaluator'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { makeCloneForestCmd } from '@/lib/editor/commands-clone-forest'
import { buildViewportKeyframeCommands } from '@/lib/editor/viewportKeyframes'
import { createLayerSelection, toggleLayerSelection, type LayerSelection } from '@/lib/selection/layerSelection'
import { acquirePortableScene } from '@/lib/export/portable/PortableSceneOutput'
import { OutputResources } from '@/lib/export/resources'

type Point = { x: number; y: number }
interface Fixture { scene: ChronoScene; selected: string[]; primary: string; timeMs?: number }
interface Runtime { editor: EditorStateReturn; selection: LayerSelection; snap: boolean }
interface Check { name: string; passed: true; evidence: unknown }
let runtime: Runtime | undefined, host: HTMLElement
const checks: Check[] = [], FREE_MOVE = 'Drag — free move (X + Y together)'

/** Real production editor, asset/snap lifecycle and SceneCanvas. The harness
 * supplies only public callbacks and native source commands, never private drag
 * refs or mocked capture. Duplicate button and the real keyboard hook share
 * one handler; this does not substitute for mounting the entire page shell. */
function Subject({ fixture }: { fixture: Fixture }) {
  const editor = useEditorState(fixture.scene), assets = useAssetCache(editor.scene.assets), snap = useSnapSettings()
  const [selection, setSelection] = useState(() => createLayerSelection(fixture.selected, fixture.primary))
  const ids = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds]), timeMs = fixture.timeMs ?? 500
  const frame = useMemo(() => evaluateTimelines(editor.scene.timelines, timeMs), [editor.scene.timelines, timeMs])
  useEffect(() => { snap.setEnabled(false) }, [])
  useLayoutEffect(() => { runtime = { editor, selection, snap: snap.settings.enabled } })
  const duplicate = () => {
    const cmd = makeCloneForestCmd(editor.getScene(), { sourceIds: Array.from(selection.selectedIds) })
    editor.dispatchCommand(cmd); setSelection(createLayerSelection(cmd.result.suggestedSelection, cmd.result.suggestedSelection[0] ?? null))
  }
  useKeyboard({ onUndo: editor.undo, onRedo: editor.redo, onPlayToggle: () => {}, onStepBack: () => {},
    onStepForward: () => {}, onDeleteSelected: () => {}, onDuplicateSelected: duplicate,
    getContext: () => 'canvas', isTransactionActive: editor.isTransactionActive })
  return <><nav style={{ display: 'flex', gap: 8, padding: 8 }}>
    <button onClick={duplicate}>Duplicate selection</button><button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
  </nav><output aria-label="Clone scene summary">Layers {editor.scene.layers.length} · Keys {editor.scene.timelines.reduce((sum, timeline) => sum + timeline.tracks.reduce((count, track) => count + track.keyframes.length, 0), 0)}</output>
  <p data-testid="clone-parent-summary">Parents: {editor.scene.layers.map(layer => `${layer.name} → ${editor.scene.layers.find(parent => parent.id === layer.parentId)?.name ?? 'scene root'}`).join(' · ')}</p>
  <section data-panel="canvas" style={{ display: 'flex', position: 'relative', height: 680 }}>
    <SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap} selectedLayerId={selection.primaryId}
      selectedLayerIds={ids} timeMs={timeMs} overrides={frame} isPlaying={false} previewMode={false} toolMode="move"
      onSelectLayer={(id, shift = false) => setSelection(previous => !id ? createLayerSelection([])
        : shift ? toggleLayerSelection(previous, id) : createLayerSelection([id], id))}
      onSelectByGeometry={next => setSelection(createLayerSelection(next, Array.from(next)[0] ?? null))}
      onSelectLayers={next => setSelection(createLayerSelection(next, next[0] ?? null))}
      selectedTimeline={editor.scene.timelines[0] ?? null}
      buildLayerCommitCommands={changes => buildViewportKeyframeCommands(editor.getScene(), changes, {
        timelineId: editor.scene.timelines[0]?.id ?? '', timeMs, autoKeyframe: false,
      })} />
  </section><pre data-testid="clone-scene-debug">{JSON.stringify({ selected: Array.from(selection.selectedIds), layers: editor.scene.layers.map(layer => ({ id: layer.id, name: layer.name, parentId: layer.parentId ?? null })) }, null, 2)}</pre></>
}

/** Native rectangle with explicit pivot and percent-valued fill opacity. */
function rectangle(id: string, x: number, y: number): Layer {
  return { ...newRectLayer(), id, name: id, size: { width: 70, height: 44 },
    transform: { x, y, anchorX: 9, anchorY: 7, scaleX: 1, scaleY: 1, rotationDeg: 0 },
    style: { fill: { type: 'solid', color: '#22c55e', opacity: 100 } } }
}

/** Parent translation changes with time; its reflected/nonuniform affine pose
 * catches double-applied evaluated offsets and parent-local/world confusion.
 * A second timeline carries opacity, proving active-only cloning is incomplete. */
function animatedFixture(selected = ['child']): Fixture {
  const parent: Layer = { ...rectangle('parent', 590, 240), type: 'group', size: undefined,
    transform: { x: 590, y: 240, anchorX: 0, anchorY: 0, scaleX: -1.3, scaleY: 0.8, rotationDeg: 25 } }
  const child = { ...rectangle('child', 40, 20), parentId: parent.id }
  const grandchild = { ...rectangle('grandchild', 15, 65), parentId: child.id }
  const scene = { ...emptyScene(), layers: [parent, child, grandchild] }
  scene.composition = { ...scene.composition, width: 900, height: 550, durationMs: 1000 }
  scene.timelines = [{ ...newTimeline(), id: 'position', durationMs: 1000, loop: false, layerIds: ['parent', 'child', 'grandchild'], tracks: [
    { target: 'layers.child.transform.x', label: 'Human X', keyframes: [
      { id: 'x0', timeMs: 0, value: 40, easing: { type: 'easeInOut' }, tangentMode: 'broken' },
      { id: 'x1', timeMs: 1000, value: 150, easing: { type: 'linear' } }] },
    { target: 'layers.child.transform.y', keyframes: [
      { id: 'y0', timeMs: 0, value: 20, easing: { type: 'easeOut' } },
      { id: 'y1', timeMs: 1000, value: 75, easing: { type: 'linear' } }] },
    { target: 'layers.parent.transform.x', keyframes: [
      { id: 'parent0', timeMs: 0, value: 590, easing: { type: 'linear' } },
      { id: 'parent1', timeMs: 1000, value: 640, easing: { type: 'linear' } }] },
  ] }, { ...newTimeline(), id: 'appearance', durationMs: 1000, loop: false, layerIds: ['child'], tracks: [
    { target: 'layers.child.opacity', keyframes: [{ id: 'opacity0', timeMs: 0, value: 0.8, easing: { type: 'hold' } }] },
  ] }]
  return { scene, selected, primary: selected[0], timeMs: 500 }
}

/** Read committed production state; a missing mount is a test failure. */
function live(): Runtime { assert(runtime, 'Missing isolated editor.'); return runtime }
/** Fail loudly on missing UI or violated invariants. */
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
/** Full source comparison includes unrelated parent/key metadata. */
function equal(a: unknown, b: unknown, message: string) { assert(JSON.stringify(a) === JSON.stringify(b), message) }
/** Geometry tolerance below a visible composition pixel. */
function close(a: number, b: number, message: string) { assert(Number.isFinite(a) && Math.abs(a - b) < 1e-4, `${message}: ${a} != ${b}`) }
/** Yield through actual browser painting, without arbitrary sleeps. */
async function frames(count = 2) { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame) }
/** Resolve real viewport controls by public title. */
function titled(title: string): Element { const item = Array.from(host.querySelectorAll('[title]')).find(el => el.getAttribute('title') === title); assert(item, `Missing ${title}`); return item }
/** Native canvas supplies the observable pan/zoom/DPR boundary. */
function canvas(): HTMLCanvasElement { const item = host.querySelector('canvas'); assert(item, 'Missing canvas'); return item }
/** Public control center in client CSS pixels. */
function center(el: Element): Point { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
/** Convert composition delta to client CSS delta, not device pixels. */
function endPoint(start: Point, delta: Point): Point { const r = canvas().getBoundingClientRect(); return { x: start.x + delta.x * r.width / 900, y: start.y + delta.y * r.height / 550 } }
/** Ctrl/Cmd drag uses actual React/native window handlers. Pointer ID matches
 * the Run button's mouse interaction; capture is never replaced by a stub. */
function pointer(target: EventTarget, type: string, point: Point, copy = true, pointerId = 1, held?: 'altKey' | 'metaKey') {
  flushSync(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId,
    pointerType: 'mouse', isPrimary: pointerId === 1, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    clientX: point.x, clientY: point.y, ctrlKey: held ? false : copy, ...(held ? { [held]: true } : {}) })))
}
/** Canonical evaluated anchor is the visual result independently of clone math. */
function anchor(scene: ChronoScene, id: string, ms: number): Point {
  const layer = scene.layers.find(item => item.id === id); assert(layer, `Missing layer ${id}`)
  return resolveLayerWorldMatrix(layer, scene, ms).applyToPoint({ x: layer.transform.anchorX, y: layer.transform.anchorY })
}
/** Clone source records are semantically named; new placements are excluded. */
function copyOf(scene: ChronoScene, before: ChronoScene, sourceId: string): Layer {
  const oldIds = new Set(before.layers.map(item => item.id)), source = before.layers.find(item => item.id === sourceId)!
  const copies = scene.layers.filter(item => !oldIds.has(item.id) && item.name.startsWith(source.name))
  assert(copies.length === 1, `Expected one semantic copy of ${sourceId}, found ${copies.length}`); return copies[0]
}
/** Preserve originals and existing track records, not merely layer count. */
function originalsIntact(after: ChronoScene, before: ChronoScene) {
  for (const layer of before.layers) equal(after.layers.find(item => item.id === layer.id), layer, `Source layer ${layer.id} changed.`)
  for (const tl of before.timelines) for (const track of tl.tracks) equal(after.timelines.find(item => item.id === tl.id)?.tracks.find(item => item.target === track.target), track, 'Original animation changed.')
}
/** Every source track has a fresh-keyed counterpart on its ORIGINAL timeline. */
function copiedTracks(after: ChronoScene, before: ChronoScene, sourceId: string, cloneId: string) {
  const existingIds = new Set(before.timelines.flatMap(tl => tl.tracks.flatMap(track => track.keyframes.map(key => key.id))))
  let count = 0
  for (const tl of before.timelines) for (const track of tl.tracks.filter(track => track.target.startsWith(`layers.${sourceId}.`))) {
    const target = track.target.replace(`layers.${sourceId}.`, `layers.${cloneId}.`)
    const copied = after.timelines.find(item => item.id === tl.id)?.tracks.find(item => item.target === target)
    assert(copied && copied.keyframes.length === track.keyframes.length, `Missing copied track ${target} in ${tl.id}`)
    copied.keyframes.forEach((key, index) => { assert(!existingIds.has(key.id), 'Copied key reused a source ID.'); equal(key.easing, track.keyframes[index].easing, 'Easing lost.'); equal(key.tangentMode, track.keyframes[index].tangentMode, 'Tangent metadata lost.'); close(key.timeMs, track.keyframes[index].timeMs, 'Key timing changed.') })
    count++
  }
  return count
}
/** Append visible proof only after the invariant passes. */
function record(name: string, evidence: unknown) { checks.push({ name, passed: true, evidence }); document.getElementById('checks')!.textContent = checks.map(check => `✓ ${check.name}`).join('\n') }

/** Keyed drag-copy must preserve all sources, both timelines and sibling parent
 * ownership; the clone's evaluated offset must persist beyond the release frame. */
async function keyedDrag(mount: (fixture: Fixture) => Promise<void>) {
  const fixture = animatedFixture(); await mount(fixture); const before = structuredClone(live().editor.getScene())
  const handle = titled(FREE_MOVE), start = center(handle), delta = { x: 32, y: -19 }, end = endPoint(start, delta)
  pointer(handle, 'pointerdown', start); pointer(window, 'pointermove', end); await frames()
  assert(live().editor.isTransactionActive(), 'Copy drag never opened a transaction.')
  originalsIntact(live().editor.getScene(), before)
  const previewIds = live().editor.getScene().layers.filter(item => !before.layers.some(old => old.id === item.id)).map(item => item.id)
  assert(previewIds.length >= 2, 'Preview did not contain the cloned subtree.')
  pointer(window, 'pointerup', end); await frames()
  assert(!live().editor.isTransactionActive(), 'Release left transaction active.')
  const after = live().editor.getScene(), child = copyOf(after, before, 'child'), descendant = copyOf(after, before, 'grandchild')
  const allKeyIds = after.timelines.flatMap(timeline => timeline.tracks.flatMap(track => track.keyframes.map(key => key.id)))
  assert(new Set(allKeyIds).size === allKeyIds.length, 'Copied keys collided with another loaded key ID.')
  originalsIntact(after, before); assert(child.parentId === 'parent', 'Copied keyed child changed its external parent.')
  assert(descendant.parentId === child.id, 'Descendant was not remapped into copied subtree.')
  equal(after.layers.filter(item => !before.layers.some(old => old.id === item.id)).map(item => item.id), previewIds, 'Preview/commit clone IDs changed.')
  const tracks = copiedTracks(after, before, 'child', child.id)
  for (const ms of [0, 250, 500, 750, 1000]) { const a = anchor(before, 'child', ms), b = anchor(after, child.id, ms); close(b.x - a.x, delta.x, 'Copied animated X offset'); close(b.y - a.y, delta.y, 'Copied animated Y offset') }
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Copy undo changed source.'); assert(!live().editor.canUndo, 'Copy made more than one history step.')
  flushSync(() => live().editor.redo()); equal(live().editor.getScene(), after, 'Redo changed stable clone/key IDs.')
  record('keyed nested drag-copy preserves all timelines, parent and stable IDs', { delta, sourceParent: 'parent', cloneParent: child.parentId, tracks, cloneIds: previewIds, oneUndo: true })
  const resources = new OutputResources(), lease = await acquirePortableScene(after, { resources })
  try { const loaded: ChronoScene = JSON.parse(JSON.stringify(lease.value)); originalsIntact(loaded, before); equal(loaded.layers, after.layers, 'Portable clone hierarchy changed.'); for (const ms of [0, 500, 1000]) equal(anchor(loaded, child.id, ms), anchor(after, child.id, ms), 'Portable animation changed.') }
  finally { lease.release(); resources.dispose() }
  record('portable save/load preserves copied hierarchy and animation', { layerIds: after.layers.map(item => item.id) })
}

/** Begin with no selection and use the actual painted canvas body, not an
 * existing gizmo. First mousedown must select AND drag; an ordinary keyed pose
 * is committed through the same source+key builder used by the production page.
 * Check canonical values and canvas pixels after another render to catch a
 * release-only preview that snaps back or a selection update that cancels drag. */
async function firstBodyDrags(mount: (fixture: Fixture) => Promise<void>) {
  for (const keyed of [false, true]) {
    const hero = rectangle('first-drag', 140, 150), scene = emptyScene()
    scene.layers = [hero]; scene.composition = { ...scene.composition, width: 900, height: 550, durationMs: 1000 }
    const timeline = { ...newTimeline(), id: 'first-drag-timeline', durationMs: 1000, loop: false, layerIds: [hero.id], tracks: keyed ? [
      { target: `layers.${hero.id}.transform.x`, keyframes: [
        { id: 'first-x0', timeMs: 0, value: 140, easing: { type: 'linear' as const } },
        { id: 'first-x1', timeMs: 1000, value: 260, easing: { type: 'linear' as const } }] },
      { target: `layers.${hero.id}.transform.y`, keyframes: [
        { id: 'first-y0', timeMs: 0, value: 150, easing: { type: 'linear' as const } },
        { id: 'first-y1', timeMs: 1000, value: 190, easing: { type: 'linear' as const } }] },
    ] : [] }
    scene.timelines = [timeline]
    await mount({ scene, selected: [], primary: '', timeMs: 500 })
    assert(live().selection.selectedIds.size === 0, 'First-drag fixture was already selected.')
    const before = structuredClone(live().editor.getScene()), beforePivot = anchor(before, hero.id, 500)
    const body = resolveLayerWorldMatrix(hero, before, 500).applyToPoint({ x: 35, y: 22 }), rect = canvas().getBoundingClientRect()
    const start = { x: rect.left + body.x * rect.width / 900, y: rect.top + body.y * rect.height / 550 }
    const delta = { x: 31, y: -17 }, end = endPoint(start, delta)
    pointer(canvas(), 'pointerdown', start, false)
    assert(live().selection.primaryId === hero.id && live().selection.selectedIds.has(hero.id), 'Initial body pointerdown did not select the layer.')
    await frames(); assert(live().editor.isTransactionActive(), 'Selection render canceled the first body drag before moving.')
    pointer(window, 'pointermove', end, false); await frames()
    assert(live().editor.isTransactionActive(), 'Initial selection update canceled the first body drag.')
    pointer(window, 'pointerup', end, false); await frames(4)
    const after = live().editor.getScene(), afterPivot = anchor(after, hero.id, 500)
    assert(!live().editor.isTransactionActive(), 'First body release left transaction active.')
    close(afterPivot.x - beforePivot.x, delta.x, 'First-drag committed X'); close(afterPivot.y - beforePivot.y, delta.y, 'First-drag committed Y')
    assert(live().selection.primaryId === hero.id && live().selection.selectedIds.has(hero.id), 'First drag lost selection at release.')
    const painted = resolveLayerWorldMatrix(after.layers[0], after, 500).applyToPoint({ x: 35, y: 22 })
    const rgba = canvas().getContext('2d')!.getImageData(Math.round(painted.x), Math.round(painted.y), 1, 1).data
    assert(rgba[1] > 150 && rgba[0] < 100 && rgba[2] < 140 && rgba[3] === 255, `First drag canvas snapped back after release: ${Array.from(rgba)}`)
    if (keyed) for (const track of timeline.tracks) {
      const current = after.timelines[0].tracks.find(item => item.target === track.target)!
      assert(current.keyframes.some(key => key.timeMs === 500), 'Keyed body drag did not persist a playhead key.')
      for (const original of track.keyframes) equal(current.keyframes.find(key => key.id === original.id), original, 'First drag changed another source key.')
    }
    flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'First body drag was not one complete undo.')
    assert(!live().editor.canUndo, 'First body drag created multiple history entries.')
    flushSync(() => live().editor.redo()); equal(live().editor.getScene(), after, 'First body drag redo changed result.')
    record(`${keyed ? 'Keyed' : 'Static'} first body drag from empty selection commits and stays selected`, { delta, rgba: Array.from(rgba), oneUndo: true })
  }
}

/** A selected child remains the editable body target under a parent whose
 * transform belongs to another timeline. Promoting the hit to that parent would
 * either edit the wrong layer or make the source/key adapter reject and revert. */
async function selectedChildBody(mount: (fixture: Fixture) => Promise<void>) {
  const fixture = animatedFixture(), parentTrack = fixture.scene.timelines[0].tracks.find(track => track.target === 'layers.parent.transform.x')!
  fixture.scene.timelines[0].tracks = fixture.scene.timelines[0].tracks.filter(track => track !== parentTrack)
  fixture.scene.timelines[1].tracks.push(parentTrack)
  await mount(fixture); const before = structuredClone(live().editor.getScene()), child = before.layers.find(layer => layer.id === 'child')!
  const world = resolveLayerWorldMatrix(child, before, 500).applyToPoint({ x: 35, y: 22 }), rect = canvas().getBoundingClientRect()
  const start = { x: rect.left + world.x * rect.width / 900, y: rect.top + world.y * rect.height / 550 }, delta = { x: 24, y: -13 }, end = endPoint(start, delta)
  pointer(canvas(), 'pointerdown', start, false); await frames()
  assert(live().selection.primaryId === child.id && live().selection.selectedIds.has(child.id), 'Body hit promoted selected child to animated outer parent.')
  pointer(window, 'pointermove', end, false); await frames(); assert(live().editor.isTransactionActive(), 'Selected child body drag canceled on render.')
  pointer(window, 'pointerup', end, false); await frames(4)
  const after = live().editor.getScene(), from = anchor(before, child.id, 500), to = anchor(after, child.id, 500)
  close(to.x - from.x, delta.x, 'Selected child body X'); close(to.y - from.y, delta.y, 'Selected child body Y')
  equal(after.layers.find(layer => layer.id === 'parent'), before.layers.find(layer => layer.id === 'parent'), 'Child drag changed parent source.')
  equal(after.timelines[1], before.timelines[1], 'Child drag changed inactive parent timeline.')
  assert(live().selection.primaryId === child.id && live().selection.selectedIds.has(child.id), 'Child body release lost selection.')
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Selected child body drag did not undo exactly.')
  assert(!live().editor.canUndo, 'Selected child body drag created multiple history entries.')
  record('Selected child body drag preserves selection and another timeline’s animated parent', { delta, parentTimelinePreserved: true, oneUndo: true })
}

/** Duplicate forest normalization includes descendants once and remaps internal
 * cross-root references; external source links intentionally remain external. */
async function forestDuplicate(mount: (fixture: Fixture) => Promise<void>) {
  const fixture = animatedFixture(['parent', 'child']), peer = rectangle('peer', 70, 350)
  fixture.scene.layers.push(peer)
  fixture.scene.layers[1].masks = [{ id: 'internal-mask', maskLayerId: peer.id, mode: 'add' }]
  fixture.selected.push(peer.id); await mount(fixture); const before = structuredClone(live().editor.getScene())
  flushSync(() => host.querySelector<HTMLButtonElement>('nav button')!.click()); await frames()
  const after = live().editor.getScene(), parent = copyOf(after, before, 'parent'), child = copyOf(after, before, 'child'), grandchild = copyOf(after, before, 'grandchild'), peerCopy = copyOf(after, before, 'peer')
  assert(after.layers.length === before.layers.length * 2, 'Selected parent+child cloned descendants twice.')
  assert(child.parentId === parent.id && grandchild.parentId === child.id, 'Copied forest parent map broke.')
  assert(child.masks?.[0].maskLayerId === peerCopy.id, 'Cross-root internal mask was not remapped.')
  originalsIntact(after, before); copiedTracks(after, before, 'child', child.id)
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Forest duplicate undo incomplete.')
  record('duplicate selection normalizes roots and remaps cross-root references', { originals: before.layers.length, total: after.layers.length, copiedMask: child.masks?.[0].maskLayerId })
}

/** The production useKeyboard registry/handler route must duplicate keyed
 * subtrees for both platforms; dispatching a shortcut never calls duplicate
 * directly. Connected canvas owns the event and browser defaults are prevented. */
async function keyboardDuplicates(mount: (fixture: Fixture) => Promise<void>) {
  for (const modifier of ['ctrlKey', 'metaKey'] as const) {
    await mount(animatedFixture()); const before = structuredClone(live().editor.getScene())
    const event = new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', bubbles: true, cancelable: true, [modifier]: true })
    flushSync(() => canvas().dispatchEvent(event)); await frames()
    assert(event.defaultPrevented, `${modifier}+D was not consumed by the real keyboard handler.`)
    const after = live().editor.getScene(), child = copyOf(after, before, 'child'), descendant = copyOf(after, before, 'grandchild')
    assert(after.layers.length === before.layers.length + 2 && child.parentId === 'parent' && descendant.parentId === child.id, 'Keyboard duplicate broke subtree/parent.')
    originalsIntact(after, before); const tracks = copiedTracks(after, before, 'child', child.id)
    assert(live().selection.selectedIds.has(child.id), 'Keyboard duplicate did not select the copied root.')
    flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Keyboard duplicate undo incomplete.')
    assert(!live().editor.canUndo, 'Keyboard duplicate made multiple history steps.')
    record(`${modifier === 'metaKey' ? 'Cmd' : 'Ctrl'}+D uses the native keyboard handler and copies keyed subtree`, { tracks, parent: child.parentId, newLayers: 2, oneUndo: true })
  }
}

/** Alt/Cmd remain down for the entire gesture, including mouse-up. No key-up
 * event is sent: releasing a modifier must never be a prerequisite to commit. */
async function heldModifierCopies(mount: (fixture: Fixture) => Promise<void>) {
  for (const held of ['altKey', 'metaKey'] as const) {
    await mount(animatedFixture()); const before = structuredClone(live().editor.getScene())
    const world = resolveLayerWorldMatrix(before.layers.find(layer => layer.id === 'child')!, before, 500)
      .applyToPoint({ x: 35, y: 22 })
    const rect = canvas().getBoundingClientRect()
    const start = { x: rect.left + world.x * rect.width / 900, y: rect.top + world.y * rect.height / 550 }
    const end = endPoint(start, { x: 32, y: -19 })
    pointer(canvas(), 'pointerdown', start, true, 1, held)
    pointer(window, 'pointermove', end, true, 1, held); await frames()
    pointer(window, 'pointerup', end, true, 1, held); await frames()
    assert(!live().editor.isTransactionActive(), 'Mouse-up left a copy waiting for modifier release.')
    const after = live().editor.getScene(), child = copyOf(after, before, 'child')
    originalsIntact(after, before); copiedTracks(after, before, 'child', child.id)
    assert(child.parentId === 'parent', 'Held modifier changed the clone parent.')
    flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Held-modifier copy was not one undo.')
    record(`${held === 'altKey' ? 'Alt' : 'Cmd'} held through mouse-up commits copy without key release`, { modifierHeld: true, tracksPreserved: true, parent: child.parentId })
  }
}

/** Click/tiny drag and native cancel paths must leave source/history untouched. */
async function canceledDrags(mount: (fixture: Fixture) => Promise<void>) {
  for (const kind of ['click', 'tiny', 'escape', 'pointercancel'] as const) {
    await mount(animatedFixture()); const before = structuredClone(live().editor.getScene()), handle = titled(FREE_MOVE), start = center(handle)
    const end = kind === 'tiny' ? { x: start.x + 1, y: start.y + 1 } : endPoint(start, { x: 25, y: 15 })
    pointer(handle, 'pointerdown', start)
    if (kind !== 'click') pointer(window, 'pointermove', end)
    if (kind === 'escape') flushSync(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    else pointer(window, kind === 'pointercancel' ? 'pointercancel' : 'pointerup', kind === 'click' ? start : end)
    await frames(); equal(live().editor.getScene(), before, `${kind} retained a copy or changed parent/source.`)
    assert(!live().editor.canUndo && !live().editor.isTransactionActive(), `${kind} left history/transaction.`)
    record(`${kind} drag-copy leaves original source and history unchanged`, { unchanged: true })
  }
}

/** Public isolated runner exposes all evidence and the exact build manifest. */
async function main() {
  document.body.innerHTML = '<style>body{margin:16px;background:#0f172a;color:#e2e8f0;font:14px system-ui}button{padding:7px 11px;background:#1d4ed8;color:white;border:1px solid #64748b;border-radius:5px}button:disabled{opacity:.4}#clone-host{width:1180px;max-width:100%;border:1px solid #475569;display:flex;flex-direction:column}pre{white-space:pre-wrap;overflow-wrap:anywhere}#checks{color:#86efac}</style><h1>Duplicate and drag-copy native acceptance</h1><p>Actual SceneCanvas + editor/history + public forest clone command · isolated inline sources · connected documents unchanged</p><button id="run-clones">Run clone checks</button><button id="inspect">Open editable fixture</button><p id="status">Ready</p><pre id="checks"></pre><section id="clone-host"></section><pre id="report">No checks run.</pre>'
  host = document.getElementById('clone-host')!; const root = createRoot(host); let generation = 0
  const run = document.getElementById('run-clones') as HTMLButtonElement, inspect = document.getElementById('inspect') as HTMLButtonElement
  const mount = async (fixture: Fixture) => { runtime = undefined; flushSync(() => root.render(<Subject key={++generation} fixture={fixture} />)); await frames(4); assert(!live().snap, 'Snapping did not disable.') }
  inspect.onclick = async () => { await mount(animatedFixture()) }
  run.onclick = async () => {
    run.disabled = inspect.disabled = true; checks.length = 0; document.getElementById('checks')!.textContent = ''
    const status = document.getElementById('status')!, start = performance.now(); let manifest: unknown
    try { status.textContent = 'Running actual duplicate and pointer controls…'
      const metadata = await (await fetch('clone-interactions-sources.json')).json(); manifest = { sourceManifest: 'clone-interactions-sources.json', bundleSha256: metadata.bundleSha256, sourceFiles: metadata.sources.length }
      await keyedDrag(mount); await firstBodyDrags(mount); await selectedChildBody(mount); await forestDuplicate(mount); await keyboardDuplicates(mount); await heldModifierCopies(mount); await canceledDrags(mount)
      status.textContent = `PASS · ${checks.length} checks`; document.getElementById('report')!.textContent = JSON.stringify({ passed: true, checks, manifest, elapsedMs: performance.now() - start, dpr: devicePixelRatio, userAgent: navigator.userAgent, scope: 'Native pointer events through real SceneCanvas; duplicate via public forest command and actual useKeyboard. No user document.' }, null, 2)
    } catch (error) { status.textContent = 'FAIL'; document.getElementById('report')!.textContent = JSON.stringify({ passed: false, error: String(error), checks, manifest }, null, 2) }
    finally { run.disabled = inspect.disabled = false }
  }
}
void main().catch(error => { document.body.textContent = `Clone acceptance setup failed: ${String(error)}` })
