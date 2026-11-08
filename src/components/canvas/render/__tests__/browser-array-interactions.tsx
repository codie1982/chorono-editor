import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SceneCanvas from '@/components/SceneCanvas'
import ArrayModal from '@/components/modals/ArrayModal'
import { useArrayAuthoring } from '@/components/array/useArrayAuthoring'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newRectLayer, newTimeline, newMotionPathLayer } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'
import { evaluateTimelines } from '@/lib/evaluator'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { resolveLayerWorldBounds } from '@/lib/geometry/resolveLayerWorldBounds'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { acquirePortableScene } from '@/lib/export/portable/PortableSceneOutput'
import { OutputResources } from '@/lib/export/resources'

type Point = { x: number; y: number }
interface Fixture { scene: ChronoScene; selected: string[]; primary: string }
interface Runtime { editor: EditorStateReturn; array: ReturnType<typeof useArrayAuthoring>; selected: ReadonlySet<string>; snap: boolean }
interface Check { name: string; passed: true; evidence: unknown }
let runtime: Runtime | undefined, host: HTMLElement
const checks: Check[] = []

/** Mount the real modal, production authoring adapter and real canvas on one
 * editor. UI callbacks supply selection only; the harness never reconstructs
 * Array settings, creates preview clones or replaces Apply's prepared command. */
function Subject({ fixture }: { fixture: Fixture }) {
  const editor = useEditorState(fixture.scene), assets = useAssetCache(editor.scene.assets), snap = useSnapSettings()
  const [selected, setSelected] = useState(new Set(fixture.selected)), [primary, setPrimary] = useState(fixture.primary)
  const timeMs = 500, ids = useMemo(() => selected, [selected])
  const array = useArrayAuthoring({ editor, scene: editor.scene, timeMs, selectedLayerIds: ids, selectedLayerId: primary,
    onSelectLayers: next => { setSelected(new Set(next)); setPrimary(next[0] ?? '') } })
  const frame = useMemo(() => evaluateTimelines(editor.scene.timelines, timeMs), [editor.scene.timelines])
  useEffect(() => { snap.setEnabled(false) }, [])
  useLayoutEffect(() => { runtime = { editor, array, selected, snap: snap.settings.enabled } })
  return <><nav data-array-controls style={{ display: 'flex', gap: 8, padding: 8 }}>
    <button onClick={array.open}>Open Array</button><button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button>
    <button onClick={() => { const source = editor.getScene().layers.find(layer => layer.id === 'assembly')!
      editor.dispatchCommand(makeUpdateLayerCmd(source.id, { ...source, transform: { ...source.transform, x: source.transform.x + 1 } }, source)) }}>Manual source edit</button>
  </nav><output aria-label="Array scene summary">Layers {editor.scene.layers.length} · Keys {editor.scene.timelines.reduce((n, timeline) => n + timeline.tracks.reduce((sum, track) => sum + track.keyframes.length, 0), 0)}</output>
  <section data-panel="canvas" style={{ display: 'flex', position: 'relative', height: 720 }}>
    <SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap} selectedLayerId={primary} selectedLayerIds={ids}
      onSelectLayer={id => { if (id) { setSelected(new Set([id])); setPrimary(id) } }} onSelectLayers={next => { setSelected(new Set(next)); setPrimary(next[0] ?? '') }}
      timeMs={timeMs} overrides={frame} isPlaying={false} toolMode="select" selectedTimeline={editor.scene.timelines[0] ?? null} arrayAuthoring={array} />
  </section>{array.active && <ArrayModal authoring={array} />}
  <pre data-testid="array-scene-debug">{JSON.stringify({ selected: Array.from(selected), layers: editor.scene.layers.map(layer => ({ id: layer.id, name: layer.name, parentId: layer.parentId ?? null })) }, null, 2)}</pre></>
}

/** Inline source has overlapping selection, a cross-root mask, sparse ordinary
 * keys on two timelines and a transformed parent/path; it uses no user assets. */
