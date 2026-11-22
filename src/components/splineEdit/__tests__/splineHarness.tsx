import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useSplineDrawingPreferences } from '../useSplineDrawingPreferences'
import type { SplinePrimitiveKind } from '@/lib/types/spline'
import type { SplineDrawResult } from '../drawing/drawingCommand'
import SceneCanvas from '@/components/SceneCanvas'
import SceneExplorerPanel from '@/components/sceneExplorer/SceneExplorerPanel'
import { useSplineAttachPicking } from '../useSplineAttachPicking'
import { SplineLineDrawingControls } from '../SplineAutoCloseControl'
import GeometryEditPanel from '@/components/editorGeometry/GeometryEditPanel'
import { SplinePaintControls } from '@/components/paint/SplinePaintControls'
import { SplineModeControls } from '../SplineModeControls'
import { SplineEditInspector } from '../SplineEditInspector'
import { useSplineOutline } from '../outline/useSplineOutline'
import { useSplineEditSelection, type SplineEditController } from '../useSplineEditSelection'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useGeometryEditMode, type GeometryEditMode } from '@/components/editorGeometry/useGeometryEditMode'
import { useToolMode } from '@/app/hooks/useToolMode'
import ToolGroup, { type ToolMode } from '@/components/TopToolbar/ToolGroup'
import { useKeyboard } from '@/app/hooks/useKeyboard'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '@/lib/defaults'
import { createRectangleSpline, createDonutSpline, mergeSplineData, translateSplineData } from '@/lib/spline'
import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { makeUpdateLayerCmd, makeDeleteLayerCmd } from '@/lib/editor/commands-layer'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { acquireRasterImage } from '@/lib/export/raster/RasterExportEngine'
import type { ChronoScene } from '@/lib/types'

