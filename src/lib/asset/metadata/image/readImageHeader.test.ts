import { describe, expect, it } from 'vitest'
import { readImageHeader } from './readImageHeader'
import { jpegHeader, pngHeader, updatePngChecksum, webpHeader } from '../__tests__/imageHeaders'

/** Exercise the public signature dispatcher; fixture bytes contain headers only,
 * so success asserts metadata bounds, never complete-file/native validity. */
function read(data: Uint8Array, complete = true) { return readImageHeader({ data, complete }) }

describe('bounded image header algorithms', () => {
  it('reads PNG through offset views without mutating or retaining source bytes', () => {
    const bytes = pngHeader(1234, 5678), padded = new Uint8Array(40); padded.set(bytes, 3)
    const header = read(padded.subarray(3, 36))
    expect(header).toEqual({ format: 'png', width: 1234, height: 5678 })
    expect(Array.from(padded.subarray(3, 36))).toEqual(Array.from(bytes))
    padded.fill(0); expect(header.width).toBe(1234)
  })

  it('rejects a PNG checksum error rather than silently attempting a native fallback', () => {
    const bytes = pngHeader(20, 30); bytes[16] ^= 1
    expect(() => read(bytes)).toThrow('checksum')
  })

  it.each([[0, 1], [1, 0], [0x80000000, 1]])('rejects invalid PNG dimensions %i×%i', (width, height) => {
    expect(() => read(pngHeader(width, height))).toThrow('dimensions')
  })

  it('rejects invalid PNG encoding even with a valid recomputed checksum', () => {
    const bytes = pngHeader(20, 30); bytes[24] = 4; updatePngChecksum(bytes)
    expect(() => read(bytes)).toThrow('encoding')
    const truncated = pngHeader(20, 30).subarray(0, 20)
    expect(() => read(truncated, false)).toThrow('Truncated PNG')
  })

  it.each([0xc0, 0xc2, 0xc3])('skips JPEG APP segments and reads SOF marker %i', marker => {
    expect(read(jpegHeader(4097, 257, marker))).toEqual({ format: 'jpeg', width: 4097, height: 257 })
  })

  it('distinguishes a JPEG prefix limit from a complete truncated file and DNL geometry', () => {
    const prefix = jpegHeader(20, 30).subarray(0, 15)
    expect(read(prefix, false)).toMatchObject({ format: 'jpeg', width: null, reason: 'header-limit' })
    expect(() => read(prefix)).toThrow('Truncated JPEG')
    expect(read(jpegHeader(20, 0))).toMatchObject({ width: null, reason: 'native-dimensions' })
  })

  it('rejects JPEG component/segment framing and a scan without any SOF', () => {
    const bytes = jpegHeader(20, 30); bytes[17] = 4
    expect(() => read(bytes)).toThrow('component length')
    expect(() => read(new Uint8Array([255, 216, 255, 225, 0, 1]))).toThrow('segment length')
    expect(() => read(new Uint8Array([255, 216, 255, 218]))).toThrow('missing')
  })

  it('reads extended WebP canvas pixels and rejects impossible canvas products', () => {
    const payload = new Uint8Array(10); payload.set([0, 1, 0], 4); payload.set([255, 0, 0], 7)
    expect(read(webpHeader('VP8X', payload))).toEqual({ format: 'webp', width: 257, height: 256 })
    payload.fill(255, 4); expect(() => read(webpHeader('VP8X', payload))).toThrow('product')
  })

  it('reads lossless and lossy WebP packed dimensions, including odd chunk padding', () => {
    const lossless = new Uint8Array(5); lossless[0] = 0x2f
    new DataView(lossless.buffer).setUint32(1, 321 + (122 << 14), true)
    expect(read(webpHeader('VP8L', lossless))).toMatchObject({ width: 322, height: 123 })
    const lossy = new Uint8Array([0, 0, 0, 0x9d, 1, 0x2a, 0x23, 1, 0x45, 2])
    expect(read(webpHeader('VP8 ', lossy))).toMatchObject({ width: 291, height: 581 })
    lossless[4] |= 0x20
    expect(() => read(webpHeader('VP8L', lossless))).toThrow('version')
  })

  it('honors WebP RIFF bounds and distinguishes incomplete prefixes', () => {
    const bytes = webpHeader('VP8X', new Uint8Array(10))
    const prefix = bytes.subarray(0, 25)
    expect(read(prefix, false)).toMatchObject({ reason: 'header-limit' })
    expect(() => read(prefix)).toThrow('RIFF size')
    new DataView(bytes.buffer).setUint32(16, 11, true)
    expect(() => read(bytes)).toThrow('bounds')
  })

  it('uses the GIF logical screen for both signatures, rejecting zero-size screens', () => {
    for (const signature of ['GIF87a', 'GIF89a']) {
      const bytes = new Uint8Array(13); bytes.set(new TextEncoder().encode(signature))
      bytes.set([0x23, 1, 0x45, 2], 6)
      expect(read(bytes)).toEqual({ format: 'gif', width: 291, height: 581 })
      bytes[6] = 0; bytes[7] = 0; expect(() => read(bytes)).toThrow()
    }
  })

  it('keeps unsupported formats explicit, without trusting file extensions or MIME', () => {
    for (const bytes of [new Uint8Array(), new TextEncoder().encode('<svg width="500000"/>'), new TextEncoder().encode('ftypavif')]) {
      expect(read(bytes)).toEqual({ format: 'opaque', width: null, height: null, reason: 'unsupported-format' })
    }
  })
})