function fixture(nonuniform = false, crossMask = false): Fixture {
  const parent = { ...newRectLayer(), id: 'parent', name: 'External parent', type: 'group' as const, size: undefined,
    transform: { x: 220, y: 160, anchorX: 0, anchorY: 0, rotationDeg: 20, scaleX: nonuniform ? -1.2 : 1.1, scaleY: nonuniform ? 0.8 : 1.1 } }
  const assembly = { ...newRectLayer(), id: 'assembly', name: 'Assembly', type: 'group' as const, size: undefined, parentId: parent.id,
    transform: { x: 100, y: 30, anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 } }
  const tile = rectangle('tile', 'Tile', 0, 0); tile.parentId = assembly.id
  const badge = rectangle('badge', 'Badge', 200, 50); badge.parentId = parent.id
  if (crossMask) tile.masks = [{ id: 'mask', mode: 'add', maskLayerId: badge.id }]
  const pathParent = { ...parent, id: 'path-parent', name: 'Path parent', transform: { ...parent.transform, x: 100, y: 400, rotationDeg: -15, scaleX: 1.4, scaleY: 0.7 } }
  const route = { ...newMotionPathLayer(), id: 'route', name: 'Route', parentId: pathParent.id,
    transform: { x: 20, y: 20, anchorX: 0, anchorY: 0, rotationDeg: 25, scaleX: 1.2, scaleY: 0.9 },
    path: { closed: false, anchors: [{ x: 0, y: 0 }, { x: 220, y: 30 }, { x: 380, y: -80 }] } }
  const scene = { ...emptyScene(), layers: [parent, assembly, tile, badge, pathParent, route] }
  scene.composition = { ...scene.composition, width: 1100, height: 700, durationMs: 3000, frameRate: 30 }
  scene.timelines = [{ ...newTimeline(), id: 'position', durationMs: 3000, loop: false, layerIds: ['parent', 'assembly', 'tile', 'badge'], tracks: [
    { target: 'layers.assembly.transform.x', label: 'Human placement', keyframes: [
      { id: 'x0', timeMs: 0, value: 100, easing: { type: 'easeInOut' }, tangentMode: 'broken' },
      { id: 'x1', timeMs: 1000, value: 160, easing: { type: 'linear' } }] },
    { target: 'layers.assembly.transform.y', keyframes: [
      { id: 'y0', timeMs: 0, value: 30, easing: { type: 'easeOut' } }, { id: 'y1', timeMs: 1000, value: 70, easing: { type: 'linear' } }] },
    { target: 'layers.parent.transform.x', keyframes: [
      { id: 'p0', timeMs: 0, value: 220, easing: { type: 'linear' } }, { id: 'p1', timeMs: 1000, value: 260, easing: { type: 'linear' } }] },
  ] }, { ...newTimeline(), id: 'appearance', durationMs: 3000, loop: false, layerIds: ['tile'], tracks: [
    { target: 'layers.tile.opacity', keyframes: [{ id: 'alpha', timeMs: 0, value: 0.85, easing: { type: 'hold' } }] },
  ] }]
  return { scene, selected: ['assembly', 'tile', 'badge'], primary: 'assembly' }
}

