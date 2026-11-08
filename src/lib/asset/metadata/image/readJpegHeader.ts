import type { HeaderBytes, ImageHeader } from './types'

/** JPEG marker/segment scan up to the first SOF (before entropy decode). APP,
 * tables and comments are skipped by length; no EXIF thumbnail is decoded.
 * Returned dimensions are coded pixels; EXIF rotation/density remains native.
 * Zero-height DNL and SOF beyond the prefix explicitly use native policy.
 * Does not validate entropy, later scans or native decoder intermediates.
 * SOF layout/reference: libjpeg-turbo jdmarker.c get_sof,
 * https://github.com/libjpeg-turbo/libjpeg-turbo/blob/main/src/jdmarker.c
 * O(prefix bytes), O(1) storage, no mutation or retained byte views. */
export function readJpegHeader({ data, complete }: HeaderBytes): ImageHeader {
  const unknown = (): ImageHeader => {
    if (complete) throw new Error('Truncated JPEG frame header.')
    return { format: 'jpeg', width: null, height: null, reason: 'header-limit' }
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let p = 2
  while (p < data.length) {
    if (data[p++] !== 0xff) throw new Error('Invalid JPEG marker framing.')
    while (p < data.length && data[p] === 0xff) p++
    if (p === data.length) return unknown()
    const marker = data[p++]
    if (marker === 0x00 || marker === 0xd8) throw new Error('Invalid JPEG header marker.')
    if (marker === 0xd9 || marker === 0xda) throw new Error('JPEG frame header is missing.')
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue
    if (p + 2 > data.length) return unknown()
    const size = view.getUint16(p)
    if (size < 2) throw new Error('Invalid JPEG segment length.')
    if (p + size > data.length) return unknown()
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (sof) {
      if (size < 8 || size !== 8 + data[p + 7] * 3) throw new Error('Invalid JPEG SOF component length.')
      const height = view.getUint16(p + 3), width = view.getUint16(p + 5)
      if (!width || !data[p + 7]) throw new Error('Invalid JPEG frame dimensions/components.')
      if (!height) return { format: 'jpeg', width: null, height: null, reason: 'native-dimensions' }
      return { format: 'jpeg', width, height }
    }
    p += size
  }
  return unknown()
}
