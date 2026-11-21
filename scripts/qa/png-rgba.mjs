import { inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/**
 * Decodes a non-interlaced 8-bit RGBA PNG emitted by Chorono render_preview.
 *
 * The QA harness deliberately owns this narrow decoder instead of adding a
 * production dependency. Palette, grayscale, 16-bit and interlaced PNGs fail
 * explicitly so a renderer output-format change cannot weaken pixel evidence.
 */
export function decodeRgbaPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Expected a PNG byte buffer.')
  }
  let offset = 8
  let width = 0
  let height = 0
  const compressed = []
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const start = offset + 8
    const end = start + length
    if (end + 4 > bytes.length) throw new Error(`Truncated PNG chunk: ${type}`)
    if (type === 'IHDR') {
      width = bytes.readUInt32BE(start)
      height = bytes.readUInt32BE(start + 4)
      const bitDepth = bytes[start + 8]
      const colorType = bytes[start + 9]
      const interlace = bytes[start + 12]
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`)
      }
    } else if (type === 'IDAT') {
      compressed.push(bytes.subarray(start, end))
    } else if (type === 'IEND') {
      break
    }
    offset = end + 4
  }
  if (!width || !height || compressed.length === 0) throw new Error('PNG is missing IHDR or IDAT data.')
  const scanlines = inflateSync(Buffer.concat(compressed))
  const stride = width * 4
  if (scanlines.length !== (stride + 1) * height) throw new Error('Unexpected PNG scanline length.')
  const output = Buffer.allocUnsafe(stride * height)
  for (let y = 0; y < height; y++) {
    const inputStart = y * (stride + 1)
    const filter = scanlines[inputStart]
    for (let x = 0; x < stride; x++) {
      const raw = scanlines[inputStart + 1 + x]
      const left = x >= 4 ? output[y * stride + x - 4] : 0
      const up = y > 0 ? output[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= 4 ? output[(y - 1) * stride + x - 4] : 0
      output[y * stride + x] = (raw + filterPredictor(filter, left, up, upLeft)) & 0xff
    }
  }
  return { width, height, data: output }
}

/**
 * Compare two renderer PNGs without color-management or resampling.
 *
 * An optional integer region limits evidence to a known interior. This is used
 * to distinguish internal fracture seams from the source silhouette's normal
 * image-vs-triangle antialiasing phase.
 */
export function compareRgbaPngs(leftBytes, rightBytes, options = {}) {
  const left = decodeRgbaPng(leftBytes)
  const right = decodeRgbaPng(rightBytes)
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(`PNG dimensions differ: ${left.width}×${left.height} vs ${right.width}×${right.height}`)
  }
  const region = options.region ?? { x: 0, y: 0, width: left.width, height: left.height }
  if (![region.x, region.y, region.width, region.height].every(Number.isSafeInteger)
    || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
    || region.x + region.width > left.width || region.y + region.height > left.height) {
    throw new Error('PNG comparison region must be a positive integer rectangle inside the image.')
  }
  let changedPixelCount = 0
  let changedChannelCount = 0
  let maxChannelDelta = 0
  let totalChannelDelta = 0
  let minX = left.width
  let minY = left.height
  let maxX = -1
  let maxY = -1
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const offset = (y * left.width + x) * 4
    let pixelChanged = false
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(left.data[offset + channel] - right.data[offset + channel])
      if (!delta) continue
      pixelChanged = true
      changedChannelCount++
      totalChannelDelta += delta
      maxChannelDelta = Math.max(maxChannelDelta, delta)
    }
    if (pixelChanged) {
      changedPixelCount++
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
    }
  }
  const comparedPixelCount = region.width * region.height
  return {
    width: left.width,
    height: left.height,
    region,
    comparedPixelCount,
    changedPixelCount,
    changedPixelRatio: changedPixelCount / comparedPixelCount,
    changedChannelCount,
    maxChannelDelta,
    meanChangedChannelDelta: changedChannelCount ? totalChannelDelta / changedChannelCount : 0,
    changedBounds: changedPixelCount ? { minX, minY, maxX, maxY } : null,
  }
}

function filterPredictor(filter, left, up, upLeft) {
  if (filter === 0) return 0
  if (filter === 1) return left
  if (filter === 2) return up
  if (filter === 3) return Math.floor((left + up) / 2)
  if (filter === 4) return paeth(left, up, upLeft)
  throw new Error(`Unsupported PNG row filter: ${filter}`)
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const diagonalDistance = Math.abs(estimate - upLeft)
  if (leftDistance <= upDistance && leftDistance <= diagonalDistance) return left
  return upDistance <= diagonalDistance ? up : upLeft
}
