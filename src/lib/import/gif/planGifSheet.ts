import type { GifLimits, GifMetadata, GifSheetPlan } from './types'

/** Preserve the existing square-ish packing (ceil(sqrt(n))) without truncating
 * frames or resizing pixels. Checks the padded full canvas, not just n×frame.
 * Encode reservation is a conservative 2×RGBA+64 KiB policy capped by explicit
 * maxOutputBytes; native Blob size is checked again after actual encoding. This
 * is not a proof of a browser encoder's internal/native peak. */
export function planGifSheet(metadata: GifMetadata, limits: GifLimits): GifSheetPlan {
  const { width, height, frameCount } = metadata
  if (![width, height, frameCount].every(x => Number.isSafeInteger(x) && x > 0)) throw new RangeError('Invalid GIF dimensions/frame count.')
  const columns = Math.ceil(Math.sqrt(frameCount)), rows = Math.ceil(frameCount / columns)
  const sheetWidth = columns * width, sheetHeight = rows * height, frameBytes = width * height * 4, sheetBytes = sheetWidth * sheetHeight * 4
  if (frameCount > limits.maxFrames || !Number.isSafeInteger(sheetBytes) || frameBytes > limits.maxFrameBytes
    || sheetBytes > limits.maxSheetBytes || sheetWidth > limits.maxDimension || sheetHeight > limits.maxDimension) throw new RangeError('GIF sprite sheet exceeds the pixel byte/dimension limit.')
  return Object.freeze({ ...metadata, columns, rows, sheetWidth, sheetHeight, frameBytes, sheetBytes,
    encodeReserveBytes: Math.min(limits.maxOutputBytes, sheetBytes * 2 + 65536) })
}