/** Use percent fill opacity and an explicit pivot. */
function rectangle(id: string, name: string, x: number, y: number): Layer {
  return { ...newRectLayer(), id, name, size: { width: 62, height: 38 }, transform: { x, y, anchorX: 8, anchorY: 6, scaleX: 1, scaleY: 1, rotationDeg: 0 },
    style: { fill: { type: 'solid', color: id === 'badge' ? '#f59e0b' : '#22c55e', opacity: 100 } } }
}
/** Missing source/controls fail loudly, never count as skipped passes. */
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
/** Read after real React commits. */
function live(): Runtime { assert(runtime, 'Array subject did not mount.'); return runtime }
/** Compare complete authored source including metadata. */
function equal(a: unknown, b: unknown, message: string) { assert(JSON.stringify(a) === JSON.stringify(b), message) }
/** Use subpixel composition-space tolerance for matrix/evaluator assertions. */
function close(a: number, b: number, message: string) { assert(Number.isFinite(a) && Math.abs(a - b) < 1e-4, `${message}: ${a} != ${b}`) }
/** Advance actual browser paint frames, avoiding fixed time sleeps. */
async function frames(count = 2) { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame) }
/** Public exact control names avoid dependency on component internals. */
function control(name: string): HTMLElement {
  const item = Array.from(document.querySelectorAll<HTMLElement>('button,input,select')).find(el => el.getAttribute('aria-label') === name || el.tagName === 'BUTTON' && el.textContent?.trim() === name)
  assert(item, `Missing public array control '${name}'.`); return item
}
/** Click through production React handlers. */
async function click(name: string) { flushSync(() => control(name).click()); await frames() }
/** Dispatch native input/select changes through React's public handler. */
async function value(name: string, next: number | string) {
  const el = control(name) as HTMLInputElement | HTMLSelectElement
  flushSync(() => { Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(el, String(next))
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })) }); await frames()
}
/** Read a canonical rendered pivot without using Array's solver math. */
function anchor(scene: ChronoScene, id: string, timeMs = 500): Point {
  const layer = scene.layers.find(item => item.id === id); assert(layer, `Missing layer '${id}'.`)
  return resolveLayerWorldMatrix(layer, scene, timeMs).applyToPoint({ x: layer.transform.anchorX, y: layer.transform.anchorY })
}
/** Existing source layer/track records remain byte-for-byte unchanged. */
function originalsIntact(after: ChronoScene, before: ChronoScene) {
  equal(after.layers.filter(layer => before.layers.some(old => old.id === layer.id)), before.layers, 'Array changed a source layer or parent.')
  for (const timeline of before.timelines) {
    const current = after.timelines.find(item => item.id === timeline.id); assert(current, 'Source timeline disappeared.')
    equal(current.tracks.filter(track => timeline.tracks.some(old => old.target === track.target)), timeline.tracks, 'Array changed source keyframes.')
  }
}
/** Record visible proof alongside serializable evidence. */
function record(name: string, evidence: unknown) { checks.push({ name, passed: true, evidence }); document.getElementById('checks')!.textContent = checks.map(item => `✓ ${item.name}`).join('\n') }

/** Linear UI preview must not mutate source; committed world-space displacement,
 * cross-root mask links and every selected source timeline survive one undo. */
