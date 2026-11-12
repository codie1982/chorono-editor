import { useLayoutEffect, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SceneCanvas from '@/components/SceneCanvas'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { useKeyboard } from '@/app/hooks/useKeyboard'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { evaluateTimelines } from '@/lib/evaluator'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { buildViewportKeyframeCommands } from '@/lib/editor/viewportKeyframes'
import { buildViewportNudgeCommand } from '@/lib/editor/viewportNudge'
import { combineLayerSelection, createLayerSelection, toggleLayerSelection, type LayerSelection } from '@/lib/selection/layerSelection'
import type { ChronoScene, Layer } from '@/lib/types'

type Point = { x: number; y: number }
type Tool = ComponentProps<typeof SceneCanvas>['toolMode']
interface Fixture { name: string; scene: ChronoScene; selected: string[]; primary?: string; timeMs?: number; tool?: Tool }
interface Runtime { editor: EditorStateReturn; selection: LayerSelection; snapEnabled: boolean; timelineSeeks: () => number }
interface Check { name: string; passed: true; evidence: unknown }
let runtime: Runtime | undefined
let host: HTMLElement
const checks: Check[] = []
const POINTER_ID = 1
const FREE_MOVE = 'Drag — free move (X + Y together)'

/** Mount the actual editor/renderer/snap hooks in an isolated document. Source
 * fixtures have no external assets; the normal asset hook still owns readiness
 * and cleanup. Selection and animation commands follow the production contracts.
 * No connected editor, localStorage, application route or private drag ref is used. */
function Subject({ fixture }: { fixture: Fixture }) {
  const editor = useEditorState(fixture.scene), snap = useSnapSettings()
  const assets = useAssetCache(editor.scene.assets)
  const [selection, setSelection] = useState(() => createLayerSelection(fixture.selected, fixture.primary ?? null))
  const selectedIds = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds])
  const timeMs = fixture.timeMs ?? 0
  const timelineSeeks = useRef(0)
  const overrides = useMemo(() => evaluateTimelines(editor.scene.timelines, timeMs), [editor.scene.timelines, timeMs])
  useEffect(() => { snap.setEnabled(false) }, [])
  useLayoutEffect(() => { runtime = { editor, selection, snapEnabled: snap.settings.enabled, timelineSeeks: () => timelineSeeks.current } })
  useKeyboard({
    onUndo: editor.undo, onRedo: editor.redo, isTransactionActive: editor.isTransactionActive,
    onPlayToggle: () => {}, onDeleteSelected: () => {}, onDuplicateSelected: () => {},
    onStepBack: () => { timelineSeeks.current++ }, onStepForward: () => { timelineSeeks.current++ },
    getContext: () => 'canvas',
    onNudgeSelected: (dx, dy) => {
      const command = buildViewportNudgeCommand(editor.getScene(), selection.selectedIds, { x: dx, y: dy }, {
        timelineId: fixture.scene.timelines[0]?.id ?? '', timeMs, autoKeyframe: false, overrides,
      })
      if (command) editor.dispatchCommand(command)
    },
  })
  return <SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap}
    selectedLayerId={selection.primaryId} selectedLayerIds={selectedIds}
    onSelectLayer={(id, shiftHeld = false) => setSelection(previous => id == null ? createLayerSelection([])
      : shiftHeld ? toggleLayerSelection(previous, id) : createLayerSelection([id], id))}
    onSelectByGeometry={(ids, mode) => setSelection(previous => combineLayerSelection(previous, ids, mode))}
    getShortcutContext={() => 'canvas'} timeMs={timeMs} overrides={overrides}
    isPlaying={false} previewMode={false} toolMode={fixture.tool ?? 'move'}
    selectedTimeline={editor.scene.timelines[0] ?? null}
    buildLayerCommitCommands={changes => buildViewportKeyframeCommands(editor.getScene(), changes, {
      timelineId: fixture.scene.timelines[0]?.id ?? '', timeMs, autoKeyframe: false,
    })} />
}

/** Deterministic source fixtures: dimensions are composition pixels, rotations
 * degrees, and timelines milliseconds. No fixture is borrowed from a user file. */
function sceneWith(...layers: Layer[]): ChronoScene {
  const scene = emptyScene()
  return { ...scene, composition: { ...scene.composition, width: 800, height: 500, durationMs: 1000 }, layers, timelines: [] }
}

/** A native rectangle with a nonzero local pivot and readable contrast. */
function rectangle(id: string, x: number, y: number): Layer {
  const layer = newRectLayer()
  return { ...layer, id, name: id, size: { width: 80, height: 50 },
    transform: { ...layer.transform, x, y, anchorX: 40, anchorY: 25 } }
}

