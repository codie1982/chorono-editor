import { StrictMode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useImport, type UseImportReturn } from '@/app/hooks/useImport'
import { useAssetCache, type AssetCache } from '@/app/hooks/useAssetCache'
import { emptyScene, newImageLayer } from '@/lib/defaults'
import { makeDeleteAssetCmd } from '@/lib/editor/commands-import'
import { portableScene } from '@/lib/mcp/editor'
import { assetSourcePool } from '../AssetSourcePool'
import type { ChronoScene } from '@/lib/types'

interface Binding { editor?: EditorStateReturn; importer?: UseImportReturn; cache: AssetCache }
/** Visible-frame wait has a real failure deadline, not a guessed decode delay. */
async function until(condition: () => boolean) {
  const end = performance.now() + 10000
  while (!condition()) { if (performance.now() > end) throw new Error('Source acceptance condition timed out.'); await new Promise(requestAnimationFrame) }
}
/** Exact native RGBA fingerprint of the decoded original. */
function pixels(cache: AssetCache, id: string): string {
  const image = cache.get(id) as HTMLImageElement
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
  return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data).join(',')
}
/** Tiny actual PNG generated through native Canvas, never a simulated decoder. */
async function imageFile(): Promise<File> {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16
  const context = canvas.getContext('2d')!; context.fillStyle = '#ee7926'; context.fillRect(0, 0, 16, 16)
  context.fillStyle = '#284bd2'; context.fillRect(4, 4, 8, 8)
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'))
  return new File([blob], 'source-lifetime.png', { type: 'image/png' })
}
/** Production loader can unmount while its document remains open. */
function CacheProbe({ scene, binding }: { scene: ChronoScene; binding: Binding }) {
  const cache = useAssetCache(scene.assets), canvas = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => { binding.cache = cache; return () => { binding.cache = new Map() } }, [cache, binding])
  useEffect(() => {
    const context = canvas.current!.getContext('2d')!; context.clearRect(0, 0, 64, 64)
    const image = cache.get(scene.assets[0]?.id)
    if (image instanceof HTMLImageElement && image.complete && image.naturalWidth) context.drawImage(image, 0, 0, 64, 64)
  }, [scene.assets, cache])
  return <canvas ref={canvas} width={64} height={64} aria-label="Decoded source preview" />
}
/** Actual editor history/import hooks; no connected editor is accessed. */
function DocumentProbe({ binding, showCache }: { binding: Binding; showCache: boolean }) {
  const [initial] = useState(emptyScene), editor = useEditorState(initial)
  const importer = useImport({ dispatchCommand: editor.dispatchCommand })
  useLayoutEffect(() => { binding.editor = editor; binding.importer = importer }, [binding, editor, importer])
  return <section>
    <p>Current assets: {editor.scene.assets.length} · Undo: {String(editor.canUndo)} · Redo: {String(editor.canRedo)}</p>
    {showCache && <CacheProbe scene={editor.scene} binding={binding} />}
  </section>
}

/** Native source ownership checks include actual StrictMode hooks, built-in
 * ImageHandler/import command, decoder reload, history purge and portable save.
 * Registry counts measure original handles only, never decoded/process RAM. */