async function linearApply(mount: (source?: Fixture) => Promise<void>) {
  await mount(fixture(true, true)); const before = structuredClone(live().editor.getScene())
  await click('Open Array'); await value('Array Count', 3); await value('Array Move X', 80); await value('Array Move Y', 25)
  const plan = live().array.plan; assert(plan, `Linear preview failed: ${live().array.error}`)
  assert(plan.summary.sourceRoots === 2 && plan.summary.sourceLayers === 3, 'Parent+child selection was not normalized.')
  equal(live().editor.getScene(), before, 'Preview wrote temporary clones into source/history.'); assert(!live().editor.canUndo, 'Preview created history.')
  const preview = plan.preview.outlines.map(outline => ({ ...outline, points: outline.points.map(point => ({ ...point })) }))
  await click('Apply array'); const after = live().editor.getScene(), command = plan.buildCommand()
  assert(!live().array.active && command.idMaps.length === 2, 'Apply did not create the expected occurrences/close.')
  originalsIntact(after, before)
  const sourcePivot = anchor(before, 'assembly'), peerPivot = anchor(before, 'badge')
  command.idMaps.forEach((map, index) => {
    const point = anchor(after, map.assembly), peer = anchor(after, map.badge)
    close(point.x - sourcePivot.x, (index + 1) * 80, 'World X placement'); close(point.y - sourcePivot.y, (index + 1) * 25, 'World Y placement')
    close(peer.x - point.x, peerPivot.x - sourcePivot.x, 'Forest relative X'); close(peer.y - point.y, peerPivot.y - sourcePivot.y, 'Forest relative Y')
    const child = after.layers.find(layer => layer.id === map.tile)!
    assert(child.parentId === map.assembly && child.masks?.[0].maskLayerId === map.badge, 'Copied hierarchy or cross-root mask reference broke.')
    for (const timeline of before.timelines) for (const track of timeline.tracks.filter(track => Object.keys(map).some(id => track.target.startsWith(`layers.${id}.`)))) {
      const copied = after.timelines.find(item => item.id === timeline.id)!.tracks.find(item => item.target === track.target.replace(/^layers\.([^.]+)\./, (_all, id: string) => `layers.${map[id]}.`))
      assert(copied, 'A source timeline track was dropped.'); assert(copied.keyframes.length === track.keyframes.length, 'Copied key count changed.')
      copied.keyframes.forEach((key, i) => { assert(key.id !== track.keyframes[i].id, 'Copied key reused a source UUID.'); equal(key.easing, track.keyframes[i].easing, 'Copied easing changed.'); close(key.timeMs, track.keyframes[i].timeMs, 'Copied key timing changed.') })
    }
    const outline = preview.find(item => item.rootId === 'assembly' && item.occurrenceIndex === index + 1)
    assert(outline, 'Missing bounded preview outline.'); const root = after.layers.find(layer => layer.id === map.assembly)!, bounds = resolveLayerWorldBounds(root, after, 500)
    assert(bounds, 'Applied root has no editable bounds.'); close(Math.min(...outline.points.map(p => p.x)), bounds.x, 'Preview/Apply bounds X'); close(Math.min(...outline.points.map(p => p.y)), bounds.y, 'Preview/Apply bounds Y')
  })
  const ids = command.result.createdLayerIds.slice(); flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Array undo did not restore exact source.'); assert(!live().editor.canUndo, 'Array created multiple history steps.')
  flushSync(() => live().editor.redo()); equal(live().editor.getScene(), after, 'Array redo changed source/IDs.')
  record('Linear multi-root array preserves hierarchy, all timelines, references and preview placement', { newOccurrences: 2, createdIds: ids, oneUndo: true })
  const resources = new OutputResources(), lease = await acquirePortableScene(after, { resources })
  try { const loaded = JSON.parse(JSON.stringify(lease.value)) as ChronoScene; equal(loaded.layers, after.layers, 'Portable hierarchy changed.'); for (const map of command.idMaps) for (const ms of [0, 500, 1000]) equal(anchor(loaded, map.assembly, ms), anchor(after, map.assembly, ms), 'Portable copied animation changed.') }
  finally { lease.release(); resources.dispose() }
  record('Portable save/load retains array source, references and evaluated motion', { createdLayers: ids.length })
}

/** Pattern tabs exercise actual settings fields and Apply plans. Each one uses
 * safe uniform parent matrices so unsupported shear is not disguised as a pass. */
async function patternChecks(mount: (source?: Fixture) => Promise<void>) {
  for (const pattern of ['Grid', 'Radial', 'Path'] as const) {
    await mount(); const before = structuredClone(live().editor.getScene()); await click('Open Array'); await click(`Array ${pattern}`)
    if (pattern === 'Grid') { await value('Array Columns', 2); await value('Array Rows', 2); await value('Array Column move X', 80); await value('Array Row move Y', 90) }
    else { await value('Array Count', 3); if (pattern === 'Radial') { await value('Array Center X', 550); await value('Array Center Y', 350); await value('Array Radius', 120) } }
    const plan = live().array.plan; assert(plan, `${pattern} plan unavailable: ${live().array.error}`)
    equal(live().editor.getScene(), before, `${pattern} preview mutated source.`); await click('Apply array')
    const after = live().editor.getScene(), command = plan.buildCommand(); originalsIntact(after, before)
    assert(command.idMaps.length === plan.summary.newOccurrences, `${pattern} count/sourcePolicy mismatch.`)
    assert(command.result.createdLayerIds.every(id => after.layers.some(layer => layer.id === id)), `${pattern} missed an applied source.`)
    flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, `${pattern} undo incomplete.`)
    record(`${pattern} uses the real modal and applies one prepared forest command`, { summary: plan.summary, oneUndo: true })
  }
}

