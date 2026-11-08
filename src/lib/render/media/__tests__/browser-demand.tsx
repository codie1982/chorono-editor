import { StrictMode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { emptyScene, newImageLayer, newVideoLayer } from '../../../defaults'
import type { Asset, ChronoScene } from '../../../types'
import { assetSourcePool } from '../../../asset/sources'
import { VisualAssetService } from '../../../asset/visual'
import { ResourceBudget } from '../../../resources/budget'
import { nativePng, nativeWebm, nativeFingerprint } from '../../../asset/visual/__tests__/nativeMediaFixtures'
import { useAssetCache, type AssetCache } from '@/app/hooks/useAssetCache'
import { useVideoPlaybackSync } from '@/app/hooks/useVideoPlaybackSync'
import { useCanvasRenderer } from '@/components/canvas/hooks/useCanvasRenderer'
import { VisualMediaSession } from '../VisualMediaSession'
import { withMediaFrame } from '../withMediaFrame'
import { canvasRenderer } from '../../CanvasRenderer'
import { videoForLayer } from '../../../asset/visual/AssetElementMap'
import { evaluateTimelines } from '../../../evaluator'
import { exportRasterImage } from '../../../export/raster/RasterExportEngine'
import { visualAssetService } from '../../../asset/visual'
import { ProjectResourceMonitor } from '../../../resources/monitor/ProjectResourceMonitor'

interface Binding { cache: AssetCache; canvas?: HTMLCanvasElement }
/** Actual viewport scheduling/cache/video hooks, with real CSS pan/clipping. */
function Probe({ scene, pan, service, binding }: { scene: ChronoScene; pan: number; service: VisualAssetService; binding: Binding }) {
  const assets = useAssetCache(scene.assets, { managed: true, service }), viewport = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const overrides = useMemo(() => evaluateTimelines(scene.timelines, 0), [scene.timelines])
  useLayoutEffect(() => { binding.cache = assets; binding.canvas = canvas.current! }, [assets, binding])
  useVideoPlaybackSync({ scene, assetCache: assets, currentTimeMs: 0, isPlaying: false, playbackSpeed: 1, overrides })
  useCanvasRenderer(canvas, { scene, timeMs: 0, assets, viewportRef: viewport, viewportScale: 1, viewportKey: String(pan),
    selectedLayerId: null, overrides, dragOverrides: new Map(), snapEnabled: false, snapToGridOn: false, gridSize: 10, hideEditorUI: true })
  return <div ref={viewport} style={{ width: 256, height: 128, overflow: 'hidden', border: '1px solid #64748b' }}>
    <canvas ref={canvas} width={2048} height={128} style={{ width: 2048, height: 128, transform: `translateX(${-pan}px)` }} />
  </div>
}
/** Visible-frame acceptance deadline, not an assumed decoder delay. */
async function until(condition: () => boolean) {
  const end = performance.now() + 20000
  while (!condition()) { if (performance.now() > end) throw new Error('Viewport media acceptance timed out.'); await new Promise(requestAnimationFrame) }
}
/** Private 3000-source metadata fixture: all URLs valid; only a tiny working set
 * intersects the viewport. No user document or MCP scene is changed. */
async function fixture() {
  const png = await nativePng(), sources = Array.from({ length: 3000 }, () => assetSourcePool.create(png))
  const movie = assetSourcePool.create(await nativeWebm())
  const assets: Asset[] = sources.map((source, index) => ({ id: `asset-${index}`, name: `Image ${index}`, type: 'image', url: source.url, width: 32, height: 32 }))
  assets.push({ id: 'movie', name: 'Two clips', type: 'video', url: movie.url, width: 32, height: 32 })
  const layers = assets.slice(0, 3000).map((asset, index) => {
    const layer = newImageLayer(asset.id, 32, 32); layer.id = `image-${index}`; layer.transform = { ...layer.transform, x: index * 300, y: 0 }; return layer
  })
  const clips = [100, 500].map((offset, index) => {
    const layer = newVideoLayer('movie', 32, 32); layer.id = `clip-${index}`
    layer.video = { ...layer.video!, muted: true, startOffsetMs: offset }; layer.transform = { ...layer.transform, x: index * 64, y: 64 }; return layer
  })
  const scene: ChronoScene = { ...emptyScene(), composition: { ...emptyScene().composition, width: 2048, height: 128 }, assets, layers: [...layers, ...clips] }
  const budget = new ResourceBudget({ maxBytes: 512 * 1024 ** 2 }), decodes: string[] = []
  const { browserVisualDecoder } = await import('../../../asset/visual/browserVisualDecoder')
  const service = new VisualAssetService({ budget, decoder: (input, signal) => { decodes.push(input.url); return browserVisualDecoder(input, signal) } })
  return { scene, budget, service, decodes, dispose() { service.dispose(); sources.forEach(source => source.release()); movie.release() } }
}

/** End-to-end managed viewport and detached final frame ownership. */
async function checks(owner: Awaited<ReturnType<typeof fixture>>, binding: Binding, setScene: (scene: ChronoScene) => void,
  setPan: (pan: number) => void, copies: HTMLCanvasElement[]) {
  const rows: Array<{ name: string; passed: boolean; details?: unknown }> = []
  const test = (name: string, passed: boolean, details?: unknown) => rows.push({ name, passed, details })
  setScene(owner.scene); setPan(0)
  await until(() => binding.cache.has('asset-0') && owner.service.getSnapshot().preparation.active === 0 && !!videoForLayer(binding.cache, 'clip-0', 'movie')
    && !!videoForLayer(binding.cache, 'clip-1', 'movie'))
  await until(() => { const l = videoForLayer(binding.cache, 'clip-0', 'movie')!, r = videoForLayer(binding.cache, 'clip-1', 'movie')!
    return !l.seeking && !r.seeking && Math.abs(l.currentTime - 0.1) < 0.025 && Math.abs(r.currentTime - 0.5) < 0.025 })
  const initial = binding.cache, left = videoForLayer(initial, 'clip-0', 'movie')!, right = videoForLayer(initial, 'clip-1', 'movie')!
  const lp = nativeFingerprint(left, copies[0]), rp = nativeFingerprint(right, copies[1])
  await until(() => {
    const context = binding.canvas!.getContext('2d')!
    return Array.from(context.getImageData(0, 64, 32, 32).data).join(',') === lp
      && Array.from(context.getImageData(64, 64, 32, 32).data).join(',') === rp
  })
  test('actual scheduled viewport pixels match the two native decoded video frames', true)
  test('3001 registered visual sources decode only two nearby images and two native clip instances', owner.decodes.length === 4,
    { decodes: owner.decodes.length, snapshot: owner.service.getSnapshot() })
  test('actual viewport hook keeps two same-source clip clocks independent', left !== right && lp !== rp)
  test('CSS prefetch is reclaimable while distant static metadata stays cold', !binding.cache.has('asset-1') && !binding.cache.has('asset-2')
    && owner.service.getSnapshot().residency.reclaimableBytes === 4096)
  const before = owner.decodes.length
  setPan(600)
  await until(() => binding.cache.has('asset-2') && owner.service.getSnapshot().preparation.active === 0 && !binding.cache.get('asset-0'))
  test('pan updates current demand without loading every registered source', owner.decodes.length - before === 2 && !binding.cache.has('asset-4'))
  test('old scheduled maps cannot read released sources or a different video clip', initial.get('asset-0') === undefined
    && videoForLayer(initial, 'clip-0', 'movie') === undefined && left.paused && right.paused)
  owner.service.clearIdle()
  test('idle cleanup resets offscreen native videos while keeping current images pinned', left.getAttribute('src') === null && right.getAttribute('src') === null
    && owner.service.getSnapshot().residency.protectedBytes === 4096)
  const monitor = new ProjectResourceMonitor({ scene: owner.scene, media: binding.cache, isPlaying: false }, { visual: owner.service, budget: owner.budget })
  const media = monitor.getSnapshot().media
  test('resource inventory distinguishes ready viewport images from cold project sources', media.notResident === 3000 && media.ready === 1, { ready: media.ready, notResident: media.notResident })

  // A final job owns its own clip identities and full composition demand; a pan
  // on the editor cannot replace its map/pins while its encode is held.
  const finalOwner = new VisualMediaSession(owner.service); finalOwner.start()
  const finalCanvas = document.createElement('canvas'); finalCanvas.width = 2048; finalCanvas.height = 128
  const context = finalCanvas.getContext('2d')!
  let release!: () => void, entered = false, retained: AssetCache | undefined
  const held = new Promise<void>(yes => { release = yes })
  const job = withMediaFrame(owner.scene, 0, context, {}, async (assets, overrides) => {
    retained = assets; entered = true
    canvasRenderer.render(context, owner.scene, 0, null, assets, { overrides, renderMode: 'preview' })
    const expectedCanvas = document.createElement('canvas'); expectedCanvas.width = expectedCanvas.height = 32
    const expected = nativeFingerprint(assets.get('asset-0')!, expectedCanvas)
    await held
    return Array.from(context.getImageData(0, 0, 32, 32).data).join(',') === expected
  }, finalOwner)
  await until(() => entered)
  test('final preparation loads full composition and independently seeks both clips', !!retained?.get('asset-6') && !retained?.get('asset-7')
    && Math.abs(videoForLayer(retained!, 'clip-0', 'movie')!.currentTime - 0.1) < 0.025
    && Math.abs(videoForLayer(retained!, 'clip-1', 'movie')!.currentTime - 0.5) < 0.025)
  setScene({ ...emptyScene(), composition: owner.scene.composition }); await until(() => binding.cache.size === 0)
  owner.service.clearIdle()
  test('closing viewport preserves detached final job pins through encode settlement', !!retained!.get('asset-0') && owner.service.getSnapshot().residency.protectedBytes > 0)
  release(); test('prepared final frame contains actual media pixels', await job)
  finalOwner.stop(); owner.service.clearIdle()
  test('final consumer cleanup leaves zero decoded byte charge and no pending jobs', owner.budget.getSnapshot().chargedBytes === 0 && owner.service.getSnapshot().preparation.active === 0)
  const raster = await exportRasterImage(owner.scene, binding.cache, { format: 'png', timeMs: 0 })
  const bitmap = await createImageBitmap(raster.blob), decodedCanvas = document.createElement('canvas')
  decodedCanvas.width = bitmap.width; decodedCanvas.height = bitmap.height
  decodedCanvas.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close()
  test('actual raster export prepares cold media independently of the closed viewport', Array.from(decodedCanvas.getContext('2d')!.getImageData(0, 64, 32, 32).data).join(',') === lp
    && Array.from(decodedCanvas.getContext('2d')!.getImageData(64, 64, 32, 32).data).join(',') === rp)
  visualAssetService.clearIdle()
  test('actual raster encode releases its managed visual pins', visualAssetService.getSnapshot().residency.chargedBytes === 0)
  return { passed: rows.every(row => row.passed), results: rows, final: owner.service.getSnapshot(), budget: owner.budget.getSnapshot(),
    environment: { userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio } }
}

/** Explicit private fixture controls; no production route or global test hook. */
function Host() {
  const [scene, setScene] = useState(emptyScene), [pan, setPan] = useState(0), [owner, setOwner] = useState<Awaited<ReturnType<typeof fixture>> | null>(null)
  const [status, setStatus] = useState('Ready'), [report, setReport] = useState<unknown>()
  const binding = useRef<Binding>({ cache: new Map() }).current, copies = useRef<Array<HTMLCanvasElement | null>>([])
  useEffect(() => () => owner?.dispose(), [owner])
  return <main style={{ background: '#080d19', color: '#e2e8f0', fontFamily: 'system-ui', padding: 24, minHeight: '100vh' }}>
    <h1>Viewport media demand · native acceptance</h1><p>3001 valid sources · actual viewport/cache/video hooks · 512 MiB shared limit · independent final consumer</p>
    <button disabled={status === 'Running'} onClick={async () => {
      setStatus('Running'); setReport(undefined); owner?.dispose()
      try { const next = await fixture(); setOwner(next); const result = await checks(next, binding, setScene, setPan, copies.current as HTMLCanvasElement[])
        setReport(result); setStatus(result.passed ? 'PASS' : 'FAIL') }
      catch (error) { setReport({ passed: false, error: String(error) }); setStatus('FAIL') }
    }}>Run native checks</button>
    <p id="demand-status" role="status">{status}</p>
    {owner && <Probe scene={scene} pan={pan} service={owner.service} binding={binding} />}
    <div style={{ display: 'flex', gap: 20 }}>{['Clip A · 100ms', 'Clip B · 500ms'].map((label, i) => <figure key={label}>
      <canvas width={32} height={32} ref={node => { copies.current[i] = node }} style={{ width: 96, height: 96 }} /><figcaption>{label}</figcaption>
    </figure>)}</div>
    <p>The copied native video frames remain visible after resources are released. Frame-byte estimates do not measure decoder buffers or OS RAM.</p>
    <pre id="demand-report" style={{ whiteSpace: 'pre-wrap', maxHeight: 500, overflow: 'auto' }}>{report ? JSON.stringify(report, null, 2) : 'Awaiting native completion'}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<StrictMode><Host /></StrictMode>)
