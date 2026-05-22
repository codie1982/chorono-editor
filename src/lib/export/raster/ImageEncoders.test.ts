import { describe, it, expect, vi } from 'vitest'
import {
  encodeCanvas,
  RASTER_MIME,
  RASTER_EXTENSION,
  RASTER_SUPPORTS_ALPHA,
  type RasterFormat,
} from './ImageEncoders'

const FORMATS: RasterFormat[] = ['png', 'webp', 'jpeg']

describe('ImageEncoders — format tables', () => {
  it('every format has a MIME, extension and alpha flag', () => {
    for (const f of FORMATS) {
      expect(RASTER_MIME[f]).toMatch(/^image\//)
      expect(RASTER_EXTENSION[f]).toBeTruthy()
      expect(typeof RASTER_SUPPORTS_ALPHA[f]).toBe('boolean')
    }
  })

  it('maps MIME types correctly', () => {
    expect(RASTER_MIME.png).toBe('image/png')
    expect(RASTER_MIME.webp).toBe('image/webp')
    expect(RASTER_MIME.jpeg).toBe('image/jpeg')
  })

  it('only PNG and WEBP carry alpha; JPEG does not', () => {
    expect(RASTER_SUPPORTS_ALPHA.png).toBe(true)
    expect(RASTER_SUPPORTS_ALPHA.webp).toBe(true)
    expect(RASTER_SUPPORTS_ALPHA.jpeg).toBe(false)
  })

  it('jpeg uses the .jpg extension', () => {
    expect(RASTER_EXTENSION.jpeg).toBe('jpg')
  })
})

describe('ImageEncoders — encodeCanvas (HTMLCanvasElement path)', () => {
  function mockCanvas(blob: Blob | null): HTMLCanvasElement {
    return {
      toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(blob)),
    } as unknown as HTMLCanvasElement
  }

  it('resolves with the produced blob and forwards mime + quality', async () => {
    const blob = new Blob(['x'], { type: 'image/webp' })
    const canvas = mockCanvas(blob)
    const result = await encodeCanvas(canvas, 'webp', 0.5)
    expect(result).toBe(blob)
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.5)
  })

  it('defaults quality to 0.92 when omitted', async () => {
    const canvas = mockCanvas(new Blob(['x']))
    await encodeCanvas(canvas, 'png')
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', 0.92)
  })

  it('rejects when the codec yields no blob', async () => {
    const canvas = mockCanvas(null)
    await expect(encodeCanvas(canvas, 'jpeg')).rejects.toThrow(/encode failed/i)
  })
})
