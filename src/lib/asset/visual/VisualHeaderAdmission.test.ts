import { describe, expect, it, vi } from 'vitest'
import { VisualAssetService } from './VisualAssetService'
import { ResourceBudget } from '../../resources/budget'
import type { Asset } from '../../types'
import type { VisualResource } from './types'
import type { ImageMetadataSource } from '../metadata/ImageMetadataReader'
import type { ImageHeader } from '../metadata/image/types'

/** Test admission independently of browser decode. Authored 1×1 dimensions are
 * deliberately wrong, ensuring only supported encoded headers bound allocation. */
const asset: Asset = { id: 'source', name: 'source', url: 'image', type: 'image', width: 1, height: 1 }
function headers(header: ImageHeader): ImageMetadataSource {
  return { readUrl: vi.fn(async () => header), readBlob: vi.fn(async () => header) }
}
function decoded(width = 4, height = 4): VisualResource {
  return { element: {} as HTMLImageElement, width, height, ready: Promise.resolve(), dispose: vi.fn() }
}

describe('viewport image allocation admission', () => {
  it('rejects oversized encoded metadata before invoking a native decoder', async () => {
    const decoder = vi.fn(() => decoded()), budget = new ResourceBudget({ maxBytes: 1024 })
    const service = new VisualAssetService({ budget, decoder, imageMetadata: headers({ format: 'png', width: 32768, height: 32768 }) })
    await expect(service.acquire(asset)).rejects.toThrow('pixel')
    expect(decoder).not.toHaveBeenCalled(); expect(budget.getSnapshot().chargedBytes).toBe(0); service.dispose()
  })

  it('grows authored estimates from headers before native construction and preserves orientation swaps', async () => {
    const budget = new ResourceBudget({ maxBytes: 128 }), native = decoded(4, 8)
    const service = new VisualAssetService({ budget, imageMetadata: headers({ format: 'png', width: 8, height: 4 }), decoder: () => {
      expect(budget.getSnapshot().chargedBytes).toBe(128); return native
    } })
    const lease = await service.acquire(asset)
    expect(lease.value).toBe(native); expect(service.getSnapshot().residency.chargedBytes).toBe(128)
    lease.release(); service.dispose(); expect(budget.getSnapshot().chargedBytes).toBe(0)
  })

  it('refuses header growth or opaque policy that cannot fit instead of trusting tiny scene metadata', async () => {
    const budget = new ResourceBudget({ maxBytes: 63 }), decoder = vi.fn(() => decoded())
    const service = new VisualAssetService({ budget, decoder, imageMetadata: headers({ format: 'png', width: 4, height: 4 }) })
    await expect(service.acquire(asset)).rejects.toThrow('budget'); expect(decoder).not.toHaveBeenCalled(); service.dispose()
    const opaque = new VisualAssetService({ budget, decoder, imageMetadata: headers({ format: 'opaque', width: null, height: null }) })
    await expect(opaque.acquire(asset)).rejects.toThrow('budget'); expect(decoder).not.toHaveBeenCalled(); opaque.dispose()
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })

  it('rejects mismatched native geometry and releases the original admitted policy', async () => {
    const native = decoded(8, 8), budget = new ResourceBudget({ maxBytes: 1024 })
    const service = new VisualAssetService({ budget, decoder: () => native, imageMetadata: headers({ format: 'png', width: 4, height: 4 }) })
    await expect(service.acquire(asset)).rejects.toThrow('exceed its supported header')
    expect(native.dispose).toHaveBeenCalledOnce(); expect(budget.getSnapshot().chargedBytes).toBe(0); service.dispose()
  })

  it('never falls back to native decoding when a recognized header or its transport is invalid', async () => {
    const decoder = vi.fn(() => decoded()), metadata = headers({ format: 'png', width: 4, height: 4 })
    vi.mocked(metadata.readUrl).mockRejectedValue(new Error('invalid header checksum'))
    const service = new VisualAssetService({ decoder, imageMetadata: metadata })
    await expect(service.acquire(asset)).rejects.toThrow('checksum')
    expect(decoder).not.toHaveBeenCalled(); expect(service.getSnapshot().residency.chargedBytes).toBe(0); service.dispose()
  })
})
