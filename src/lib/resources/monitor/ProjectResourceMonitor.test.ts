import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { CanvasSurfacePool } from '@/lib/render/resources/CanvasSurfacePool'
import { BrowserMemoryReader } from '../memory/BrowserMemoryReader'
import { GpuWorkRegistry } from '../performance/GpuWorkRegistry'
import { RenderWorkMonitor } from '../performance/RenderWorkMonitor'
import { ProjectResourceMonitor } from './ProjectResourceMonitor'

describe('project resource composition', () => {
  it('keeps overlapping heap/pool/source-file bytes out of the known-resource sum and updates scene counts', () => {
    const scene = emptyScene()
    scene.layers = [newRectLayer()]
    scene.timelines = [newTimeline()]
    scene.assets = [{ id: 'image', name: 'Image', type: 'image', url: 'image', metadata: { filesize: 5000 } }]
    const pool = new CanvasSurfacePool()
    const getSnapshot = () => ({ ...pool.getSnapshot(), residentBytes: 128, activeBytes: 128 })
    const gpu = new GpuWorkRegistry()
    const unregister = gpu.register({ setSampling() {}, getSnapshot: () => ({ backend: 'test', contextLost: false,
      bufferBytes: 100, stagingBytes: 10, drawCalls: 1, lastInstances: 1, lastDrawAt: 1,
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
    expect(result.knownBytes).toBe(782)
    expect(result.browser.heap?.used).toBe(9000)
    expect(result.media.sourceBytes).toBe(5000)
    expect(result.pool.residentBytes).toBe(128)
    expect(result.project).toMatchObject({ layers: 1, timelines: 1, tracks: 0, keyframes: 0, assets: 1 })
    monitor.setInputs({ ...inputs, scene: { ...scene, layers: [] }, isPlaying: true })
    expect(monitor.getSnapshot()).toMatchObject({ isPlaying: true, project: { layers: 0 } })
    unregister(); pool.dispose()
  })
})
