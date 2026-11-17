import { emptyModelSceneDocument } from '../source/emptyModelScene'
import { contentInstance } from '../content/modelContent'
import { addPrimitive, removePrimitive, PRIMITIVE_SELECTION_INSTANCE } from '../modeling/poly/primitiveSource'
import { releaseImportSources } from '@/lib/import/resources/importSources'
import { interactionTrace } from '@/components/canvas/interactions/diagnostics'
import { useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SceneCanvas from '@/components/SceneCanvas'
import PropertiesPanel from '@/components/PropertiesPanel'
import LayerPanel from '@/components/LayerPanel'
import TimelinePanel from '@/components/TimelinePanel'
import { DEFAULT_TIMELINE_SETTINGS, DEFAULT_TIMELINE_GHOST_SETTINGS } from '@/lib/types/editor'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { newModelLayer } from '../source/modelDefaults'
import { triangleDocument } from './fixtures'
import { ModelHandler } from '@/lib/import/handlers/asset/ModelHandler'
import { ImportTransactionBuilder } from '@/lib/import/ImportTransactionBuilder'
import { withMediaFrame } from '@/lib/render/media/withMediaFrame'
import { CanvasRenderer } from '@/lib/render/CanvasRenderer'
import { acquirePortableScene } from '@/lib/export/portable/PortableSceneOutput'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { VisualMediaSession } from '@/lib/render/media/VisualMediaSession'
import { glbBytes } from './fixtures'
import { modelAssetService } from '../resources/ModelAssetService'
import type { AssetElementMap } from '@/lib/asset/visual/AssetElementMap'
import '@/lib/registry/bootstrap'

/** Actual editor/Properties/renderer host. No connection to the user's editor,
 * saved session or history; source fixtures have embedded bytes only. */
let editor: EditorStateReturn
const initial = emptyScene()
initial.composition = { ...initial.composition, width: 640, height: 480, durationMs: 1000 }
const background = newRectLayer(); background.id = 'background'; background.size = { width: 640, height: 480 }; background.transform.x = background.transform.y = 0
background.style!.fill = { type: 'solid', color: '#22c55e' }
const model = newModelLayer('test-model', 'test-model-asset'); model.transform.x = 100; model.transform.y = 40
initial.layers = [background, model]
initial.timelines = [{ ...newTimeline(), id: 'active', durationMs: 1000, layerIds: ['test-model'], tracks: [] }]
initial.assets = [{ id: 'test-model-asset', type: 'model3d', name: 'Test triangle.gltf', url: `data:model/gltf+json;base64,${btoa(JSON.stringify(triangleDocument()))}` }]
const status = document.getElementById('status')!
interactionTrace.setEnabled(true)
function Host() {
  const trace = useSyncExternalStore(interactionTrace.subscribe, interactionTrace.getSnapshot)
  const state = useEditorState(initial), assets = useAssetCache(state.scene.assets, { managed: true }), snap = useSnapSettings({ persist: false })
  const [selected, select] = useState<string | null>('test-model'), ids = useMemo(() => new Set(selected ? [selected] : []), [selected])
  const [timelineSettings, setTimelineSettings] = useState(DEFAULT_TIMELINE_SETTINGS), [keySelection, setKeySelection] = useState(new Set<string>()), [time, setTime] = useState(0)
  const noop = () => {}
  useLayoutEffect(() => { editor = state; (window as any).modelTest = { editor: state, assets, selected } })
  const importModel = async (file: File) => {
    const result = await new ModelHandler().handle(file)
    state.dispatchCommand(new ImportTransactionBuilder().build(result))
    select(result.layers[0].id)
  }
  return <><div className="flex bg-gray-900 text-gray-100" style={{ minWidth: 1200, height: 600 }}>
    <div className="w-64 shrink-0"><LayerPanel layers={state.scene.layers} selectedId={selected} selectedIds={ids} onSelect={id => select(id)}
      onAdd={() => {}} onAddImage={() => {}} onAddVideo={() => {}} onAddAudio={() => {}}
      onImportModel={file => void importModel(file).catch(error => { status.textContent = String(error) })}
      onDelete={() => {}} onReorder={() => {}} onToggleFlag={() => {}} onRename={() => {}} /></div>
    <div className="flex flex-col flex-1 min-w-0 min-h-0"><div className="flex flex-1 min-h-0"><SceneCanvas scene={state.scene} editor={state} assets={assets} snap={snap}
      selectedLayerId={selected} selectedLayerIds={ids} onSelectLayer={select} timeMs={time} toolMode="select" isPlaying={false} /></div><div className="shrink-0 overflow-auto" style={{ maxHeight: 120 }}>
      <output id="source-state" className="block text-xs break-all">{JSON.stringify({ layers: state.scene.layers.length, model: state.scene.layers.find(layer => layer.id === selected), tracks: state.scene.timelines[0].tracks, revision: state.getRevision() })}</output>
      <pre id="trace" className="hidden">{JSON.stringify(trace.records.slice(-8))}</pre>
      <button id="run" onClick={() => (window as any).runModelChecks().catch((error: Error) => { status.textContent = `FAILED: ${error.message}` })}>Run acceptance checks</button>
      <button id="camera-checks" onClick={() => (window as any).runCameraChecks().catch((error: Error) => { status.textContent = `FAILED: ${error.message}` })}>Run camera checks</button>
      <button id="box-checks" onClick={() => (window as any).runBoxChecks().catch((error: Error) => { status.textContent = `FAILED: ${error.message}` })}>Run box checks</button>
      <button id="robot-demo" onClick={() => void fetch('chorono-robot.glb').then(response => { if (!response.ok) throw new Error('Demo model could not be loaded.'); return response.blob() }).then(blob => importModel(new File([blob], 'Chorono robot.glb', { type: 'model/gltf-binary' }))).catch(error => { status.textContent = String(error) })}>Load robot demo</button>
      <button id="undo" onClick={state.undo}>Undo</button><button id="redo" onClick={state.redo}>Redo</button></div>
    </div>
    <div className="w-80 overflow-y-auto"><PropertiesPanel layer={state.scene.layers.find(layer => layer.id === selected) ?? null} scene={state.scene}
      composition={state.scene.composition} onLayerChange={layer => state.dispatchCommand({ label: 'Properties', execute: scene => ({ ...scene, layers: scene.layers.map(item => item.id === layer.id ? layer : item) }), undo: () => state.scene })}
      onCompositionChange={() => {}} /></div>
  </div><section className="bg-gray-900 text-gray-100" style={{ minWidth: 1200, height: 550 }} aria-label="Model 2D Timeline">
    <TimelinePanel scene={state.scene} editor={state} settings={timelineSettings} onSettingsChange={setTimelineSettings}
      selectedLayerId={selected} selectedLayerIds={ids} selectedTimelineId="active" selectedKfIds={keySelection} onSelectKeyframes={setKeySelection}
      currentTimeMs={time} isPlaying={false} playbackSpeed={1} onTimeChange={setTime} onPlayToggle={noop} onSelectTimeline={noop}
      onSelectLayer={select} onToggleLayerFlag={noop} onPlaybackSpeedChange={noop} ghostSettings={DEFAULT_TIMELINE_GHOST_SETTINGS}
      onGhostUpdate={noop} onGhostToggle={noop} onGhostPreset={noop} />
  </section></>
}
createRoot(document.getElementById('app')!).render(<Host />)
/** Public QA actions operate real commands/loader/renderers. Pixel output and
 * receipt are displayed for inspection; no fake prepared model is injected. */
;(window as any).runModelChecks = async () => {
  const checks: string[] = [], assert = (value: unknown, name: string) => { if (!value) throw new Error(name); checks.push(name) }
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480
  const context = canvas.getContext('2d')!, scene = editor.getScene()
  await withMediaFrame(scene, 0, context, {}, assets => new CanvasRenderer().render(context, scene, 0, null, assets, { renderMode: 'preview' }))
  const pixels = context.getImageData(0, 0, 640, 480).data
  let red = 0, green = 0
  for (let i = 0; i < pixels.length; i += 4) { if (pixels[i] > pixels[i+1] * 1.5 && pixels[i] > 80) red++; if (pixels[i+1] > pixels[i] * 1.5) green++ }
  assert(red > 1000, 'Real WebGL model pixels reach the final 2D compositor')
  assert(green > 10000, 'Transparent model surroundings preserve the 2D background')
  document.getElementById('output')?.replaceChildren(canvas)
  const empty = await new ModelHandler().handle(new File([JSON.stringify(emptyModelSceneDocument())], 'Empty 3D Scene.gltf', { type: 'model/gltf+json' }))
  assert(empty.layers[0].model3d?.version === 3 && !!empty.layers[0].model3d.content, 'Empty 3D scene creates editable content without a model file picker')
  const emptyPin = await modelAssetService.acquire(empty.assets[0]), trianglePin = await modelAssetService.acquire(scene.assets[0])
  const blank = document.createElement('canvas'); blank.width = blank.height = 128; const blankContext = blank.getContext('2d')!
  try {
    const preview = document.createElement('canvas'); preview.width = preview.height = 400
    const previewScene = emptyScene(); previewScene.composition = { ...previewScene.composition, width: 400, height: 400 }
    previewScene.layers = [empty.layers[0]]; previewScene.assets = empty.assets
    const previewAssets: AssetElementMap = new Map(); previewAssets.modelForAsset = id => id === empty.assets[0].id ? emptyPin.value : undefined
    new CanvasRenderer().render(preview.getContext('2d')!, previewScene, 0, empty.layers[0].id, previewAssets, { renderMode: 'editor' })
    document.getElementById('output')?.append(preview)
    const previewPixel = preview.getContext('2d')!.getImageData(200, 200, 1, 1).data
    assert(previewPixel[0] < 100 && previewPixel[1] < 100 && previewPixel[2] < 120, 'Empty 3D scene has a dark viewport card in the 2D editor')
    emptyPin.value.draw(blankContext, empty.layers[0].model3d!, 128, 128)
    assert(!blankContext.getImageData(0, 0, 128, 128).data.some((value, index) => index % 4 === 3 && value > 0), 'Real GPU render of an empty scene stays transparent')
    const primitive = addPrimitive(empty.layers[0].model3d!, emptyPin.value.inventory!, 'box', 'boxA')
    emptyPin.value.draw(blankContext, primitive, 128, 128)
    assert(blankContext.getImageData(0, 0, 128, 128).data.some((value, index) => index % 4 === 3 && value > 0), 'A procedural Box renders in the formerly empty scene')
    const view = { camera: { ...primitive.camera, projection: 'perspective' as const, orthoHeight: 2.8 } }
    const picked = emptyPin.value.inspector?.pick(primitive, 64, 64, 128, 128, view)
    assert(picked?.instanceId === PRIMITIVE_SELECTION_INSTANCE && picked.nodeId === 'boxA', 'Viewport ray picks a procedural Box by stable object ID')
    blankContext.clearRect(0, 0, 128, 128)
    emptyPin.value.draw(blankContext, removePrimitive(primitive, 'boxA'), 128, 128)
    assert(!blankContext.getImageData(0, 0, 128, 128).data.some((value, index) => index % 4 === 3 && value > 0), 'Removing the Box releases its rendered geometry')
    const assembly = structuredClone(empty.layers[0].model3d!)
    assembly.content!.instances.added = contentInstance(scene.assets[0].id, trianglePin.value.inventory!, 'Added triangle')
    emptyPin.value.draw(blankContext, assembly, 128, 128, id => id === scene.assets[0].id ? trianglePin.value : emptyPin.value)
    assert(blankContext.getImageData(0, 0, 128, 128).data.some((value, index) => index % 4 === 3 && value > 0), 'A model added later renders inside the formerly empty scene')
    const original = editor.getScene(); editor.dispatchCommand(new ImportTransactionBuilder().build(empty))
    const saved = await acquirePortableScene(editor.getScene())
    try { assert(parseSceneJson(JSON.stringify(saved.value), true).layers.some(layer => layer.id === empty.layers[0].id && layer.model3d?.version === 3), 'Empty scene survives portable save/open') } finally { saved.release() }
    editor.undo(); assert(editor.getScene() === original, 'One Undo restores the project after empty 3D scene creation')
  } finally { emptyPin.release(); trianglePin.release(); releaseImportSources(empty) }
  const file = new File([JSON.stringify(triangleDocument())], 'Triangle.gltf', { type: 'model/gltf+json' })
  const imported = await new ModelHandler().handle(file)
  const command = new ImportTransactionBuilder().build(imported)
  const source = editor.getScene(); editor.dispatchCommand(command)
  assert(editor.getScene().layers.length === source.layers.length + 1, 'Real GLTF import is one native command')
  const portable = await acquirePortableScene(editor.getScene())
  try {
    const loaded = parseSceneJson(JSON.stringify(portable.value), true)
    const modelAsset = loaded.assets.find(asset => asset.id === imported.assets[0].id)!
    assert(modelAsset.url.startsWith('data:') && !modelAsset.runtime, 'Portable save/open embeds actual model bytes and strips runtime handles')
    assert(loaded.layers.find(layer => layer.id === imported.layers[0].id)?.model3d?.assetId === modelAsset.id, 'Portable model source keeps stable asset references')
  } finally { portable.release() }
  editor.undo(); assert(editor.getScene().layers.length === source.layers.length, 'One Undo removes imported model'); releaseImportSources(imported)
  const glb = await new ModelHandler().handle(new File([glbBytes()], 'Triangle.glb', { type: 'model/gltf-binary' }))
  assert(glb.layers[0].type === 'model3d', 'Real GLB import uses the same native model layer')
  releaseImportSources(glb)
  const consumer = new VisualMediaSession(); consumer.start()
  consumer.setDemand([{ key: 'test-model-pin', asset: scene.assets[0], required: true }]); await consumer.ready()
  const borrowed = consumer.elements(); assert(!!borrowed.modelForAsset?.(scene.assets[0].id), 'Media snapshot exposes only a prepared model pin')
  consumer.stop(); assert(!borrowed.modelForAsset?.(scene.assets[0].id), 'Released media snapshot cannot draw stale model data')
  const textureCanvas = document.createElement('canvas'); textureCanvas.width = textureCanvas.height = 2
  const textureContext = textureCanvas.getContext('2d')!; textureContext.fillStyle = '#0088ff'; textureContext.fillRect(0, 0, 2, 2)
  const textured = triangleDocument(), vertexBytes = new Uint8Array(new Float32Array([-1,-1,0,1,-1,0,0,1,0,0,0,1,0,.5,1]).buffer)
  textured.buffers[0] = { uri: 'data:application/octet-stream;base64,' + btoa(Array.from(vertexBytes, byte => String.fromCharCode(byte)).join('')), byteLength: vertexBytes.length }
  textured.bufferViews.push({ buffer: 0, byteOffset: 36, byteLength: 24 }); textured.accessors.push({ bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' })
  textured.meshes[0].primitives[0].attributes.TEXCOORD_0 = 1
  textured.images = [{ uri: textureCanvas.toDataURL('image/png') }]; textured.textures = [{ source: 0 }]
  textured.materials[0].pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1]; textured.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 }
  const textureImport = await new ModelHandler().handle(new File([JSON.stringify(textured)], 'Texture.gltf', { type: 'model/gltf+json' }))
  const texturePin = await modelAssetService.acquire(textureImport.assets[0])
  try {
    const image = document.createElement('canvas'); image.width = image.height = 64
    texturePin.value.draw(image.getContext('2d')!, textureImport.layers[0].model3d!, 64, 64)
    const rgba = image.getContext('2d')!.getImageData(0, 0, 64, 64).data
    assert(Array.from({ length: rgba.length / 4 }, (_, i) => i * 4).some(i => rgba[i+2] > rgba[i+1] * 1.5 && rgba[i+3] > 0), 'Embedded PNG texture is decoded and reaches real WebGL pixels')
  } finally { texturePin.release(); releaseImportSources(textureImport) }
  modelAssetService.clearIdle()
  const accountingPin = await modelAssetService.acquire(scene.assets[0])
  try { assert(modelAssetService.getSnapshot().residency.chargedBytes > 0, 'Prepared geometry is charged while a consumer holds its pin') } finally { accountingPin.release() }
  ;(window as any).modelChecks = checks; status.textContent = checks.join('\n')
  return checks
}

/** Native DOM pointer events over the actual shared session; kept in the test
 * app so automation uses visible controls rather than mutating page internals. */
;(window as any).runCameraChecks = async () => {
  const checks: string[] = [], assert = (ok: unknown, label: string) => { if (!ok) throw new Error(label); checks.push(label) }
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const source = () => editor.getScene().layers.find(layer => layer.id === 'test-model')!
  const canvas = document.querySelector<HTMLCanvasElement>('#app canvas')!
  const toggle = () => document.querySelector<HTMLButtonElement>('[aria-label="3D camera controls"] button')!
  const drag = async (dx: number, dy: number) => {
    const r = canvas.getBoundingClientRect(), x = r.left + r.width * .45, y = r.top + r.height * .45
    const event = (type: string, px: number, py: number, buttons: number) => new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons, clientX: px, clientY: py, bubbles: true })
    flushSync(() => canvas.dispatchEvent(event('pointerdown', x, y, 1)))
    flushSync(() => window.dispatchEvent(event('pointermove', x + dx, y + dy, 1)))
    flushSync(() => window.dispatchEvent(event('pointerup', x + dx, y + dy, 0)))
    await frame()
  }
  if (toggle().getAttribute('aria-pressed') !== 'true') flushSync(() => toggle().click())
  await frame()
  for (const mode of ['orbit', 'pan', 'dolly']) {
    const select = document.querySelector<HTMLSelectElement>('[aria-label="3D camera movement"]')!
    flushSync(() => { select.value = mode; select.dispatchEvent(new Event('change', { bubbles: true })) }); await frame()
    const before = structuredClone(source())
    await drag(40, 20)
    assert(JSON.stringify(source().transform) === JSON.stringify(before.transform), `${mode} preserves 2D placement`)
    assert(JSON.stringify(source().model3d!.camera) !== JSON.stringify(before.model3d!.camera), `${mode} commits on the first pointer-up`)
    flushSync(() => editor.undo()); await frame()
    assert(JSON.stringify(source().model3d) === JSON.stringify(before.model3d), `${mode} is exactly one Undo`)
  }
  flushSync(() => toggle().click()); await frame()
  const before = structuredClone(source()); await drag(25, 15)
  assert(JSON.stringify(source().model3d) === JSON.stringify(before.model3d), 'Camera-off 2D dragging preserves all internal 3D settings')
  assert(source().transform.x !== before.transform.x || source().transform.y !== before.transform.y, 'Camera-off first drag moves the 2D layer')
  flushSync(() => editor.undo()); await frame()
  status.textContent = checks.join('\n'); return checks
}