/** Nested reflected/nonuniform parent exercises world/local adapters rather
 * than reproducing the gesture's implementation in the test expectations. */
function nestedFixture(selected: string[]): Fixture {
  const parent = { ...rectangle('parent', 430, 200), type: 'group' as const,
    transform: { x: 430, y: 200, anchorX: 0, anchorY: 0, rotationDeg: 32, scaleX: -1.5, scaleY: 0.75 } }
  const child = { ...rectangle('child', 70, 25), parentId: parent.id }
  return { name: `nested-${selected.join('-')}`, scene: sceneWith(parent, child), selected, primary: child.id }
}

/** Read only the current editor API after React has committed. */
function live(): Runtime { assert(runtime, 'The isolated editor did not mount.'); return runtime }
/** Report a failed invariant immediately; never convert missing UI to a pass. */
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
/** A composition-space tolerance far below a visible CSS pixel at test zoom. */
function close(actual: number, expected: number, message: string, tolerance = 1e-5) {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected}`)
}
/** Compare serialized source snapshots, including key IDs and easing metadata. */
function equal(actual: unknown, expected: unknown, message: string) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message)
}
/** Wait only for actual visible animation frames; no arbitrary sleeps. */
async function frames(count = 2) { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame) }
/** Locate the native canvas, independent of overlay implementation (SVG/DIV). */
function canvas(): HTMLCanvasElement {
  const element = host.querySelector('canvas'); assert(element, 'Missing SceneCanvas canvas.'); return element
}
/** Locate real interactive controls by their public accessible title. */
function titled(title: string): Element {
  const element = Array.from(host.querySelectorAll('[title]')).find(item => item.getAttribute('title') === title)
  assert(element, `Missing viewport control: ${title}`); return element
}
/** Map composition pixels to CSS client pixels using the actual canvas rect;
 * current pan, zoom, host layout and DPR therefore remain in the real path. */
function toClient(point: Point): Point {
  const rect = canvas().getBoundingClientRect()
  return { x: rect.left + point.x * rect.width / 800, y: rect.top + point.y * rect.height / 500 }
}
/** Inverse of the observable canvas projection, used only to inspect DOM marks. */
function toComposition(point: Point): Point {
  const rect = canvas().getBoundingClientRect()
  return { x: (point.x - rect.left) * 800 / rect.width, y: (point.y - rect.top) * 500 / rect.height }
}
/** Screen center of either a DIV handle or SVG marker. */
function center(element: Element): Point {
  const rect = element.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}
/** Dispatch through actual React/window pointer handlers, with synchronous
 * commit barriers. Mouse pointer ID matches the real Run-button interaction;
 * no capture/geometry/session method is replaced by a test double. */
function pointer(target: EventTarget, type: string, point: Point, shiftKey = false, pointerId = POINTER_ID) {
  flushSync(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
    pointerId, pointerType: 'mouse', isPrimary: pointerId === POINTER_ID, button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    clientX: point.x, clientY: point.y, shiftKey })))
}
/** One complete real pointer gesture. Preview and release intentionally arrive
 * without a RAF between them to exercise the latest-sample/commit boundary. */
function drag(target: Element, start: Point, end: Point) {
  pointer(target, 'pointerdown', start)
  pointer(window, 'pointermove', end)
  assert(live().editor.isTransactionActive(), 'Pointer movement did not open a transaction.')
  pointer(window, 'pointerup', end)
  assert(!live().editor.isTransactionActive(), 'Release left a transaction open.')
}
/** Quarter-turn through the real ring hit area, using its current screen size. */
function quarterTurnRing() {
  const ring = host.querySelector('[data-testid="rotation-ring"]') ?? host.querySelector('circle[stroke="transparent"]')
  assert(ring, 'Missing interactive rotation ring.')
  const rect = ring.getBoundingClientRect()
  drag(ring, { x: rect.right, y: rect.top + rect.height / 2 }, { x: rect.left + rect.width / 2, y: rect.bottom })
}
/** Resolve one source point through the canonical renderer matrix. This checks
 * the observable world-space invariant, not the gesture's inverse calculation. */
function worldPoint(scene: ChronoScene, id: string, point: Point, timeMs = 0): Point {
  const layer = scene.layers.find(item => item.id === id); assert(layer, `Missing layer ${id}`)
  return resolveLayerWorldMatrix(layer, scene, timeMs).applyToPoint(point)
}
/** Append a visible, serializable success only after every assertion completed. */
function record(name: string, evidence: unknown) {
  checks.push({ name, passed: true, evidence })
  document.getElementById('checks')!.textContent = checks.map(check => `✓ ${check.name}`).join('\n')
}

/** Inspect the affine frame's four projected corners against canonical world
 * geometry. Actual canvas CSS dimensions supply zoom; DPR is not reapplied. */
function affineFramePoints(scene: ChronoScene, id: string): Point[] {
  const frame = host.querySelector('[data-testid="selection-frame"][data-selection-points]')
  assert(frame, 'Missing projected affine selection frame.')
  const points: Point[] = JSON.parse(frame.getAttribute('data-selection-points')!)
  const layer = scene.layers.find(item => item.id === id)!, rect = canvas().getBoundingClientRect()
  assert(layer.size && points.length === 4, 'Affine frame does not describe four sized-layer corners.')
  const corners = [{ x: 0, y: 0 }, { x: layer.size.width, y: 0 },
    { x: layer.size.width, y: layer.size.height }, { x: 0, y: layer.size.height }]
  corners.forEach((corner, index) => {
    const world = worldPoint(scene, id, corner)
    close(points[index].x, world.x * rect.width / 800, `Affine frame corner ${index} X`)
    close(points[index].y, world.y * rect.height / 500, `Affine frame corner ${index} Y`)
  })
  return points
}

/** Test the current frame's nested move and root deduplication via the actual
 * free-move gizmo. Child-local geometry must not receive a second parent delta. */
async function moveChecks(mount: (fixture: Fixture) => Promise<void>) {
  for (const selected of [['child'], ['parent', 'child']]) {
    const fixture = nestedFixture(selected); await mount(fixture)
    const before = structuredClone(live().editor.getScene()), delta = { x: 24, y: -17 }
    const frameBefore = affineFramePoints(before, 'child')
    const startWorld = worldPoint(before, 'child', { x: 0, y: 0 })
    const handle = titled(FREE_MOVE), start = center(handle), end = toClient({
      x: toComposition(start).x + delta.x, y: toComposition(start).y + delta.y,
    })
    drag(handle, start, end); await frames()
    const after = live().editor.getScene(), endWorld = worldPoint(after, 'child', { x: 0, y: 0 })
    const frameAfter = affineFramePoints(after, 'child')
    close(endWorld.x - startWorld.x, delta.x, 'World X delta')
    close(endWorld.y - startWorld.y, delta.y, 'World Y delta')
    if (selected.length > 1) equal(after.layers[1], before.layers[1], 'Selected child received an extra local transform.')
    else equal(after.layers[0], before.layers[0], 'Moving child changed its parent.')
    flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Move undo did not restore the source.')
    assert(!live().editor.canUndo && live().editor.canRedo, 'Move was not exactly one history step.')
    record(fixture.name, { delta, startWorld, endWorld, frameBefore, frameAfter, oneUndo: true })
  }
}

/** Rotate two roots by a quarter turn using the displayed ring, proving its
 * marker is the same shared pivot used by the source transformation. */
async function rotationCheck(mount: (fixture: Fixture) => Promise<void>) {
  const a = rectangle('a', 200, 150), b = rectangle('b', 400, 210)
  await mount({ name: 'shared-rotation-pivot', scene: sceneWith(a, b), selected: ['a', 'b'], primary: 'a', tool: 'rotate' })
  const marker = toComposition(center(titled('Rotation pivot'))), expected = { x: 340, y: 205 }
  close(marker.x, expected.x, 'Visible shared pivot X'); close(marker.y, expected.y, 'Visible shared pivot Y')
  const before = structuredClone(live().editor.getScene())
  quarterTurnRing(); await frames()
  const after = live().editor.getScene()
  for (const original of before.layers) {
    const pivot = { x: original.transform.anchorX, y: original.transform.anchorY }
    const oldPoint = worldPoint(before, original.id, pivot), newPoint = worldPoint(after, original.id, pivot)
    const oldVector = { x: oldPoint.x - marker.x, y: oldPoint.y - marker.y }
    const newVector = { x: newPoint.x - marker.x, y: newPoint.y - marker.y }
    close(Math.hypot(newVector.x, newVector.y), Math.hypot(oldVector.x, oldVector.y), 'Rotation radius changed')
    close(oldVector.x * newVector.x + oldVector.y * newVector.y, 0, 'Rotation was not a quarter turn', 1e-3)
    assert(oldVector.x * newVector.y - oldVector.y * newVector.x > 0, 'Rotation direction disagrees with the pointer.')
  }
  const finalMarker = toComposition(center(titled('Rotation pivot')))
  close(finalMarker.x, marker.x, 'Shared pivot moved in X'); close(finalMarker.y, marker.y, 'Shared pivot moved in Y')
  record('shared rotation uses visible pivot', { marker, finalMarker, rotations: after.layers.map(layer => layer.transform.rotationDeg) })
}

/** Change the actual user-facing pivot selector. Active mode fixes the primary
 * root's anchor and rotates the peer around it; a new keyed Subject restores the
 * default selection-center UI for every subsequent fixture. */
async function activePivotCheck(mount: (fixture: Fixture) => Promise<void>) {
  const source = sceneWith(rectangle('a', 200, 150), rectangle('b', 400, 210))
  await mount({ name: 'active-object-pivot', scene: source, selected: ['a', 'b'], primary: 'a', tool: 'rotate' })
  const selector = host.querySelector<HTMLSelectElement>('select[aria-label="Selection pivot"]')
  assert(selector, 'Missing user-facing Selection pivot choice.')
  flushSync(() => { selector.value = 'active'; selector.dispatchEvent(new Event('change', { bubbles: true })) })
  await frames()
  const marker = toComposition(center(titled('Rotation pivot')))
  close(marker.x, 240, 'Active pivot does not match primary X'); close(marker.y, 175, 'Active pivot does not match primary Y')
  quarterTurnRing(); await frames()
  const after = live().editor.getScene(), a = worldPoint(after, 'a', { x: 40, y: 25 }), b = worldPoint(after, 'b', { x: 40, y: 25 })
  close(a.x, marker.x, 'Active root pivot moved in X'); close(a.y, marker.y, 'Active root pivot moved in Y')
  close(b.x, 180, 'Peer did not rotate around active pivot X'); close(b.y, 375, 'Peer did not rotate around active pivot Y')
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), source, 'Active-pivot rotation did not undo atomically.')
  assert(!live().editor.canUndo && live().editor.canRedo, 'Active-pivot rotation created multiple history steps.')
  record('active object pivot choice controls rotation', { selection: selector.value, marker, primaryPivot: a, peerPivot: b, oneUndo: true })
}

/** The common selection frame scales both independent roots about its opposite
 * corner; geometry sizes stay native and relative world placement doubles.
 * One undo restores the complete selected set, rather than primary-only resize. */
async function commonResizeCheck(mount: (fixture: Fixture) => Promise<void>) {
  const source = sceneWith(rectangle('a', 100, 100), rectangle('b', 300, 200))
  await mount({ name: 'common-selection-resize', scene: source, selected: ['a', 'b'], tool: 'select' })
  const frame = host.querySelector('[data-testid="selection-frame"][data-selection-kind="multiple"]')
  assert(frame, 'Multiple selection has no common frame.')
  const handle = frame.querySelector('[data-handle="se"]'); assert(handle, 'Common frame has no SE resize handle.')
  const start = center(handle), initialHandle = toComposition(start)
  close(initialHandle.x, 380, 'Common frame right extent'); close(initialHandle.y, 250, 'Common frame bottom extent')
  drag(handle, start, toClient({ x: 660, y: 400 })); await frames()
  const after = structuredClone(live().editor.getScene())
  for (const layer of source.layers) {
    const result = after.layers.find(item => item.id === layer.id)!
    close(result.transform.scaleX, 2, `${layer.id} X scale`); close(result.transform.scaleY, 2, `${layer.id} Y scale`)
    equal(result.size, layer.size, 'Common frame changed source geometry size.')
    for (const local of [{ x: 0, y: 0 }, { x: 80, y: 50 }]) {
      const beforePoint = worldPoint(source, layer.id, local), afterPoint = worldPoint(after, layer.id, local)
      close(afterPoint.x, 100 + (beforePoint.x - 100) * 2, 'Common frame did not scale root placement in X')
      close(afterPoint.y, 100 + (beforePoint.y - 100) * 2, 'Common frame did not scale root placement in Y')
    }
  }
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), source, 'Common resize undo missed a selected root.')
  assert(!live().editor.canUndo && live().editor.canRedo, 'Common resize created more than one undo entry.')
  flushSync(() => live().editor.redo()); equal(live().editor.getScene(), after, 'Common resize redo changed source.')
  record('common frame resizes every selected root', { initialHandle, scales: after.layers.map(layer => ({ id: layer.id, transform: layer.transform })), oneUndo: true })
}

/** Actual keyboard registry dispatch moves independent roots (and inherited
 * children) by 1/10 composition pixels. Global frame navigation must not run in
 * this canvas context, and each key action owns exactly one history entry. */
async function keyboardNudgeCheck(mount: (fixture: Fixture) => Promise<void>) {
  const fixture = nestedFixture(['parent', 'child', 'peer'])
  fixture.name = 'keyboard-selected-roots'; fixture.scene.layers.push(rectangle('peer', 600, 300))
  await mount(fixture)
  const source = structuredClone(live().editor.getScene())
  const key = (name: string, shiftKey = false) => flushSync(() => canvas().dispatchEvent(new KeyboardEvent('keydown', {
    key: name, shiftKey, bubbles: true, cancelable: true,
  })))
  key('ArrowRight'); key('ArrowDown', true); await frames()
  const after = structuredClone(live().editor.getScene())
  equal(after.layers[1], source.layers[1], 'Keyboard moved the selected descendant twice.')
  for (const id of ['parent', 'child', 'peer']) {
    const beforePoint = worldPoint(source, id, { x: 0, y: 0 }), afterPoint = worldPoint(after, id, { x: 0, y: 0 })
    close(afterPoint.x - beforePoint.x, 1, `${id} keyboard X movement`)
    close(afterPoint.y - beforePoint.y, 10, `${id} keyboard Y movement`)
  }
  assert(live().timelineSeeks() === 0, 'Canvas keyboard nudge sought the timeline.')
  flushSync(() => live().editor.undo())
  const afterOneUndo = live().editor.getScene()
  for (const id of ['parent', 'child', 'peer']) {
    const beforePoint = worldPoint(source, id, { x: 0, y: 0 }), point = worldPoint(afterOneUndo, id, { x: 0, y: 0 })
    close(point.x - beforePoint.x, 1, 'First undo removed more than the last key action')
    close(point.y, beforePoint.y, 'First undo did not remove the 10-pixel action')
  }
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), source, 'Two key actions did not undo exactly.')
  assert(!live().editor.canUndo, 'Keyboard action created extra history entries.')
  record('keyboard nudges selected roots without seeking time', { deltaWorld: { x: 1, y: 10 }, timelineSeeks: live().timelineSeeks(), undoSteps: 2 })
}

/** Animate source X, drag its interpolated pose, and verify that source plus
 * new midpoint key are one undo/redo without altering endpoint metadata. */
async function animatedCheck(mount: (fixture: Fixture) => Promise<void>) {
  const source = sceneWith(rectangle('animated', 80, 100)), timeline = newTimeline()
  timeline.id = 'motion'; timeline.durationMs = 1000; timeline.loop = false
  timeline.tracks = [{ target: 'layers.animated.transform.x', keyframes: [
    { id: 'earlier-key', timeMs: 0, value: 100, easing: { type: 'easeInOut' }, tangentMode: 'broken' },
    { id: 'later-key', timeMs: 1000, value: 300, easing: { type: 'easeOut' } },
  ] }]
  source.timelines = [timeline]
  await mount({ name: 'animated-drag', scene: source, selected: ['animated'], timeMs: 500 })
  const before = structuredClone(live().editor.getScene()), startWorld = worldPoint(before, 'animated', { x: 0, y: 0 }, 500)
  close(startWorld.x, 200, 'Animated fixture is not at its midpoint')
  const handle = titled(FREE_MOVE), start = center(handle), origin = toComposition(start)
  drag(handle, start, toClient({ x: origin.x + 37, y: origin.y - 12 })); await frames()
  const after = structuredClone(live().editor.getScene()), finalWorld = worldPoint(after, 'animated', { x: 0, y: 0 }, 500)
  close(finalWorld.x, 237, 'Animated release jumped in X'); close(finalWorld.y, startWorld.y - 12, 'Animated release jumped in Y')
  const keys = after.timelines[0].tracks[0].keyframes
  equal(keys.filter(key => key.id === 'earlier-key' || key.id === 'later-key'), before.timelines[0].tracks[0].keyframes,
    'Viewport edit changed earlier/later key metadata.')
  assert(keys.length === 3 && keys.some(key => key.timeMs === 500 && key.value === 237), 'Missing edited midpoint key.')
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'One undo did not restore source plus keys.')
  assert(!live().editor.canUndo && live().editor.canRedo, 'Animated gesture created multiple history entries.')
  flushSync(() => live().editor.redo()); equal(live().editor.getScene(), after, 'Redo changed the key identities or source.')
  record('animated midpoint drag / single undo / redo', { startWorld, finalWorld, keys, oneUndo: true })
}

/** Shift-click must add/remove through SceneCanvas's public callback, including
 * removing the primary and final member without creating scene history. */
async function selectionCheck(mount: (fixture: Fixture) => Promise<void>) {
  const source = sceneWith(rectangle('a', 150, 120), rectangle('b', 400, 220))
  await mount({ name: 'shift-toggle', scene: source, selected: ['a'] })
  for (const [id, expected] of [['b', ['a', 'b']], ['b', ['a']], ['a', []]] as const) {
    const layer = source.layers.find(item => item.id === id)!
    const point = toClient(worldPoint(source, id, { x: layer.transform.anchorX, y: layer.transform.anchorY }))
    pointer(canvas(), 'pointerdown', point, true); pointer(window, 'pointerup', point, true)
    equal(Array.from(live().selection.selectedIds), expected, 'Shift-click selected the wrong members.')
    const primary = live().selection.primaryId
    assert(primary === null || live().selection.selectedIds.has(primary), 'Primary escaped selected IDs.')
  }
  equal(live().editor.getScene(), source, 'Selection mutated the scene.')
  assert(!live().editor.canUndo, 'Selection created scene history.')
  record('Shift toggles and valid primary', { finalPrimary: live().selection.primaryId, finalCount: live().selection.selectedIds.size })
}

/** Escape and pointercancel restore only the active preview and close all
 * gesture ownership; subsequent pointer-up cannot commit cancelled changes. */
async function cancelCheck(mount: (fixture: Fixture) => Promise<void>) {
  const source = sceneWith(rectangle('cancel', 300, 200))
  await mount({ name: 'gesture-cancel', scene: source, selected: ['cancel'] })
  for (const cancel of ['Escape', 'pointercancel']) {
    const handle = titled(FREE_MOVE), start = center(handle), origin = toComposition(start)
    const end = toClient({ x: origin.x + 30, y: origin.y + 15 })
    pointer(handle, 'pointerdown', start); pointer(window, 'pointermove', end)
    assert(live().editor.isTransactionActive(), `${cancel}: no preview transaction.`)
    if (cancel === 'Escape') flushSync(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    else pointer(window, 'pointercancel', end)
    pointer(window, 'pointerup', end)
    equal(live().editor.getScene(), source, `${cancel} changed source or allowed a late commit.`)
    assert(!live().editor.isTransactionActive() && !live().editor.canUndo, `${cancel} left history or an active transaction.`)
  }
  record('Escape and pointercancel preserve source/history', { canUndo: live().editor.canUndo, transactionActive: live().editor.isTransactionActive() })
}

/** A second pointer-down during preview must not begin another transaction
 * against that preview. Cancelling the first pointer still restores its original
 * source, and neither pointer's late release can create a history entry. */
async function overlappingPointerCheck(mount: (fixture: Fixture) => Promise<void>) {
  const source = sceneWith(rectangle('overlap', 300, 200))
  await mount({ name: 'overlapping-pointer', scene: source, selected: ['overlap'] })
  const handle = titled(FREE_MOVE), start = center(handle), origin = toComposition(start)
  const end = toClient({ x: origin.x + 30, y: origin.y + 15 })
  pointer(handle, 'pointerdown', start); pointer(window, 'pointermove', end)
  assert(live().editor.isTransactionActive(), 'Initial pointer did not open its preview transaction.')
  const preview = structuredClone(live().editor.getScene())
  assert(JSON.stringify(preview) !== JSON.stringify(source), 'Initial pointer did not produce a distinct preview.')
  const secondHandle = titled(FREE_MOVE), secondStart = center(secondHandle)
  pointer(secondHandle, 'pointerdown', secondStart, false, 2)
  equal(live().editor.getScene(), preview, 'Second pointer-down changed the active preview.')
  assert(live().editor.isTransactionActive(), 'Second pointer-down prematurely closed the first gesture.')
  flushSync(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  pointer(window, 'pointerup', secondStart, false, 2); pointer(window, 'pointerup', end)
  equal(live().editor.getScene(), source, 'Second pointer-down replaced the baseline restored by Escape.')
  assert(!live().editor.isTransactionActive() && !live().editor.canUndo && !live().editor.canRedo,
    'Overlapping pointer left a transaction or history entry.')
  record('second pointer cannot replace transaction baseline', { cancelledToOriginal: true, canUndo: live().editor.canUndo })
}

/** A collapsed affine frame still has visible resize handles. Starting its
 * resize must diagnose before inversion, opening no transaction or history and
 * leaving the source unchanged after subsequent move/release events. */
async function singularResizeCheck(mount: (fixture: Fixture) => Promise<void>) {
  const layer = rectangle('collapsed', 300, 200)
  layer.transform.scaleX = 0
  const source = sceneWith(layer)
  await mount({ name: 'singular-resize', scene: source, selected: [layer.id], tool: 'select' })
  const handle = host.querySelector('[data-handle="ne"]'); assert(handle, 'Missing collapsed layer resize handle.')
  const start = center(handle), origin = toComposition(start), end = toClient({ x: origin.x + 20, y: origin.y - 15 })
  pointer(handle, 'pointerdown', start)
  assert(!live().editor.isTransactionActive(), 'Zero-scale resize opened a transaction before rejecting inversion.')
  const warning = host.querySelector('[role="status"]')?.textContent ?? ''
  assert(/zero|singular/i.test(warning), 'Zero-scale resize did not show its diagnostic.')
  pointer(window, 'pointermove', end); pointer(window, 'pointerup', end)
  equal(live().editor.getScene(), source, 'Declined zero-scale resize mutated source.')
  assert(!live().editor.canUndo && !live().editor.canRedo, 'Declined zero-scale resize created history.')
  record('zero-scale resize is declined before transaction', { warning, canUndo: live().editor.canUndo })
}

/** Position keys combined with a static nonidentity rotation make anchor
 * compensation pose-dependent. Verify this previously unguarded combination is
 * declined, preserving every key ID/easing and source without a transaction. */
async function keyedAnchorCheck(mount: (fixture: Fixture) => Promise<void>) {
  const layer = rectangle('keyed-pivot', 300, 200)
  layer.transform.rotationDeg = 90
  const source = sceneWith(layer), timeline = newTimeline()
  timeline.id = 'pivot-motion'; timeline.durationMs = 1000; timeline.loop = false
  timeline.tracks = [{ target: `layers.${layer.id}.transform.x`, keyframes: [
    { id: 'position-start', timeMs: 0, value: 250, easing: { type: 'easeInOut' } },
    { id: 'position-end', timeMs: 1000, value: 350, easing: { type: 'easeOut' } },
  ] }]
  source.timelines = [timeline]
  await mount({ name: 'keyed-anchor-declined', scene: source, selected: [layer.id], tool: 'anchor', timeMs: 500 })
  const handle = titled('Anchor point (rotation / scale pivot) — drag to reposition'), start = center(handle)
  const origin = toComposition(start), end = toClient({ x: origin.x + 20, y: origin.y + 10 })
  pointer(handle, 'pointerdown', start)
  assert(!live().editor.isTransactionActive(), 'Keyed anchor edit opened a transaction.')
  const warning = host.querySelector('[role="status"]')?.textContent ?? ''
  assert(/animated|poses|pivot/i.test(warning), 'Keyed anchor edit did not explain why it was declined.')
  pointer(window, 'pointermove', end); pointer(window, 'pointerup', end)
  equal(live().editor.getScene(), source, 'Declined keyed anchor edit changed source or key metadata.')
  assert(!live().editor.canUndo && !live().editor.canRedo, 'Declined keyed anchor edit created history.')
  record('keyed transform anchor is declined without mutation', { channel: timeline.tracks[0].target,
    staticRotationDeg: layer.transform.rotationDeg, warning, canUndo: live().editor.canUndo })
}

/** Legacy path editing uses the same full matrix projection as its artwork.
 * Moving a connected anchor must neither recenter a custom pivot nor move
 * neighbouring points; its attached handles translate with that local anchor. */
async function pathCheck(mount: (fixture: Fixture) => Promise<void>) {
  const path: Layer = { ...rectangle('path', 330, 200), type: 'path', size: undefined,
    transform: { x: 330, y: 200, anchorX: 11, anchorY: -7, rotationDeg: 35, scaleX: 1.6, scaleY: 0.75 },
    path: { closed: true, anchors: [
      { x: 0, y: 0, outX: 20, outY: 0, pointType: 'smooth' },
      { x: 100, y: 0, pointType: 'corner' }, { x: 100, y: 60, pointType: 'corner' },
    ] } }
  const source = sceneWith(path)
  await mount({ name: 'legacy-path-anchor', scene: source, selected: ['path'], tool: 'select' })
  const pivot = { x: path.transform.anchorX, y: path.transform.anchorY }
  const initialPivot = worldPoint(source, path.id, pivot), initialPoint = worldPoint(source, path.id, path.path!.anchors[0])
  drag(canvas(), toClient(initialPoint), toClient({ x: initialPoint.x + 18, y: initialPoint.y - 9 })); await frames()
  const after = live().editor.getScene(), edited = after.layers[0]
  const finalPoint = worldPoint(after, path.id, edited.path!.anchors[0]), finalPivot = worldPoint(after, path.id, pivot)
  close(finalPoint.x - initialPoint.x, 18, 'Legacy anchor missed the pointer in X')
  close(finalPoint.y - initialPoint.y, -9, 'Legacy anchor missed the pointer in Y')
  equal(edited.transform, path.transform, 'Point edit changed the custom pivot/transform.')
  equal(edited.path!.anchors.slice(1), path.path!.anchors.slice(1), 'Point edit changed connected neighbours.')
  close(finalPivot.x, initialPivot.x, 'Path pivot jumped in X'); close(finalPivot.y, initialPivot.y, 'Path pivot jumped in Y')
  const anchor = edited.path!.anchors[0]
  close(anchor.outX! - anchor.x, 20, 'Attached handle X offset changed'); close(anchor.outY! - anchor.y, 0, 'Attached handle Y offset changed')
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), source, 'Path edit undo did not restore source.')
  record('rotated legacy anchor preserves pivot/connectivity', { initialPoint, finalPoint, initialPivot, finalPivot })
}

/** Standalone visible acceptance runner. Failures leave the current real canvas
 * mounted for inspection, with the completed checks and exact source manifest.
 * Re-running remounts isolated fixtures; closing the page releases their hooks. */
async function main() {
  document.body.innerHTML = '<style>body{margin:20px;background:#101827;color:#e5edf8;font:14px system-ui}button{padding:9px 14px;background:#2563eb;color:white;border:0;border-radius:6px}button:disabled{opacity:.5}#viewport-host{display:flex;position:relative;width:960px;height:650px;max-width:100%;border:1px solid #475569}pre{white-space:pre-wrap;overflow-wrap:anywhere}#checks{color:#86efac}</style><h1>Viewport pointer acceptance</h1><p>Isolated fixtures · actual SceneCanvas, history, snap and animation commands · connected documents unchanged</p><button id="run-viewport">Run viewport checks</button><p id="status">Ready</p><pre id="checks"></pre><section id="viewport-host"></section><pre id="report">No checks run.</pre>'
  host = document.getElementById('viewport-host')!
  const root = createRoot(host), button = document.getElementById('run-viewport') as HTMLButtonElement
  let generation = 0
  const mount = async (fixture: Fixture) => {
    runtime = undefined
    flushSync(() => root.render(<Subject key={++generation} fixture={fixture} />))
    await frames(3)
    assert(!live().snapEnabled, 'Fixture snapping did not disable.')
    if (fixture.tool !== 'anchor') assert(host.querySelector('[data-testid="selection-frame"]'), 'Visible selection frame is missing.')
  }
  button.onclick = async () => {
    button.disabled = true; checks.length = 0
    document.getElementById('checks')!.textContent = ''
    const status = document.getElementById('status')!, started = performance.now()
    let manifest: unknown
    try {
      status.textContent = 'Running actual viewport gestures…'
      const prepared = await (await fetch('viewport-interactions-sources.json')).json()
      manifest = { sourceManifest: 'viewport-interactions-sources.json', preparedAt: prepared.preparedAt,
        sourceFiles: prepared.sources.length, bundleSha256: prepared.bundleSha256, baseCssSha256: prepared.baseCssSha256 }
      await moveChecks(mount); await rotationCheck(mount); await activePivotCheck(mount); await animatedCheck(mount)
      await commonResizeCheck(mount); await keyboardNudgeCheck(mount)
      await selectionCheck(mount); await cancelCheck(mount); await overlappingPointerCheck(mount)
      await singularResizeCheck(mount); await keyedAnchorCheck(mount); await pathCheck(mount)
      status.textContent = `PASS · ${checks.length} checks`
      document.getElementById('report')!.textContent = JSON.stringify({ passed: true, checks, manifest,
        elapsedMs: performance.now() - started, userAgent: navigator.userAgent, dpr: devicePixelRatio,
        scope: 'Programmatically dispatched native pointer/keyboard events through mounted real editor controls; no connected user document.' }, null, 2)
    } catch (error) {
      status.textContent = 'FAIL'
      document.getElementById('report')!.textContent = JSON.stringify({ passed: false, error: String(error), checks, manifest }, null, 2)
    } finally { button.disabled = false }
  }
}
void main().catch(error => { document.body.textContent = `Viewport acceptance setup failed: ${String(error)}` })