/** Parent/local selectors use their real reference matrices rather than a
 * world-label fallback. Different source roots receive the same world delta. */
async function spaceChecks(mount: (source?: Fixture) => Promise<void>) {
  for (const space of ['parent', 'local'] as const) {
    const source = fixture(true), root = source.scene.layers.find(layer => layer.id === 'assembly')!
    root.transform = { ...root.transform, rotationDeg: 15, scaleX: 0.9, scaleY: 1.3 }
    await mount(source); const before = structuredClone(live().editor.getScene()); await click('Open Array')
    await value('Array Count', 2); await value('Array Space', space); await value('Array Move X', 40); await value('Array Move Y', 10)
    const plan = live().array.plan; assert(plan, `${space} preview failed: ${live().array.error}`)
    const frameLayer = before.layers.find(layer => layer.id === (space === 'parent' ? 'parent' : 'assembly'))!
    const expected = resolveLayerWorldMatrix(frameLayer, before, 500).applyToVector({ x: 40, y: 10 })
    await click('Apply array'); const after = live().editor.getScene(), map = plan.buildCommand().idMaps[0]
    for (const id of ['assembly', 'badge']) { const start = anchor(before, id), end = anchor(after, map[id])
      close(end.x - start.x, expected.x, `${space} reference X`); close(end.y - start.y, expected.y, `${space} reference Y`) }
    originalsIntact(after, before); flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, `${space} undo incomplete.`)
    record(`${space} coordinate selector transforms the whole forest in the active reference axes`, { worldDelta: expected })
  }
}

/** Real viewport draft handles and numeric controls must share the same state.
 * Pointer release is sampled synchronously; cancel never leaves an editor edit. */
async function handleCheck(mount: (source?: Fixture) => Promise<void>) {
  await mount(); const before = structuredClone(live().editor.getScene()); await click('Open Array'); await value('Array Count', 2); await value('Array Move X', 80); await value('Array Move Y', 0)
  const handle = document.querySelector('[data-array-handle="step"]'), canvas = host.querySelector('canvas')
  assert(handle && canvas, 'Missing native array move handle/canvas.'); const rect = handle.getBoundingClientRect(), canvasRect = canvas.getBoundingClientRect()
  const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  const end = { x: start.x + 20 * canvasRect.width / 1100, y: start.y + 15 * canvasRect.height / 700 }
  const emit = (target: EventTarget, type: string, point: Point) => flushSync(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
    pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y })))
  emit(handle, 'pointerdown', start); emit(window, 'pointermove', end); emit(window, 'pointerup', end); await frames()
  const settings = live().array.settings; assert(settings.pattern === 'linear', 'Handle changed pattern.'); close(settings.move.x, 100, 'Handle/numeric Move X'); close(settings.move.y, 15, 'Handle/numeric Move Y')
  close(Number((control('Array Move X') as HTMLInputElement).value), 100, 'Visible Move X field'); equal(live().editor.getScene(), before, 'Handle drag changed source.'); assert(!live().editor.canUndo, 'Handle preview created history.')
  const plan = live().array.plan; assert(plan, 'Handle did not rebuild a valid bounded plan.'); await click('Apply array'); const after = live().editor.getScene(), map = plan.buildCommand().idMaps[0]
  const source = anchor(before, 'assembly'), copy = anchor(after, map.assembly); close(copy.x - source.x, 100, 'Handle Apply X'); close(copy.y - source.y, 15, 'Handle Apply Y')
  flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Handle Apply undo incomplete.')
  record('Viewport move handle updates numeric settings and applies the same preview in one undo', { worldDelta: { x: 100, y: 15 } })
}

