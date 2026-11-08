import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { emptyScene } from '@/lib/defaults'
import type { CanvasSurfacePoolSnapshot } from '@/lib/render/resources/CanvasSurfacePool'
import { ProjectResourceMonitor } from '@/lib/resources/monitor/ProjectResourceMonitor'
import ResourceMonitorPanel from './ResourceMonitorPanel'
import { SurfacePoolSection } from './SurfacePoolSection'
import { ComputeResourcesSection } from './ComputeResourcesSection'
import { ManagedBudgetSection } from './ManagedBudgetSection'
import { ResourceBudget } from '@/lib/resources/budget'

it('opens with project-wide scope and accessible categories without inventing total RAM', () => {
  const scene = emptyScene()
  const audio = { getResources: () => ({ bytes: 0, bufferCount: 0, pendingCount: 0, assets: [] }),
    getState: () => ({ contextState: 'idle', masterVolume: 1, meter: { peak: 0, rms: 0, clipped: false },
      loadingAssetIds: [], errors: {}, sources: [] }) }
  const source = new ProjectResourceMonitor({ scene, media: new Map(), isPlaying: false }, {
    canvases: { getSnapshot: () => ({ supported: true, canvas2dBytes: 40 * 1024 ** 2, webglBytes: 0, canvas2dCount: 1, webglCount: 0 }) },
  })
  const html = renderToStaticMarkup(createElement(ResourceMonitorPanel, { scene, assets: new Map(), audio, isPlaying: false, source }))
  for (const text of ['40.0 MiB', 'Overview', 'Media', 'CPU / GPU', 'Surfaces', 'Browser memory', 'This is not total process RAM.']) expect(html).toContain(text)
  expect(html).toContain('aria-label="Resource categories"')
  expect(html).toContain('aria-pressed="true"')
  const compute = renderToStaticMarkup(createElement(ComputeResourcesSection, { snapshot: source.getSnapshot() }))
  expect(compute).toContain('Idle')
  expect(compute).toContain('Not exposed by browser')
})

it('shows original source ownership independently of decoded/process byte totals', async () => {
  const { OverviewSection } = await import('./OverviewSection')
  const scene = emptyScene(), source = new ProjectResourceMonitor({ scene, media: new Map(), isPlaying: false }, {
    sources: { getSnapshot: () => ({ ownedUrls: 3, borrowedUrls: 2, references: 7, pendingUrls: 1, failedUrls: 0, revoked: 4, failures: 0 }) },
  })
  const html = renderToStaticMarkup(createElement(OverviewSection, { snapshot: source.getSnapshot(), onSampleMemory() {} }))
  for (const text of ['Original blob URLs', '3 / 2', '7 / 1 / 0', 'separate from decoded media bytes', 'do not measure source-file RAM']) expect(html).toContain(text)
})

it('shows shared scratch counters and safe cleanup with the actual injected budget', () => {
  const snapshot: CanvasSurfacePoolSnapshot = {
    maxBytes: 96 * 1024 ** 2, residentBytes: 12 * 1024 ** 2,
    activeBytes: 8 * 1024 ** 2, idleBytes: 4 * 1024 ** 2, peakResidentBytes: 16 * 1024 ** 2,
    activeSurfaces: 2, idleSurfaces: 1, allocations: 7, reuses: 1234, evictions: 4, budgetDenials: 3,
  }
  const onClearIdle = vi.fn()
  const html = renderToStaticMarkup(createElement(SurfacePoolSection, { snapshot, onClearIdle }))
  for (const text of ['12.0 MiB', '96.0 MiB', '8.0 MiB', '4.0 MiB', '16.0 MiB', '12.5%', 'Estimated · RGBA8', 'Release unused resources']) expect(html).toContain(text)
  expect(html).toContain('aria-label="Scratch surface pool budget usage"')
  expect(onClearIdle).not.toHaveBeenCalled()
})

it('shows real shared admission partitions and explicit coverage without summing overlapping scopes', () => {
  const budget = new ResourceBudget({ maxBytes: 1024, maxEntries: 4 })
  const active = budget.reserve('scratch', 256)!, preview = budget.reserve('preview', 128)!
  preview.commit(); preview.allowReclaim(() => preview.release())
  const html = renderToStaticMarkup(createElement(ManagedBudgetSection, { snapshot: budget.getSnapshot() }))
  for (const text of ['Managed allocation budget', '384 B', '1.0 KiB', '37.5%', '128 B / 256 B', '256 B / 128 B',
    'scratch and preview surfaces', 'leased media, audio PCM', 'raster/ZIP/WAV/text output', 'file/server/MCP handoff', 'Protected allocations cannot be reclaimed', 'must not be added']) expect(html).toContain(text)
  expect(html).toContain('aria-label="Shared managed allocation budget usage"')
  expect(budget.getSnapshot().chargedBytes).toBe(384)
  active.release(); budget.reclaimIdle()
})