/** Private two-SubShape scene with animated, non-uniformly scaled/rotated parent. */
function fixture(keyed = false): ChronoScene {
  const scene = emptyScene(), parent = { ...newRectLayer(), id: 'parent', name: 'Animated parent', type: 'group' as const }
  parent.transform = { ...parent.transform, x: 250, y: 180, rotationDeg: 23, scaleX: 1.15, scaleY: .85, anchorX: 0, anchorY: 0 }
  const data = mergeSplineData(translateSplineData(createRectangleSpline({ width: 100, height: 80 }), -110, 0), translateSplineData(createDonutSpline({ outerRadius: 65, innerRadius: 30 }), 95, 0))
  Object.values(data.subShapes).forEach((object, index) => { object.name = index === 0 ? 'Rectangle A' : 'Donut B' })
  const layer = { ...newSplineLayerFromData(data, { name: 'Compound spline', x: 0, y: 0 }), id: 'spline', parentId: parent.id }
  layer.style = { fill: { type: 'solid', color: '#38bdf8' }, stroke: { color: '#f8fafc', width: 2 } }
  scene.layers = [parent, layer]; scene.composition = { ...scene.composition, width: 640, height: 420, durationMs: 1000, backgroundColor: '#172033' }
  scene.timelines = [{ id: 'main', durationMs: 1000, loop: false, autoplay: false, tracks: [
    { target: 'layers.parent.transform.x', keyframes: [{ id: 'manual-parent-a', timeMs: 0, value: 250, easing: { type: 'linear' } }, { id: 'manual-parent-b', timeMs: 1000, value: 330, easing: { type: 'easeOut' } }] },
  ] }]
  if (keyed) scene.timelines[0].tracks.push({ target: `layers.spline.spline.points.${Object.keys(data.points)[0]}.x`, keyframes: [
    { id: 'manual-point', timeMs: 0, value: Object.values(data.points)[0].x + 20, easing: { type: 'linear' } },
  ] })
  return scene
}
interface Live { geometryEdit: GeometryEditMode; editor: EditorStateReturn; controller: SplineEditController; selected: string | null; select(id: string | null): void; time: number; setTime(value: number): void; setTool(value: string): void; reset(keyed?: boolean): void }
let live: Live | undefined
function Subject({ explorer = false }: { explorer?: boolean } = {}) {
  const [initial] = useState(fixture), editor = useEditorState(initial), snap = useSnapSettings({ persist: false })
  const [drawKind, setDrawKind] = useState<SplinePrimitiveKind | null>(null), [endpoint, setEndpoint] = useState<string | null>(null), [result, setResult] = useState<SplineDrawResult | null>(null)
  const preferences = useSplineDrawingPreferences()
  const [selected, setSelected] = useState<string | null>('spline'), [time, setTime] = useState(0)
  const tools = useToolMode(), tool = tools.mode, setTool = (value: string) => tools.setMode(value as ToolMode)
  const layer = editor.scene.layers.find(item => item.id === selected) ?? null, controller = useSplineEditSelection(layer, editor.getDocumentSignal())
  const geometryEdit = useGeometryEditMode(layer, controller, editor.getDocumentSignal())
  const frame = useMemo(() => evaluateSceneFrame(editor.scene, time), [editor.scene, time])
  const [attachWarning, setAttachWarning] = useState('')
  const attachPick = useSplineAttachPicking({ layer, controller, getScene: editor.getScene,
    dispatch: editor.dispatchCommand, timeMs: time, overrides: frame.overrides, onSelectLayer: setSelected,
    isTransactionActive: editor.isTransactionActive, warning: setAttachWarning })
  const outline = useSplineOutline({ scene: editor.scene, controller, timeMs: time, overrides: frame.overrides, documentSignal: editor.getDocumentSignal(),
    disabled: tool === 'spline-draw', getScene: editor.getScene, dispatch: editor.dispatchCommand, isTransactionActive: editor.isTransactionActive })
  useEffect(() => { if (result) { controller.enter(result.mode, result.ids); setResult(null) } }, [result, controller.enter])
  const arm = (kind: SplinePrimitiveKind, endpointId?: string) => { setDrawKind(kind); setEndpoint(endpointId ?? null); setTool('spline-draw') }
  const reset = (keyed = false) => { editor.resetScene(fixture(keyed)); setSelected('spline'); setTime(0); setTool('select'); tools.setTransformSpace('scene'); setDrawKind(null); setEndpoint(null) }
  useLayoutEffect(() => { live = { geometryEdit, editor, controller, selected, select: setSelected, time, setTime, setTool, reset } })
  useKeyboard({ onUndo: editor.undo, onRedo: editor.redo, onPlayToggle: () => {}, onStepBack: () => {}, onStepForward: () => {}, onDuplicateSelected: () => {},
    onGeometryEditMode: mode => { if (geometryEdit.enter(mode)) setTool('select') }, onClearSelection: () => setSelected(null), onDeleteSelected: () => { if (layer) editor.dispatchCommand(makeDeleteLayerCmd(layer)) }, getContext: () => 'canvas', isTransactionActive: editor.isTransactionActive,
    onNudgeSelected: (x, y) => { if (layer) editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { transform: { ...layer.transform, x: layer.transform.x + x, y: layer.transform.y + y } }, layer)) } })
  return <><nav className="flex gap-2"><button onClick={() => reset()}>Reset private scene</button><button onClick={() => setSelected('parent')}>Select parent</button><button onClick={() => setSelected('spline')}>Select spline</button><button onClick={() => { setSelected(null); controller.exit(); arm('line') }}>Draw new line</button><button onClick={editor.undo}>Undo</button><button onClick={editor.redo}>Redo</button></nav>
    <div className="overflow-x-auto"><ToolGroup mode={tool} onChange={tools.chooseTool} transformSpace={tools.transformSpace} onTransformSpaceChange={tools.setTransformSpace} /></div>
    <div className="flex border border-gray-600 h-[650px]">
      {explorer && <section aria-label="Scene Explorer" className="w-[250px] shrink-0 flex flex-col">
        {attachWarning && <p role="alert">{attachWarning}</p>}
        <SceneExplorerPanel layers={editor.scene.layers} timeline={editor.scene.timelines[0] ?? null}
          selectedId={selected} selectedIds={new Set(selected ? [selected] : [])}
          onSelect={setSelected} onSelectLayers={(ids, primary) => setSelected(primary ?? ids[0] ?? null)} onPickLayer={attachPick}
          onRename={() => {}} onToggleFlag={() => {}} onMoveInTree={() => {}} />
      </section>}
      <SceneCanvas scene={editor.scene} editor={editor} assets={new Map()} snap={snap} selectedLayerId={selected} outlinePreview={outline.result}
      selectedLayerIds={new Set(selected ? [selected] : [])} onSelectLayer={setSelected} onSelectByGeometry={ids => setSelected(Array.from(ids)[0] ?? null)}
      timeMs={time} overrides={frame.overrides} isPlaying={false} previewMode={false} geometryEditActive={layer?.type === 'mesh2d' && geometryEdit.active} geometryEditMode={geometryEdit.mode} onExitGeometryEdit={geometryEdit.exit} toolMode={tool} transformSpace={tools.transformSpace} panMode={tool === 'pan'} splineEdit={controller}
      splineDrawKind={drawKind} splineAppendTargetId={selected} splineContinuationPointId={endpoint} splineAutoClose={preferences.autoClose}
      onDrawSplineLine={(_, point) => arm('line', point)} onSplineDrawCommit={next => { setDrawKind(null); setEndpoint(null); setTool('select'); if (next) setResult(next) }}
      selectedTimeline={editor.scene.timelines[0]} getShortcutContext={() => 'canvas'} />
      <aside className="w-[360px] shrink-0 overflow-auto">{tool === 'spline-draw' && drawKind === 'line' && <SplineLineDrawingControls autoClose={preferences.autoClose} onAutoClose={preferences.setAutoClose} />}
        <GeometryEditPanel editMode={layer?.type === 'mesh2d' ? geometryEdit : undefined} layer={layer} selectedIds={selected ? [selected] : []} selectedPointId={controller.mode === 'point' ? controller.ids[0] ?? null : null}
          getScene={editor.getScene} getRevision={editor.getRevision} getDocumentSignal={editor.getDocumentSignal} isTransactionActive={editor.isTransactionActive}
          dispatchCommand={editor.dispatchCommand} onSelectLayer={setSelected} onClearPoint={controller.clear}
          onLayerChange={next => { if (layer) editor.dispatchCommand(makeUpdateLayerCmd(next.id, next, layer)) }}
          splineModeControls={<SplineModeControls controller={controller} />}
          splineSourceSettings={layer?.spline ? (<SplineEditInspector modeControls={false} modifierControls={false} layer={layer} controller={controller} getScene={editor.getScene} dispatchCommand={editor.dispatchCommand} overrides={frame.overrides} timeMs={time} onSelectLayer={setSelected} isTransactionActive={editor.isTransactionActive} drawingLine={tool === 'spline-draw' && drawKind === 'line'} autoClose={preferences.autoClose} onAutoClose={preferences.setAutoClose} onDraw={arm} onBeginAttach={() => { setDrawKind(null); setEndpoint(null); setTool('select') }} outline={outline} />) : undefined} />
        {layer?.spline && <section aria-label="Properties appearance"><SplinePaintControls closed={Object.values(layer.spline!.contours).every(contour => contour.closed)} style={layer.style ?? {}}
          assets={editor.scene.assets} onChange={style => editor.dispatchCommand(makeUpdateLayerCmd(layer.id, { style }, layer))} /></section>}
      </aside>
    </div><output id="selection-state">{JSON.stringify({ active: controller.active, mode: controller.mode, ids: controller.ids, layer: selected })}</output></>
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
function equal(a: unknown, b: unknown, message: string) { assert(JSON.stringify(a) === JSON.stringify(b), message) }
function current() { assert(live, 'No production subject'); return live }
async function frames(n = 3) { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame) }
function layer() { return current().editor.getScene().layers.find(item => item.id === 'spline')! }
function canvas() { const el = document.querySelector<HTMLCanvasElement>('#host canvas'); assert(el, 'No viewport canvas'); return el }
/** Independent world/DOM mapping; source positions are converted by the shared affine contract. */
function world(point: { x: number; y: number }) { const scene = current().editor.getScene(); return resolveLayerWorldMatrix(layer(), scene, current().time).applyToPoint(point) }
function client(point: { x: number; y: number }) { const cv = canvas(), rect = cv.getBoundingClientRect(); return { x: rect.left + point.x * rect.width / cv.width, y: rect.top + point.y * rect.height / cv.height } }
function pointer(target: EventTarget, type: string, point: { x: number; y: number }, modifiers: Partial<PointerEventInit> = {}) {
  flushSync(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 71, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: point.x, clientY: point.y, ...modifiers })))
}
async function tap(point: { x: number; y: number }, modifiers = {}) { const pos = client(world(point)); pointer(canvas(), 'pointerdown', pos, modifiers); await frames(); pointer(window, 'pointerup', pos, modifiers); await frames() }
async function drag(from: { x: number; y: number }, to: { x: number; y: number }) { pointer(canvas(), 'pointerdown', client(world(from))); await frames(); pointer(window, 'pointermove', client(world(to))); await frames(); pointer(window, 'pointerup', client(world(to))); await frames() }
async function click(label: string) { const el = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(item => item.getAttribute('aria-label') === label || item.textContent?.trim() === label); assert(el, `Missing ${label}`); flushSync(() => el.click()); await frames() }
/** Activate an actual virtualized Explorer row before its list selection path. */
async function pickExplorerRow(id: string, modifiers: MouseEventInit = {}, keyboard = false) {
  const row = document.querySelector(`[aria-label="Scene Explorer"] [data-virtual-row="${id}"]`)
  assert(row, `Missing Scene Explorer row ${id}`)
  flushSync(() => row.dispatchEvent(keyboard
    ? new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    : new MouseEvent('click', { bubbles: true, ...modifiers })))
  await frames()
}
/** Toggle the real controlled Spline Vertices setting without mutating source. */
async function setSplineVertexSnapping(checked: boolean) {
  const trigger = document.querySelector<HTMLButtonElement>('button[title="Snap settings"]')!
  flushSync(() => trigger.click()); await frames()
  const checkbox = document.querySelector<HTMLInputElement>('[aria-label="Snap to Spline Vertices"]')
  assert(checkbox, 'Vertex snap control is missing')
  if (checkbox.checked !== checked) { flushSync(() => checkbox.click()); await frames() }
  await click('Close Snap settings')
}
/** Drive native select events, preserving the production controlled-input path. */
async function choose(label: string, value: string) { const el = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`); assert(el, `Missing ${label}`); flushSync(() => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })) }); await frames() }
function key(name: string, modifiers = {}) { flushSync(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...modifiers }))) }
/** Native context-menu event and menu-owned Escape. */
async function contextAt(point: { x: number; y: number }) {
  const pos = client(world(point)); flushSync(() => canvas().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: pos.x, clientY: pos.y }))); await frames()
}
async function reset(keyed = false) { flushSync(() => current().reset(keyed)); await frames() }
/** Decode final output so editor overlays cannot masquerade as source rendering. */
async function raster() { const scene = current().editor.getScene(), output = await acquireRasterImage(scene, new Map(), { format: 'png', timeMs: current().time }); const cv = document.createElement('canvas')
  try { const bitmap = await createImageBitmap(output.value.blob); try { cv.width = bitmap.width; cv.height = bitmap.height; const ctx = cv.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); return ctx.getImageData(0, 0, cv.width, cv.height).data } finally { bitmap.close() } }
  finally { output.release(); cv.width = cv.height = 0 } }

export { Subject, fixture, current, frames, layer, canvas, world, client, pointer, tap, drag, click, key, choose, reset, raster, assert, equal, contextAt, pickExplorerRow, setSplineVertexSnapping }
