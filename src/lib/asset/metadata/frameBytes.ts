/** Positive safe pixel dimensions yield RGBA8 bytes; invalid/unknown metadata
 * yields null, never zero admission. This measures one coded/display frame policy,
 * not bit-depth/codec intermediates, native copies or physical memory. */
export function rgbaFrameBytes(width: number | undefined, height: number | undefined): number | null {
  if (width === undefined || height === undefined) return null
  const bytes = width * height * 4
  return [width, height, bytes].every(Number.isSafeInteger) && width > 0 && height > 0 ? bytes : null
}

/** Validate a supported frame before native construction/first-frame admission.
 * Limits are pixels/bytes, not CSS size; EXIF orientation may swap axes without
 * changing the admitted product. No mutation or retained resource is owned. */
export function requireFrameBytes(width: number, height: number, limits = { maxDimension: 16384, maxFrameBytes: 128 * 1024 ** 2 }, label = 'Visual frame'): number {
  const bytes = rgbaFrameBytes(width, height)
  if (bytes === null) throw new Error(`${label} has invalid pixel dimensions.`)
  if (width > limits.maxDimension || height > limits.maxDimension || bytes > limits.maxFrameBytes) throw new RangeError(`${label} exceeds the pixel byte/dimension limit.`)
  return bytes
}
