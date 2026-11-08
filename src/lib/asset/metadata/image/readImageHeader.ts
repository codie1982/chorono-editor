import { readGifScreen } from './readGifScreen'
import { readJpegHeader } from './readJpegHeader'
import { readPngHeader } from './readPngHeader'
import { readWebpHeader } from './readWebpHeader'
import type { HeaderBytes, ImageHeader } from './types'

/** Recognize supported signatures before native decode, never trusting MIME or
 * asset-authored dimensions as raster bounds. AVIF/SVG/other formats explicitly
 * return opaque policy; no false preallocation guarantee is supplied. Recognized
 * malformed headers reject instead of silently retrying native decoding. */
export function readImageHeader(input: HeaderBytes): ImageHeader {
  const bytes = input.data
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return readPngHeader(bytes)
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpegHeader(input)
  if (bytes.length >= 12 && String.fromCharCode(...Array.from(bytes.subarray(0, 4))) === 'RIFF' && String.fromCharCode(...Array.from(bytes.subarray(8, 12))) === 'WEBP') return readWebpHeader(input)
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(String.fromCharCode(...Array.from(bytes.subarray(0, 6))))) return { format: 'gif', ...readGifScreen(bytes) }
  return { format: 'opaque', width: null, height: null, reason: 'unsupported-format' }
}
