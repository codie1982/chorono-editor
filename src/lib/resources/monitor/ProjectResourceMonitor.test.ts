import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { CanvasSurfacePool } from '@/lib/render/resources/CanvasSurfacePool'
import { BrowserMemoryReader } from '../memory/BrowserMemoryReader'
import { GpuWorkRegistry } from '../performance/GpuWorkRegistry'
import { RenderWorkMonitor } from '../performance/RenderWorkMonitor'
import { ProjectResourceMonitor } from './ProjectResourceMonitor'
import { ResourceBudget } from '../budget'
import {OutputResources} from '../../export/resources'
import {VisualAssetService} from '../../asset/visual'

describe('project resource composition', () => {
  it('reports output policy separately and explicitly retries visual/output failed cleanup',()=>{
    const budget=new ResourceBudget({maxBytes:1024}),outputs=new OutputResources({budget}),visual=new VisualAssetService({budget}),visualRetry=vi.spyOn(visual,'clearIdle')
    const dispose=vi.fn().mockImplementationOnce(()=>{throw new Error('native cleanup failed')})
    const pin=outputs.own(128,()=>1,dispose)
    const monitor=new ProjectResourceMonitor({scene:emptyScene(),media:new Map(),isPlaying:false,audio:()=>({bytes:0,bufferCount:0,pendingCount:0,assets:[]})},{
      budget,outputs,visual,
      canvases:{getSnapshot:()=>({supported:true,canvas2dBytes:0,webglBytes:0,canvas2dCount:0,webglCount:0})},gpu:new GpuWorkRegistry(),
    })
    expect(monitor.getSnapshot()).toMatchObject({knownBytes:0,outputs:{residency:{protectedBytes:128}},budget:{chargedBytes:128}})
    monitor.clearIdle();expect(visualRetry).toHaveBeenCalledOnce();expect(dispose).not.toHaveBeenCalled()
    pin.release();expect(outputs.getSnapshot().residency.failedEntries).toBe(1)
    monitor.clearIdle();expect(dispose).toHaveBeenCalledTimes(2);expect(budget.getSnapshot().chargedBytes).toBe(0);outputs.dispose();visual.dispose()
  })
  it('keeps overlapping heap/pool/source-file bytes out of the known-resource sum and updates scene counts', () => {
    const scene = emptyScene()
    scene.layers = [newRectLayer()]
    scene.timelines = [newTimeline()]
    scene.assets = [{ id: 'image', name: 'Image', type: 'image', url: 'image', metadata: { filesize: 5000 } }]
    const pool = new CanvasSurfacePool()
    const getSnapshot = () => ({ ...pool.getSnapshot(), residentBytes: 128, activeBytes: 128 })
    const gpu = new GpuWorkRegistry()
    const unregister = gpu.register({ setSampling() {}, getSnapshot: () => ({ backend: 'test', contextLost: false,
      bufferBytes: 100, stagingBytes: 10, textureBytes: 80, drawCalls: 1, lastInstances: 1, lastDrawAt: 1,
      timerSupported: false, gpuMs: null, gpuSampleAt: null }) })
    const inputs = { scene, media: new Map([['image', { naturalWidth: 10, naturalHeight: 10, complete: true }]]),
      isPlaying: false, audio: () => ({ bytes: 32, bufferCount: 1, pendingCount: 0, assets: [] }) }
    const monitor = new ProjectResourceMonitor(inputs, {
      pool: { getSnapshot, clearIdle: vi.fn() }, gpu, work: new RenderWorkMonitor(),
      canvases: { getSnapshot: () => ({ supported: true, canvas2dBytes: 200, webglBytes: 40, canvas2dCount: 2, webglCount: 1 }) },
      browser: new BrowserMemoryReader(() => ({ secure: false, isolated: false,
        heap: { usedJSHeapSize: 9000, totalJSHeapSize: 18000, jsHeapSizeLimit: 36000 } })),
    })
    const result = monitor.getSnapshot()
    expect(result.knownBytes).toBe(862)
    expect(result.gpuTextureBytes).toBe(80)
    expect(result.browser.heap?.used).toBe(9000)
    expect(result.media.sourceBytes).toBe(5000)
    expect(result.pool.residentBytes).toBe(128)
    expect(result.project).toMatchObject({ layers: 1, timelines: 1, tracks: 0, keyframes: 0, assets: 1 })
    monitor.setInputs({ ...inputs, scene: { ...scene, layers: [] }, isPlaying: true })
    expect(monitor.getSnapshot()).toMatchObject({ isPlaying: true, project: { layers: 0 } })
    unregister(); pool.dispose()
  })

  it('composes the shared ledger without double counting and keeps protected resources on cleanup', () => {
    const budget = new ResourceBudget({ maxBytes: 1024 }), active = budget.reserve('scratch', 128)!, idle = budget.reserve('preview', 128)!
    idle.commit(); idle.allowReclaim(() => idle.release())
    const pool = { getSnapshot: () => new CanvasSurfacePool({ maxBytes: 0 }).getSnapshot(), clearIdle: vi.fn() }
    const monitor = new ProjectResourceMonitor({ scene: emptyScene(), media: new Map(), isPlaying: false }, {
      budget, pool, canvases: { getSnapshot: () => ({ supported: true, canvas2dBytes: 128, webglBytes: 0, canvas2dCount: 1, webglCount: 0 }) },
    })
    expect(monitor.getSnapshot()).toMatchObject({ knownBytes: 128, budget: { chargedBytes: 256, protectedBytes: 128 } })
    monitor.clearIdle()
    expect(pool.clearIdle).toHaveBeenCalledTimes(1)
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 128, protectedBytes: 128, reclaimableBytes: 0 })
    active.release()
  })
})

it('keeps font policy charges outside known-resource RAM and delegates failed-cleanup retry',async()=>{
  const {FontAssetService}=await import('../../asset/fonts')
  const budget=new ResourceBudget({maxBytes:4*1024**2}),fonts=new FontAssetService({budget,decoder:({alias})=>({alias,ready:Promise.resolve(),dispose(){}})})
  const asset={id:'f',name:'Font',type:'font' as const,url:'fake',metadata:{notes:'family: Brand',filesize:100}}
  const pin=await fonts.acquire(asset)
  const clearIdle=vi.spyOn(fonts,'clearIdle'),scene={...emptyScene(),assets:[asset]}
  const monitor=new ProjectResourceMonitor({scene,media:new Map(),isPlaying:false,audio:()=>({bytes:0,bufferCount:0,pendingCount:0,assets:[]})},{
    fonts,budget,canvases:{getSnapshot:()=>({supported:true,canvas2dBytes:0,webglBytes:0,canvas2dCount:0,webglCount:0})},gpu:new GpuWorkRegistry(),
  })
  expect(monitor.getSnapshot()).toMatchObject({knownBytes:0,fonts:{residency:{protectedBytes:1024**2}},budget:{chargedBytes:1024**2}})
  monitor.clearIdle();expect(clearIdle).toHaveBeenCalledOnce();expect(budget.getSnapshot().chargedBytes).toBe(1024**2)
  pin.release();monitor.clearIdle();expect(budget.getSnapshot().chargedBytes).toBe(0);fonts.dispose()
})