it('shows input processing charges separately from native and persistent source storage', () => {
  const budget = new ResourceBudget({ maxBytes: 64 }), input = budget.reserve('input', 8)!, copy = budget.reserve('input', 8)!
  input.commit()
  const html = renderToStaticMarkup(createElement(ManagedBudgetSection, { snapshot: budget.getSnapshot() }))
  for (const text of ['Input processing · resident / pending', '8 B / 8 B', 'bounded input', 'text/object copies use admission estimates', 'JS-engine internals', 'persistent source storage', 'not measured or hard-capped']) expect(html).toContain(text)
  expect(budget.getSnapshot().chargedBytes).toBe(16); input.release(); copy.release()
})

it('shows actual unique layer counters and partial-frame status without calling them GPU draws', async () => {
  const { PaintWorkMonitor } = await import('@/lib/resources/performance/PaintWorkMonitor')
  const { PaintResourcesSection } = await import('./PaintResourcesSection')
  const scene = emptyScene(), paint = new PaintWorkMonitor()
  const source = new ProjectResourceMonitor({ scene, media: new Map(), isPlaying: false }, { paint })
  expect(renderToStaticMarkup(createElement(PaintResourcesSection, { snapshot: source.getSnapshot() }))).toContain('No viewport frame has been recorded')
  paint.record(scene, { total: 3000, processed: 300, culled: 2700, unvisited: 0, visits: 3000, culledVisits: 2700, completed: false })
  const html = renderToStaticMarkup(createElement(PaintResourcesSection, { snapshot: source.getSnapshot() }))
  for (const text of ['3000', '2700', '300', 'Total layers', 'Submitted layers', 'Culled layers', 'Interrupted · partial counters', 'not GPU draw calls']) expect(html).toContain(text)
})

it('separates LOD representation from visibility rejection and shows the real cache budget', async () => {
  const { PaintWorkMonitor } = await import('@/lib/resources/performance/PaintWorkMonitor')
  const { PaintResourcesSection } = await import('./PaintResourcesSection')
  const { OverviewSection } = await import('./OverviewSection')
  const { StaticGroupLodCache } = await import('@/lib/render/lod/StaticGroupLodCache')
  const scene = emptyScene(), paint = new PaintWorkMonitor(), lod = new StaticGroupLodCache({ maxBytes: 1024, maxIdleMs: 0 })
  paint.record(scene, { total: 17, processed: 1, culled: 0, unvisited: 0, visits: 1, culledVisits: 0,
    completed: true, lodRepresented: 16, lodGroups: 1, lodBuilds: 0, lodRasterizedLayers: 0 })
  const source = new ProjectResourceMonitor({ scene, media: new Map(), isPlaying: false }, { paint, lod })
  const html = renderToStaticMarkup(createElement(PaintResourcesSection, { snapshot: source.getSnapshot() }))
  expect(html).toContain('Layers represented by LOD')
  expect(html).toContain('16')
  const overview = renderToStaticMarkup(createElement(OverviewSection, { snapshot: source.getSnapshot(), onSampleMemory() {} }))
  expect(overview).toContain('0 B / 1.0 KiB')
  expect(overview).toContain('not counted twice')
})

it('keeps all resource categories and unavailable diagnostics in English', async () => {
  const { OverviewSection } = await import('./OverviewSection')
  const { MediaResourcesSection } = await import('./MediaResourcesSection')
  const scene = emptyScene()
  const source = new ProjectResourceMonitor({ scene, media: new Map(), isPlaying: false })
  const snapshot = source.getSnapshot()
  const sections = [
    createElement(OverviewSection, { snapshot, onSampleMemory() {} }),
    createElement(MediaResourcesSection, { snapshot, query: { page: 0, search: '' }, onQuery() {} }),
    createElement(ComputeResourcesSection, { snapshot }),
    createElement(SurfacePoolSection, { snapshot: snapshot.pool, onClearIdle() {} }),
  ]
  const html = sections.map(section => renderToStaticMarkup(section)).join('')
  expect(html).not.toMatch(/[çğıöşüÇĞİÖŞÜ]/)
  for (const label of ['Browser memory', 'Media assets', 'Search assets', 'CPU / Main thread',
    'Release unused resources', 'LOD cache', 'GPU color surfaces · RGBA8', 'No samples', 'Not exposed by browser']) expect(html).toContain(label)
})

