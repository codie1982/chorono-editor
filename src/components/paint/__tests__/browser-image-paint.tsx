import { checkSplinePaint } from './checkSplinePaint'
import { useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SceneCanvas from '@/components/SceneCanvas'
import PropertiesPanel from '@/components/PropertiesPanel'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useAssetCache } from '@/app/hooks/useAssetCache'
import { useSnapSettings } from '@/app/hooks/useSnapSettings'
import { useImport } from '@/app/hooks/useImport'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { acquireRasterImage } from '@/lib/export/raster/RasterExportEngine'
import { acquireSequence } from '@/lib/export/sequence/SequenceExportEngine'
import { acquireSceneText } from '@/lib/export/text/TextOutput'
import { acquirePortableScene } from '@/lib/export/portable'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { ZipReader } from '@/lib/import/zip/ZipReader'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'
import type { ChronoScene } from '@/lib/types'
import { assetSourcePool } from '@/lib/asset/sources'
import type { AssetElementMap } from '@/lib/asset/visual/AssetElementMap'

let live: { editor: EditorStateReturn; assets: AssetElementMap } | undefined
/** Private scene with existing human keys; no connected document or URL input. */
function fixture(): ChronoScene {
  const scene = emptyScene(), layer = newRectLayer()
  layer.id = 'hero'; layer.name = 'Paint test'; layer.size = { width: 120, height: 100 }; layer.transform = { ...layer.transform, x: 20, y: 20 }
  layer.style = { fill: { type: 'solid', color: '#ff0000' }, stroke: { color: '#ffffff', width: 6 } }
  scene.composition = { ...scene.composition, width: 320, height: 240, durationMs: 1000, frameRate: 2, backgroundFill: { type: 'none' } }
  scene.layers = [layer]; scene.timelines = [{ id: 'main', durationMs: 1000, autoplay: false, loop: false,
    tracks: [{ target: 'layers.hero.transform.x', keyframes: [{ id: 'human-start', timeMs: 0, value: 20, easing: { type: 'linear' } }, { id: 'human-end', timeMs: 1000, value: 120, easing: { type: 'easeOut' }, tangentMode: 'broken' }] }] }]
  return scene
}
function Host() {
  const editor = useEditorState(fixture()), assets = useAssetCache(editor.scene.assets, { managed: true }), snap = useSnapSettings({ persist: false })
  const [selected, setSelected] = useState<string | null>('hero')
  const imports = useImport({ dispatchCommand: editor.dispatchCommand, getScene: editor.getScene, getDocumentSignal: editor.getDocumentSignal })
  useLayoutEffect(() => { live = { editor, assets } })
  return <><nav className="flex gap-2"><button onClick={() => setSelected('hero')}>Edit shape</button><button onClick={() => setSelected(null)}>Edit background</button></nav>
    <div className="flex h-[620px] border border-gray-600"><SceneCanvas scene={editor.scene} editor={editor} assets={assets} snap={snap} selectedLayerId={selected}
      selectedLayerIds={new Set(selected ? [selected] : [])} onSelectLayer={setSelected} timeMs={0} isPlaying={false} previewMode={false} toolMode="select" />
      <aside className="w-80 shrink-0 overflow-auto"><PropertiesPanel layer={editor.scene.layers.find(layer => layer.id === selected) ?? null} scene={editor.scene} composition={editor.scene.composition}
        getScene={editor.getScene} isTransactionActive={editor.isTransactionActive} dispatchCommand={editor.dispatchCommand}
        onLayerChange={next => editor.dispatchCommand(makeUpdateLayerCmd(next.id, next, editor.getScene().layers.find(layer => layer.id === next.id)!))}
        onCompositionChange={next => editor.dispatchCommand({ label: 'Background', execute: source => ({ ...source, composition: next }), undo: () => editor.scene })}
        onImportPaintImage={(file, layerId) => { void imports.importPaintImage(file, layerId) }} /></aside></div></>
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
const equal = (a: unknown, b: unknown, message: string) => assert(JSON.stringify(a) === JSON.stringify(b), message)
async function frames(n = 3) { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame) }
async function until(test: () => boolean, message: string) { const deadline = performance.now() + 15000; while (!test() && performance.now() < deadline) await frames(1); assert(test(), message) }
async function select(label: string, value: string) { const field = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; assert(field, `Missing ${label}`); flushSync(() => { field.value = value; field.dispatchEvent(new Event('change', { bubbles: true })) }); await frames() }
async function number(label: string, value: string) { const field = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!; assert(field, `Missing ${label}`); flushSync(() => field.focus()); flushSync(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })) }); await frames(); flushSync(() => field.blur()); await frames() }
async function click(text: string) { const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === text)!; assert(button, `Missing ${text}`); flushSync(() => button.click()); await frames() }
/** Decode real output, rather than trusting the export options/source values. */
async function pixels(blob: Blob): Promise<{ bytes: Uint8ClampedArray; width: number }> {
  const canvas = document.createElement('canvas')
  if (blob.type === 'image/svg+xml') {
    const source = assetSourcePool.create(blob), image = new Image()
    try { image.src = source.url; await image.decode(); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); return { bytes: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width }
    } finally { image.src = ''; source.release(); canvas.width = canvas.height = 0 }
  }
  const bitmap = await createImageBitmap(blob); canvas.width = bitmap.width; canvas.height = bitmap.height
  try { const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); return { bytes: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width } }
  finally { bitmap.close(); canvas.width = canvas.height = 0 }
}
const sample = (output: Awaited<ReturnType<typeof pixels>>, x: number, y: number) => Array.from(output.bytes.slice((y * output.width + x) * 4, (y * output.width + x) * 4 + 4))
async function raster(background: 'scene' | 'transparent' | { color: string } = 'scene') {
  const lease = await acquireRasterImage(live!.editor.getScene(), live!.assets, { format: 'png', background, timeMs: 0 })
  try { return await pixels(lease.value.blob) } finally { lease.release() }
}
/** Decode SVG independently to catch mismatched fit/placement adapters. */
async function sameVector(output: Awaited<ReturnType<typeof pixels>>) {
  const svg = await acquireSceneText(live!.editor.getScene(), 'svg')
  try { const vector = await pixels(new Blob([svg.value.text], { type: 'image/svg+xml' }))
    for (const point of [[30, 30], [30, 50], [50, 45], [80, 70], [130, 110]]) equal(sample(vector, point[0], point[1]), sample(output, point[0], point[1]), 'SVG placement differs from raster')
  } finally { svg.release() }
}
/** Generate a deterministic four-quadrant static image through native Canvas. */
async function picture(): Promise<File> {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32; const ctx = canvas.getContext('2d')!
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00']
  colors.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(i % 2 * 32, Math.floor(i / 2) * 16, 32, 16) })
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png')); canvas.width = canvas.height = 0
  return new File([blob], 'quadrants.png', { type: 'image/png' })
}
async function run() {
  const button = document.getElementById('run') as HTMLButtonElement, status = document.getElementById('status')!, report = document.getElementById('report')!, checks: string[] = []
  button.disabled = true; status.textContent = 'Running'
  try {
    await until(() => !!live, 'Editor did not mount'); const initial = structuredClone(live!.editor.getScene()), keys = JSON.stringify(initial.timelines)
    await select('Fill Type', 'image'); const beforeImport = structuredClone(live!.editor.getScene())
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Import paint image file"]')!, transfer = new DataTransfer(); transfer.items.add(await picture())
    flushSync(() => { input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })) })
    await until(() => live!.editor.getScene().assets.length === 1, 'Image import did not finish')
    await until(() => { const element = live!.assets.get(live!.editor.getScene().assets[0].id); return element instanceof HTMLImageElement && element.complete }, 'Managed image was not ready')
    await frames(); const imported = structuredClone(live!.editor.getScene()), assetId = imported.assets[0].id
    assert(imported.layers.length === 1, 'Import created a stray image layer')
    flushSync(() => live!.editor.undo()); await frames(); equal(live!.editor.getScene(), beforeImport, 'Import Undo did not restore exact source')
    flushSync(() => live!.editor.redo()); await frames(); equal(live!.editor.getScene(), imported, 'Import Redo lost source URL/placement')
    checks.push('Real image import assigns one shared source, adds no layer, and has one Undo/Redo')
    await select('Stroke Type', 'none'); await select('Image fit', 'fill')
    let output = await raster(); equal(sample(output, 30, 30), [255, 0, 0, 255], 'Stretch top-left'); equal(sample(output, 130, 110), [255, 255, 0, 255], 'Stretch bottom-right'); await sameVector(output)
    await select('Image fit', 'contain'); output = await raster(); assert(sample(output, 30, 30)[3] === 0, 'Contain did not leave transparent bars'); equal(sample(output, 30, 50), [255, 0, 0, 255], 'Contain placement'); await sameVector(output)
    await number('Image offset X', '30'); output = await raster(); assert(sample(output, 30, 50)[3] === 0, 'Local image offset did not move the picture'); await sameVector(output)
    await click('Reset image placement'); await select('Image fit', 'fill'); await number('Image scale', '50'); output = await raster(); assert(sample(output, 30, 30)[3] === 0, 'Scale did not remain about the paint centre'); await sameVector(output)
    await click('Reset image placement'); await number('Image rotation', '90'); output = await raster(); equal(sample(output, 50, 45), [0, 0, 255, 255], 'Rotation does not use the paint centre'); await sameVector(output)
    await click('Reset image placement'); await select('Image fit', 'cover'); output = await raster(); equal(sample(output, 30, 30), [255, 0, 0, 255], 'Cover source did not fill the shape'); await sameVector(output)
    checks.push('Actual PNG and SVG pixels verify Stretch/Contain/Cover, local offsets, centred scale and rotation')
    const scene = live!.editor.getScene(), image = live!.assets.get(assetId)!
    for (const kind of ['ellipse', 'star', 'ring'] as const) {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240; const ctx = canvas.getContext('2d')!
      canvasRenderer.render(ctx, { ...scene, layers: [{ ...scene.layers[0], shapeKind: kind }] }, 0, null, new Map([[assetId, image]]), { renderMode: 'preview' })
      assert(ctx.getImageData(22, 22, 1, 1).data[3] === 0, `${kind} image escaped its contour`)
      if (kind === 'ring') assert(ctx.getImageData(80, 70, 1, 1).data[3] === 0, 'Ring hole was filled')
      canvas.width = canvas.height = 0
    }
    checks.push('Native circle/star/ring silhouettes clip image paint, including the ring hole')
    await select('Fill Type', 'none'); output = await raster(); assert(sample(output, 80, 70)[3] === 0, 'None fill painted a hidden color')
    await select('Stroke Type', 'solid'); output = await raster(); assert(sample(output, 20, 70)[3] > 0, 'None fill also removed the stroke')
    await select('Stroke Type', 'none'); await select('Fill Type', 'image'); equal(live!.editor.getScene().layers[0].style?.fill?.image?.assetId, assetId, 'None discarded inactive image data')
    equal(JSON.stringify(live!.editor.getScene().timelines), keys, 'Paint edits rewrote existing animation keys')
    checks.push('Fill/Stroke None are independent, preserve image payload and retain original human keys')
    const portable = await acquirePortableScene(live!.editor.getScene()); try { const loaded = parseSceneJson(JSON.stringify(portable.value), true); assert(loaded.assets[0].url.startsWith('data:'), 'Portable save did not embed image'); equal(loaded.timelines, initial.timelines, 'Portable save changed keys') } finally { portable.release() }
    const svg = await acquireSceneText(live!.editor.getScene(), 'svg'); try { const svgPixels = await pixels(new Blob([svg.value.text], { type: 'image/svg+xml' })); output = await raster(); equal(sample(svgPixels, 30, 30), sample(output, 30, 30), 'SVG image pattern differs from raster'); assert(!svg.value.text.includes('blob:'), 'SVG retained a session-only URL') } finally { svg.release() }
    checks.push('Portable JSON embeds the shared asset; actual SVG pixels match PNG without blob URLs')
    await click('Edit background'); await select('Background type', 'image'); await select('Image asset', assetId)
    const checkbox = document.querySelector<HTMLInputElement>('[aria-label="Include background in export"]')!; flushSync(() => checkbox.click()); await frames()
    output = await raster(); assert(sample(output, 300, 200)[3] === 0, 'Excluded background leaked into PNG')
    const viewport = document.querySelector<HTMLCanvasElement>('#host canvas')!; assert(viewport.getContext('2d')!.getImageData(300, 200, 1, 1).data[3] > 0, 'Excluded background disappeared from viewport')
    output = await raster({ color: '#ff00ff' }); equal(sample(output, 300, 200), [255, 0, 255, 255], 'Explicit export color was ignored')
    const jpeg = await acquireRasterImage(live!.editor.getScene(), live!.assets, { format: 'jpeg', timeMs: 0 })
    try { const opaque = sample(await pixels(jpeg.value.blob), 300, 200); assert(opaque.every((value, i) => i === 3 ? value === 255 : value > 250), 'JPEG alpha fallback did not use white'); assert(jpeg.value.warnings.some(warning => warning.includes('no alpha')), 'JPEG alpha fallback did not warn') } finally { jpeg.release() }
    const sequence = await acquireSequence(live!.editor.getScene(), live!.assets, { format: 'png', fps: 2 }); try {
      const bytes = await sequence.value.blob.arrayBuffer(), zip = new ZipReader(), entries = zip.readEntries(bytes)
      assert(entries.length === 2, 'Sequence frame count changed')
      for (const entry of entries) await zip.withEntry(bytes, entry, async data => assert(sample(await pixels(new Blob([data], { type: 'image/png' })), 300, 200)[3] === 0, 'Sequence ignored background visibility'))
    } finally { sequence.release() }
    const excludedSvg = await acquireSceneText(live!.editor.getScene(), 'svg'); try { assert(sample(await pixels(new Blob([excludedSvg.value.text], { type: 'image/svg+xml' })), 300, 200)[3] === 0, 'SVG ignored background visibility') } finally { excludedSvg.release() }
    flushSync(() => checkbox.click()); await frames(); output = await raster(); assert(sample(output, 300, 200)[3] === 255, 'Included image background missing from PNG')
    checks.push('Background remains in viewport while PNG, every sequence frame and SVG honour export inclusion; explicit output color wins')
    equal(JSON.stringify(live!.editor.getScene().timelines), keys, 'Background edits changed keys')
    checks.push(...await checkSplinePaint({ editor: () => live!.editor, frames, select, number, click, raster, pixels }, assetId))
    status.textContent = `PASS · ${checks.length} checks`; report.textContent = JSON.stringify({ passed: true, checks }, null, 2)
  } catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error), checks }, null, 2) }
  finally { button.disabled = false }
}
document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button,#run{padding:8px 12px;border:1px solid #475569;border-radius:5px;margin-bottom:8px}#host{max-width:1200px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Image paint and export acceptance</h1><p>Real PropertiesPanel, importer, media sessions, CanvasRenderer and output encoders. Connected source unchanged.</p><button id="run">Run image paint checks</button><p id="status">Ready</p><section id="host"></section><pre id="report">No checks run</pre>'
createRoot(document.getElementById('host')!).render(<Host />)
document.getElementById('run')!.onclick = () => void run()