/** Time offsets preserve the records and shift all timeline-owned keys together;
 * their animation is never copied into only the currently selected timeline. */
async function timingCheck(mount: (source?: Fixture) => Promise<void>) {
  await mount(); const before = structuredClone(live().editor.getScene()); await click('Open Array'); await value('Array Count', 3)
  await value('Array Time offset per occurrence ms', 50)
  const plan = live().array.plan; assert(plan, `Time offset preview failed: ${live().array.error}`); await click('Apply array')
  const after = live().editor.getScene(), maps = plan.buildCommand().idMaps
  maps.forEach((map, index) => before.timelines.forEach(timeline => timeline.tracks.forEach(track => {
    const sourceId = Object.keys(map).find(id => track.target.startsWith(`layers.${id}.`)); if (!sourceId) return
    const target = track.target.replace(`layers.${sourceId}.`, `layers.${map[sourceId]}.`)
    const copied = after.timelines.find(item => item.id === timeline.id)!.tracks.find(item => item.target === target)
    assert(copied, 'A time-offset copy lost a timeline track.'); copied.keyframes.forEach((key, i) => {
      close(key.timeMs, track.keyframes[i].timeMs + (index + 1) * 50, 'Occurrence time offset'); equal(key.easing, track.keyframes[i].easing, 'Time offset changed easing.') })
  })))
  originalsIntact(after, before); flushSync(() => live().editor.undo()); equal(live().editor.getScene(), before, 'Time offset undo incomplete.')
  record('Time offset shifts every relevant timeline without rewriting source keys', { perOccurrenceMs: 50, occurrences: maps.length })
}

/** Cancel/Escape and manual-source conflict operate on the real adapter; no
 * transient preview data is admitted to scene or undo history. */
async function cancellationChecks(mount: (source?: Fixture) => Promise<void>) {
  for (const mode of ['Cancel', 'Escape']) {
    await mount(); const before = structuredClone(live().editor.getScene()); await click('Open Array'); await value('Array Count', 4)
    if (mode === 'Cancel') await click('Cancel array')
    else { const dialog = document.querySelector('[role="dialog"]'); assert(dialog, 'Missing accessible Array dialog.'); flushSync(() => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))); await frames() }
    assert(!live().array.active, `${mode} left array session open.`); equal(live().editor.getScene(), before, `${mode} changed source.`); assert(!live().editor.canUndo, `${mode} created history.`)
    record(`${mode} clears preview without source/history changes`, { unchanged: true })
  }
  await mount(); await click('Open Array'); await click('Manual source edit'); const afterManual = structuredClone(live().editor.getScene())
  assert(!live().array.plan && live().array.error, 'Manual source edit did not invalidate the prepared preview.')
  assert((control('Apply array') as HTMLButtonElement).disabled, 'Stale array Apply remained enabled.'); await click('Apply array'); equal(live().editor.getScene(), afterManual, 'Stale Apply overwrote manual edit.')
  record('Manual source edit invalidates preview and refuses stale Apply', { diagnostic: live().array.error })
}

/** Large valid counts retain only a bounded outline preview. Invalid count and
 * timing remain reviewable in the open dialog and cannot modify scene/history. */