it('labels effect passes separately and exposes quarantined texture accounting', async () => {
  const {GpuWorkRegistry}=await import('@/lib/resources/performance/GpuWorkRegistry')
  const gpu=new GpuWorkRegistry()
  const unregister=gpu.register({setSampling(){},getSnapshot:() => ({backend:'Image effects',drawKind:'effect',
    contextLost:false,cleanupFailed:true,textureBytes:80,bufferBytes:48,stagingBytes:0,
    drawCalls:2,lastInstances:0,lastDrawAt:1,timerSupported:false,gpuMs:null,gpuSampleAt:null})})
  const source=new ProjectResourceMonitor({scene:emptyScene(),media:new Map(),isPlaying:false},{gpu})
  const html=renderToStaticMarkup(createElement(ComputeResourcesSection,{snapshot:source.getSnapshot()}))
  expect(html).toContain('Total effect passes');expect(html).not.toContain('Total instanced draws')
  expect(html).not.toContain('Instances in last draw');expect(html).toContain('Texture stores · RGBA8 estimate')
  expect(html).toContain('80 B');expect(html).toContain('Cleanup failed · still charged')
  unregister()
})

it('shows bounded audio preparation separately from PCM bytes and marks unavailable adapters', async () => {
  const { MediaResourcesSection } = await import('./MediaResourcesSection')
  const scene = emptyScene()
  const preparation = { active: 2, queued: 4, concurrency: 2, maxQueued: 128,
    completed: 3, failed: 0, cancelled: 1, denied: 5, closed: false }
  const source = new ProjectResourceMonitor({ scene, media: new Map(), isPlaying: false,
    audio: () => ({ bytes: 64, bufferCount: 1, pendingCount: 6, assets: [], preparation }) })
  const render = () => renderToStaticMarkup(createElement(MediaResourcesSection,
    { snapshot: source.getSnapshot(), query: { page: 0, search: '' }, onQuery() {} }))
  const measured = render()
  for (const text of ['64 B', 'Audio preparation · local active / queued', '2 / 4', 'Audio preparation · local active limit',
    '1 / 5', 'Cancelled native decoding remains active until it settles', 'do not add these totals']) expect(measured).toContain(text)
  source.setInputs({ scene, media: new Map(), isPlaying: false,
    audio: () => ({ bytes: 0, bufferCount: 0, pendingCount: 0, assets: [] }) })
  expect(render()).toContain('Not tracked')
})

it('shows aggregate media capacity separately from local admitted work and byte totals', async () => {
  const { MediaResourcesSection } = await import('./MediaResourcesSection')
  const mediaPreparation = { getSnapshot: () => ({ active: 2, queued: 3, concurrency: 2, maxQueued: 128,
    completed: 4, failed: 0, cancelled: 1, denied: 2, closed: false }) }
  const source = new ProjectResourceMonitor({ scene: emptyScene(), media: new Map(), isPlaying: false }, { mediaPreparation })
  const snapshot = source.getSnapshot()
  expect(snapshot.mediaPreparation).toEqual(mediaPreparation.getSnapshot())
  const html = renderToStaticMarkup(createElement(MediaResourcesSection, { snapshot, query: { page: 0, search: '' }, onQuery() {} }))
  for (const text of ['Shared media preparation', 'Media pipeline · active / queued', '2 / 3', '2 / 128',
    'executing / shared wait', 'must not be added to this total']) expect(html).toContain(text)
  expect(html).not.toMatch(/[çğıöşüÇĞİÖŞÜ]/)
})

it('shows outer import and inner media queues separately without adding overlapping jobs', async () => {
  const { MediaResourcesSection } = await import('./MediaResourcesSection')
  const jobs = { active: 2, queued: 3, concurrency: 2, maxQueued: 128, completed: 1, failed: 0, cancelled: 4, denied: 5, closed: false }
  const monitor = new ProjectResourceMonitor({ scene: emptyScene(), media: new Map(), isPlaying: false }, {
    importPreparation: { getSnapshot: () => jobs }, mediaPreparation: { getSnapshot: () => ({ ...jobs, queued: 1 }) },
  })
  const html = renderToStaticMarkup(createElement(MediaResourcesSection, { snapshot: monitor.getSnapshot(), query: { page: 0, search: '' }, onQuery() {} }))
  for (const text of ['Import pipeline · active / queued', '2 / 3', 'Media pipeline · active / queued', '2 / 1', 'overlapping counts must not be added']) expect(html).toContain(text)
})
