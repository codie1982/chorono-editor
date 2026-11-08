import type { HeaderBytes, ImageHeader } from './types'

/** RIFF/WebP canvas (VP8X) or first VP8/VP8L frame dimensions, without pixels.
 * Chunk offsets honor padding and declared RIFF bounds. This is not entropy,
 * animation-frame or ICC validation. Unknown reconstruction chunks remain native.
 * https://developers.google.com/speed/webp/docs/riff_container and
 * https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification
 * O(prefix chunk count), O(1) storage; dimensions are unrotated canvas pixels. */
export function readWebpHeader({ data, complete }: HeaderBytes): ImageHeader {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const unknown = (): ImageHeader => {
    if (complete) throw new Error('Truncated WebP image header.')
    return { format: 'webp', width: null, height: null, reason: 'header-limit' }
  }
  if (data.length < 12) return unknown()
  const end = view.getUint32(4, true) + 8
  if (end < 12 || complete && end > data.length) throw new Error('Invalid WebP RIFF size.')
  const uint24 = (p: number) => data[p] + data[p + 1] * 256 + data[p + 2] * 65536
  for (let p = 12; p < end;) {
    if (p + 8 > data.length) return unknown()
    const kind = String.fromCharCode(...Array.from(data.subarray(p, p + 4))), size = view.getUint32(p + 4, true), body = p + 8
    if (body + size > end) throw new Error('WebP chunk exceeds declared RIFF bounds.')
    if (kind === 'VP8X') {
      if (size !== 10) throw new Error('Invalid WebP VP8X header size.')
      if (body + 10 > data.length) return unknown()
      const width = uint24(body + 4) + 1, height = uint24(body + 7) + 1
      if (width * height > 0xffffffff) throw new Error('Invalid WebP canvas product.')
      return { format: 'webp', width, height }
    }
    if (kind === 'VP8L') {
      if (size < 5) throw new Error('Invalid WebP VP8L header size.')
      if (body + 5 > data.length) return unknown()
      const bits = view.getUint32(body + 1, true)
      if (data[body] !== 0x2f || bits >>> 29 !== 0) throw new Error('Invalid WebP lossless signature/version.')
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: (bits >>> 14 & 0x3fff) + 1 }
    }
    if (kind === 'VP8 ') {
      if (size < 10) throw new Error('Invalid WebP VP8 header size.')
      if (body + 10 > data.length) return unknown()
      if (data[body] & 1 || data[body + 3] !== 0x9d || data[body + 4] !== 1 || data[body + 5] !== 0x2a) throw new Error('Invalid WebP key-frame header.')
      const width = view.getUint16(body + 6, true) & 0x3fff, height = view.getUint16(body + 8, true) & 0x3fff
      if (!width || !height) throw new Error('Invalid WebP frame dimensions.')
      return { format: 'webp', width, height }
    }
    p = body + size + (size & 1)
  }
  return unknown()
}
