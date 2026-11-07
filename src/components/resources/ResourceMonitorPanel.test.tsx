import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { emptyScene } from '@/lib/defaults'
import type { CanvasSurfacePoolSnapshot } from '@/lib/render/resources/CanvasSurfacePool'
import { ProjectResourceMonitor } from '@/lib/resources/monitor/ProjectResourceMonitor'
import ResourceMonitorPanel from './ResourceMonitorPanel'
import { SurfacePoolSection } from './SurfacePoolSection'
import { ComputeResourcesSection } from './ComputeResourcesSection'

it('opens with project-wide scope and accessible categories without inventing total RAM', () => {
  const scene = emptyScene()
  const audio = { getResources: () => ({ bytes: 0, bufferCount: 0, pendingCount: 0, assets: [] }),
    getState: () => ({ contextState: 'idle', masterVolume: 1, meter: { peak: 0, rms: 0, clipped: false },
      loadingAssetIds: [], errors: {}, sources: [] }) }
  const source = new ProjectResourceMonitor({ scene, media: new Map(), isPlaying: false }, {
    canvases: { getSnapshot: () => ({ supported: true, canvas2dBytes: 40 * 1024 ** 2, webglBytes: 0, canvas2dCount: 1, webglCount: 0 }) },
  })
  const html = renderToStaticMarkup(createElement(ResourceMonitorPanel, { scene, assets: new Map(), audio, isPlaying: false, source }))
  for (const text of ['40.0 MiB', 'Genel', 'Medya', 'CPU / GPU', 'Tamponlar', 'Tarayıcı belleği', 'Toplam işlem RAM’i değildir.']) expect(html).toContain(text)
  expect(html).toContain('aria-label="Kaynak kategorileri"')
  expect(html).toContain('aria-pressed="true"')
  const compute = renderToStaticMarkup(createElement(ComputeResourcesSection, { snapshot: source.getSnapshot() }))
  expect(compute).toContain('Beklemede')
  expect(compute).toContain('Tarayıcı sağlamıyor')
})

it('shows shared scratch counters and safe cleanup with the actual injected budget', () => {
  const snapshot: CanvasSurfacePoolSnapshot = {
    maxBytes: 96 * 1024 ** 2, residentBytes: 12 * 1024 ** 2,
    activeBytes: 8 * 1024 ** 2, idleBytes: 4 * 1024 ** 2, peakResidentBytes: 16 * 1024 ** 2,
    activeSurfaces: 2, idleSurfaces: 1, allocations: 7, reuses: 1234, evictions: 4, budgetDenials: 3,
  }
  const onClearIdle = vi.fn()
  const html = renderToStaticMarkup(createElement(SurfacePoolSection, { snapshot, onClearIdle }))
  for (const text of ['12.0 MiB', '96.0 MiB', '8.0 MiB', '4.0 MiB', '16.0 MiB', '12.5%', 'Tahmini · RGBA8', 'Boş yüzeyleri bırak']) expect(html).toContain(text)
  expect(html).toContain('aria-label="Geçici tampon havuzu bütçe kullanımı"')
  expect(onClearIdle).not.toHaveBeenCalled()
})