/** Resize the actual selected model through native handle sessions. This checks
 * release/Undo/Redo and 3D source preservation, not just pure resize arithmetic. */
;(window as any).runBoxChecks = async () => {
  const checks: string[] = [], assert = (ok: unknown, label: string) => { if (!ok) throw new Error(label); checks.push(label) }
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const toggle = document.querySelector<HTMLButtonElement>('[aria-label="3D camera controls"] button')
  if (toggle?.getAttribute('aria-pressed') === 'true') { flushSync(() => toggle.click()); await frame() }
  const before = structuredClone(editor.getScene()), id = (window as any).modelTest.selected as string
  const original = before.layers.find(layer => layer.id === id)!
  const handle = document.querySelector<HTMLElement>('[data-testid="selection-frame"] [data-handle="se"]')
  assert(!!handle, 'Selected model has a visible resize handle with camera mode off')
  const rect = handle!.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
  const event = (type: string, dx: number, dy: number, buttons: number) => new PointerEvent(type, { pointerId: 9, pointerType: 'mouse', isPrimary: true, button: 0, buttons, clientX: x + dx, clientY: y + dy, bubbles: true })
  flushSync(() => handle!.dispatchEvent(event('pointerdown', 0, 0, 1)))
  flushSync(() => window.dispatchEvent(event('pointermove', 60, -30, 1)))
  flushSync(() => window.dispatchEvent(event('pointerup', 60, -30, 0))); await frame()
  const changed = editor.getScene().layers.find(layer => layer.id === id)!
  assert(changed.size!.width > original.size!.width && changed.size!.height < original.size!.height, 'First pointer-up commits independently editable width and height')
  assert(JSON.stringify(changed.model3d) === JSON.stringify(original.model3d), 'Box resize preserves internal model, camera and asset')
  assert(JSON.stringify(editor.getScene().timelines) === JSON.stringify(before.timelines), 'Box resize preserves existing animation tracks')
  flushSync(() => editor.undo()); await frame()
  assert(JSON.stringify(editor.getScene()) === JSON.stringify(before), 'One Undo restores the complete original scene')
  flushSync(() => editor.redo()); await frame()
  assert(JSON.stringify(editor.getScene().layers.find(layer => layer.id === id)!.size) === JSON.stringify(changed.size), 'Redo restores the resized model box')
  flushSync(() => editor.undo()); await frame()
  status.textContent = checks.join('\n'); return checks
}
