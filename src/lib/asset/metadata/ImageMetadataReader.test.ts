import { describe, expect, it, vi } from 'vitest'
import { ImageMetadataReader } from './ImageMetadataReader'
import { ResourceBudget } from '../../resources/budget'
import { pngHeader } from './__tests__/imageHeaders'

describe('image header IO ownership', () => {
  it('preserves the platform receiver when storing the browser fetch method',async()=>{
    const original=globalThis.fetch
    vi.stubGlobal('fetch',function(this:typeof globalThis){expect(this).toBe(globalThis);return Promise.resolve(new Response(pngHeader(3,4)))})
    try{
      expect(await new ImageMetadataReader().readUrl('image')).toMatchObject({width:3,height:4})
      expect(await new ImageMetadataReader({fetch:globalThis.fetch}).readUrl('image')).toMatchObject({width:3,height:4})
    }
    finally{vi.stubGlobal('fetch',original);vi.unstubAllGlobals()}
  })
  it('returns scalars from a Blob and drops header ownership on both success and malformed input', async () => {
    const budget = new ResourceBudget({ maxBytes: 1024 }), reader = new ImageMetadataReader({ budget })
    expect(await reader.readBlob(new Blob([pngHeader(12, 34)]))).toEqual({ format: 'png', width: 12, height: 34 })
    expect(budget.getSnapshot().chargedBytes).toBe(0)
    const bad = pngHeader(12, 34); bad[29] ^= 1
    await expect(reader.readBlob(new Blob([bad]))).rejects.toThrow('checksum')
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })

  it('reads/cancels a bounded URL prefix rather than downloading a declared huge source', async () => {
    const budget = new ResourceBudget({ maxBytes: 1024 }), cancel = vi.fn()
    const native = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(pngHeader(56, 78)) }, cancel }, { highWaterMark: 0 })
    const fetcher = vi.fn<typeof fetch>(async () => new Response(native, { headers: { 'content-length': '1000000000' } }))
    const reader = new ImageMetadataReader({ budget, fetch: fetcher, maxHeaderBytes: 33 })
    expect(await reader.readUrl('https://example.test/image')).toEqual({ format: 'png', width: 56, height: 78 })
    expect(fetcher).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce()
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, peakBytes: 33 })
  })

  it('does not start native transport for a pre-aborted request or bypass transport failures', async () => {
    const abort = new AbortController(); abort.abort()
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error('network failed') })
    const reader = new ImageMetadataReader({ fetch: fetcher })
    await expect(reader.readUrl('broken', abort.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await expect(reader.readBlob(new Blob(), abort.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
    await expect(reader.readUrl('broken')).rejects.toThrow('network failed')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('makes unsupported/header-limit policy explicit while releasing every temporary byte', async () => {
    const budget = new ResourceBudget({ maxBytes: 1024 }), reader = new ImageMetadataReader({ budget, maxHeaderBytes: 33 })
    const jpeg = new Uint8Array(100); jpeg.set([255, 216, 255, 225, 0, 98])
    expect(await reader.readBlob(new Blob([jpeg]))).toMatchObject({ format: 'jpeg', width: null, reason: 'header-limit' })
    expect(await reader.readBlob(new Blob(['<svg/>']))).toMatchObject({ format: 'opaque', reason: 'unsupported-format' })
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })
})
