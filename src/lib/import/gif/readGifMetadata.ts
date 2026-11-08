import { readGifScreen } from '../../asset/metadata/image'
import { requireFrameBytes } from '../../asset/metadata/frameBytes'
import type { GifLimits, GifMetadata } from './types'

/** Scan GIF87a/89a framing before ANY native decode. Validates logical screen,
 * image rectangles, palettes, sub-block extents, trailer and frame count. O(n)
 * time/O(1) auxiliary storage, retaining no per-frame arrays or input reference.
 * LZW pixel correctness/disposal/composition belongs to the native codec. Plain
 * text rendering rejects explicitly (not counted as an image frame). Unknown
 * extensions are skipped by their length-prefixed sub-blocks. Dimensions are
 * logical-screen pixels, including partial image rectangles. No file mutation.
 * Reference: https://www.w3.org/Graphics/GIF/spec-gif89a.txt §§17–27. */
export function readGifMetadata(buffer: ArrayBuffer, limits: GifLimits): GifMetadata {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer)
  let p = 0
  const range = (count: number) => { if (count > bytes.length - p) throw new Error('Truncated GIF block.'); const start = p; p += count; return start }
  range(13)
  if (buffer.byteLength > limits.maxInputBytes) throw new RangeError('GIF input exceeds the byte limit.')
  const { width, height } = readGifScreen(bytes)
  requireFrameBytes(width, height, limits, 'GIF frame')
  if (bytes[10] & 128) range(3 * 2 ** ((bytes[10] & 7) + 1))
  const subBlocks = () => { for (;;) { const size = bytes[range(1)]; if (!size) return; range(size) } }
  let frameCount = 0
  while (p < bytes.length) {
    const kind = bytes[range(1)]
    if (kind === 0x3b) {
      if (!frameCount || p !== bytes.length) throw new Error('GIF has no image frames or has trailing data.')
      return Object.freeze({ width, height, frameCount })
    }
    if (kind === 0x21) {
      const label = bytes[range(1)]
      if (label === 0x01) throw new Error('GIF plain-text rendering is not supported.')
      if (label === 0xf9) {
        if (bytes[range(1)] !== 4) throw new Error('Invalid GIF graphic-control block.')
        range(4); if (bytes[range(1)] !== 0) throw new Error('Invalid GIF graphic-control terminator.')
      } else subBlocks()
      continue
    }
    if (kind !== 0x2c) throw new Error('Unknown GIF block type.')
    const start = range(9), left = view.getUint16(start, true), top = view.getUint16(start + 2, true)
    const w = view.getUint16(start + 4, true), h = view.getUint16(start + 6, true), flags = bytes[start + 8]
    if (!w || !h || left + w > width || top + h > height) throw new Error('GIF image rectangle exceeds its logical screen.')
    if (++frameCount > limits.maxFrames) throw new RangeError('GIF frame count exceeds the limit.')
    if (flags & 128) range(3 * 2 ** ((flags & 7) + 1))
    const codeSize = bytes[range(1)]
    if (codeSize < 2 || codeSize > 8) throw new Error('Invalid GIF LZW code size.')
    subBlocks()
  }
  throw new Error('GIF trailer is missing.')
}