async function checks(binding: Binding, showCache: (value: boolean) => void, inspectSave: () => Promise<void>) {
  const results: Array<{ name: string; passed: boolean; details?: unknown }> = []
  const test = (name: string, passed: boolean, details?: unknown) => results.push({ name, passed, details })
  const editor = () => binding.editor!, file = await imageFile()
  const load = async () => {
    const imported = await binding.importer!.importFile(file)
    if (!imported) throw new Error('Native import failed.')
    const asset = imported.assets[0]
    await until(() => { const image = binding.cache.get(asset.id) as HTMLImageElement | undefined; return !!image?.complete && image.naturalWidth > 0 })
    return asset
  }
  const fetchable = async (url: string) => { try { return (await fetch(url)).ok } catch { return false } }
  const zero = () => assetSourcePool.getSnapshot().ownedUrls === 0
  editor().resetScene(emptyScene()); await until(() => binding.cache.size === 0)
  const first = await load(), reference = pixels(binding.cache, first.id)
  test('built-in import transfers a real PNG source into StrictMode document ownership', await fetchable(first.url)
    && assetSourcePool.getSnapshot().ownedUrls === 1)
  showCache(false); await until(() => binding.cache.size === 0)
  test('decoded loader unmount never revokes its open document source', await fetchable(first.url))
  showCache(true); await until(() => !!(binding.cache.get(first.id) as HTMLImageElement)?.naturalWidth)
  test('decoder reload preserves exact native RGBA pixels', pixels(binding.cache, first.id) === reference)
  const firstScene = editor().getScene()
  editor().dispatchCommand(makeDeleteAssetCmd(first.id, firstScene.layers.map(layer => layer.id), firstScene))
  await until(() => binding.cache.size === 0)
  test('logical asset deletion preserves original source for undo', await fetchable(first.url))
  editor().undo(); await until(() => !!(binding.cache.get(first.id) as HTMLImageElement)?.naturalWidth)
  test('undo restores original decoded pixels', pixels(binding.cache, first.id) === reference)
  editor().redo(); await until(() => binding.cache.size === 0)
  test('redo remains undoable without revoking history sources', await fetchable(first.url))
  editor().undo(); editor().undo(); await until(() => binding.cache.size === 0)
  test('undoing import leaves the redo source usable', await fetchable(first.url))
  editor().dispatchCommand({ label: 'New branch', execute: scene => ({ ...scene, composition: { ...scene.composition, id: 'branch' } }), undo: scene => scene })
  await until(zero)
  test('dropping redo branch releases its final owned original URL', !await fetchable(first.url))

  const bounded = await load(), current = editor().getScene()
  editor().dispatchCommand(makeDeleteAssetCmd(bounded.id, current.layers.map(layer => layer.id), current))
  await until(() => binding.cache.size === 0)
  for (let index = 0; index < 51; index++) editor().dispatchCommand({ label: `History ${index}`, execute: scene => ({ ...scene }), undo: scene => scene })
  await until(zero)
  test('source expires when its last retained state leaves the 50-step history', !await fetchable(bounded.url))

  const original = await load(), base = editor().getScene()
  const temporary = assetSourcePool.create(file)
  const previewAsset = { ...original, id: 'preview', url: temporary.url, runtime: { objectUrl: temporary.url } }
  editor().beginTransaction()
  editor().previewTransaction({ ...base, assets: [previewAsset], layers: [newImageLayer(previewAsset.id, 16, 16)] })
  test('transaction base and preview retain independent source lifetimes', await fetchable(original.url) && await fetchable(temporary.url))
  editor().cancelTransaction()
  await until(() => assetSourcePool.getSnapshot().ownedUrls === 1)
  test('cancelling preview releases temporary source and restores base', !await fetchable(temporary.url) && await fetchable(original.url))
  editor().beginTransaction(); editor().previewTransaction({ ...base, assets: [], layers: [] })
  test('asset-less preview still preserves its transaction base', await fetchable(original.url))
  editor().resetScene(emptyScene()); await until(zero)
  test('project reset clears transaction ownership and cannot revive its old source', !editor().isTransactionActive() && !await fetchable(original.url))

  const savingAsset = await load(), snapshot = editor().getScene(), unchanged = JSON.stringify(snapshot)
  let finish!: () => void
  const hold = new Promise<void>(resolve => { finish = resolve })
  const saving = portableScene(snapshot, async (input, options) => { await hold; return fetch(input, options) })
  editor().resetScene(emptyScene()); await until(() => binding.cache.size === 0)
  test('portable save pins the old project original after current/history reset', await fetchable(savingAsset.url)
    && assetSourcePool.getSnapshot().ownedUrls === 1, assetSourcePool.getSnapshot())
  await inspectSave(); finish()
  const portable = await saving
  test('portable save embeds bytes and strips runtime source handles', portable.assets[0].url.startsWith('data:image/png;base64,')
    && portable.assets[0].runtime === undefined && JSON.stringify(snapshot) === unchanged)
  await until(zero)
  test('completed save releases the final original source URL', !await fetchable(savingAsset.url))
  return { passed: results.every(row => row.passed), results, final: assetSourcePool.getSnapshot(),
    environment: { userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } } }
}

/** Explicit native controls expose one held portable job for review. */
function Host() {
  const binding = useRef<Binding>({ cache: new Map() }).current
  const [showCache, setShowCache] = useState(true), [status, setStatus] = useState('Ready'), [report, setReport] = useState<unknown>(null)
  const completion = useRef<(() => void) | null>(null)
  const [inventory, setInventory] = useState(() => assetSourcePool.getSnapshot())
  useEffect(() => () => completion.current?.(), [])
  return <main style={{ fontFamily: 'system-ui', color: '#e2e8f0', background: '#080d19', minHeight: '100vh', padding: 24 }}>
    <h1>Original source lifetime · native acceptance</h1>
    <p>Actual history/import/cache hooks · StrictMode · private PNG project · portable save</p>
    <button disabled={status === 'Running' || status === 'Portable save waiting'} onClick={async () => {
      setStatus('Running'); setReport(null)
      try {
        const result = await checks(binding, setShowCache, async () => {
          setInventory(assetSourcePool.getSnapshot()); setStatus('Portable save waiting')
          await new Promise<void>(resolve => { completion.current = resolve })
          completion.current = null; setStatus('Running')
        })
        setReport(result); setInventory(assetSourcePool.getSnapshot()); setStatus(result.passed ? 'PASS' : 'FAIL')
      } catch (error) { setReport({ passed: false, error: String(error) }); setStatus('FAIL') }
    }}>Run native checks</button>{' '}
    <button disabled={status !== 'Portable save waiting'} onClick={() => completion.current?.()}>Complete portable save</button>
    <p id="source-status" role="status">{status}</p>
    <DocumentProbe binding={binding} showCache={showCache} />
    <h2>Original source handles</h2>
    <p>Owned URLs: {inventory.ownedUrls} · References: {inventory.references} · Pending: {inventory.pendingUrls} · Failures: {inventory.failures}</p>
    <p>Source handles are independent of decoded media and process RAM.</p>
    <pre id="source-report" style={{ whiteSpace: 'pre-wrap' }}>{report ? JSON.stringify(report, null, 2) : 'Awaiting native completion'}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<StrictMode><Host /></StrictMode>)
