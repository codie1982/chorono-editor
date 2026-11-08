import { crc32 } from '../../../format/checksum/crc32'
import type { ImageHeader } from './types'

/** IHDR dimensions and CRC after the dispatcher validates the PNG signature.
 * Caller must supply that recognized signature. Does not
 * validate IDAT, APNG frames or color metadata. Positive 31-bit dimensions and
 * valid depth/color/compression/filter/interlace combinations are required.
 * https://www.w3.org/TR/png-3/#11IHDR (and §5 CRC). O(1), no retained byte view. */
export function readPngHeader(data: Uint8Array): ImageHeader {
  if (data.length < 33) throw new Error('Truncated PNG IHDR.')
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) throw new Error('PNG IHDR must be the first 13-byte chunk.')
  if (crc32(data.subarray(12, 29)) !== view.getUint32(29)) throw new Error('PNG IHDR checksum mismatch.')
  const width = view.getUint32(16), height = view.getUint32(20), depth = data[24], color = data[25]
  const validDepth = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [2, 4, 6].includes(color) ? [8, 16] : []
  if (!width || !height || width > 0x7fffffff || height > 0x7fffffff || !validDepth.includes(depth)
    || data[26] !== 0 || data[27] !== 0 || data[28] > 1) throw new Error('Invalid PNG IHDR dimensions/encoding.')
  return { format: 'png', width, height }
}