async function boundedInvalidChecks(mount: (source?: Fixture) => Promise<void>) {
  await mount(); const before = structuredClone(live().editor.getScene()); await click('Open Array'); await value('Array Count', 600)
  const plan = live().array.plan; assert(plan, `Bounded preview unexpectedly failed: ${live().array.error}`)
  assert(plan.preview.truncated && plan.preview.outlines.length <= 256, 'Large array preview was not bounded.')
  equal(live().editor.getScene(), before, 'Large preview allocated real source clones.'); assert(!live().editor.canUndo, 'Large preview created history.')
  record('Large multi-root preview stays bounded and leaves source/history unchanged', { outlines: plan.preview.outlines.length, total: plan.summary.totalOccurrences })
  await value('Array Count', 0); assert(live().array.active && !live().array.plan, 'Invalid count closed dialog or created a plan.')
  assert((control('Apply array') as HTMLButtonElement).disabled, 'Invalid count enabled Apply.'); await value('Array Count', 3)
  await value('Array Time offset per occurrence ms', 4000); assert(live().array.active && !live().array.plan, 'Invalid timing silently clipped or closed dialog.')
  equal(live().editor.getScene(), before, 'Invalid settings changed scene.'); record('Invalid count/time settings keep dialog open and disable Apply', { diagnostic: live().array.error })
  await mount(fixture(true)); const shearSource = structuredClone(live().editor.getScene()); await click('Open Array'); await value('Array Rotation degrees', 30)
  assert(live().array.active && !live().array.plan && /shear/i.test(live().array.error), 'Unrepresentable shear was silently approximated.')
  equal(live().editor.getScene(), shearSource, 'Unsupported transform changed source.'); record('Unsupported parent shear stays diagnostic and cannot Apply', { diagnostic: live().array.error })
}

/** The public isolated runner retains actual panels and visible JSON on failure.
 * It prepares no server, connected scene, browser overrides or app route. */
async function main() {
  document.body.innerHTML = '<style>body{margin:16px;background:#0f172a;color:#e2e8f0;font:14px system-ui}button{padding:7px 11px;background:#1d4ed8;color:white;border:1px solid #64748b;border-radius:5px}button:disabled{opacity:.4}#array-host{width:1180px;max-width:100%;border:1px solid #475569;display:flex;flex-direction:column}pre{white-space:pre-wrap;overflow-wrap:anywhere}#checks{color:#86efac}</style><h1>Multi-selection Array native acceptance</h1><p>Actual ArrayModal + production authoring adapter + SceneCanvas/history · isolated inline sources · connected documents unchanged</p><button id="run-arrays">Run array checks</button><button id="inspect">Open editable fixture</button><p id="status">Ready</p><pre id="checks"></pre><section id="array-host"></section><pre id="report">No checks run.</pre>'
  host = document.getElementById('array-host')!; const root = createRoot(host); let generation = 0
  const run = document.getElementById('run-arrays') as HTMLButtonElement, inspect = document.getElementById('inspect') as HTMLButtonElement
  const mount = async (source = fixture()) => { runtime = undefined; flushSync(() => root.render(<Subject key={++generation} fixture={source} />)); await frames(4); assert(!live().snap, 'Fixture snap did not disable.') }
  inspect.onclick = async () => { await mount(); await click('Open Array') }
  run.onclick = async () => { run.disabled = inspect.disabled = true; checks.length = 0; document.getElementById('checks')!.textContent = ''; const started = performance.now(); let manifest: unknown
    try { document.getElementById('status')!.textContent = 'Running actual Array controls…'; const metadata = await (await fetch('array-interactions-sources.json')).json(); manifest = { sourceManifest: 'array-interactions-sources.json', bundleSha256: metadata.bundleSha256, sourceFiles: metadata.sources.length }
      await linearApply(mount); await patternChecks(mount); await spaceChecks(mount); await handleCheck(mount); await timingCheck(mount); await cancellationChecks(mount); await boundedInvalidChecks(mount)
      document.getElementById('status')!.textContent = `PASS · ${checks.length} checks`; document.getElementById('report')!.textContent = JSON.stringify({ passed: true, checks, manifest, elapsedMs: performance.now() - started, dpr: devicePixelRatio, userAgent: navigator.userAgent, scope: 'Native DOM controls through real ArrayModal, SceneCanvas and production authoring adapter; no user document.' }, null, 2)
    } catch (error) { document.getElementById('status')!.textContent = 'FAIL'; document.getElementById('report')!.textContent = JSON.stringify({ passed: false, error: String(error), checks, manifest }, null, 2) }
    finally { run.disabled = inspect.disabled = false }
  }
}
void main().catch(error => { document.body.textContent = `Array acceptance setup failed: ${String(error)}` })
