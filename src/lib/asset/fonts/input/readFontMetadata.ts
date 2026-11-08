/** Container facts, not a measurement of FontFace/glyph cache RAM. WOFF2's
 * reference size is advisory: reconstructed glyf/loca sizes may differ. */
export interface FontMetadata {
  readonly format: 'sfnt' | 'woff' | 'woff2'
  readonly encodedBytes: number
  readonly sfntReferenceBytes: number
}

/** Validate supported font container bounds before invoking a native/parser
 * decoder. Does not decompress, validate checksums, glyph programs or typography.
 * SFNT/WOFF table directories must fit the actual input; WOFF2 reconstruction
 * stays explicitly opaque. TTC/unknown containers are not supported by this port.
 * O(table count), O(1) extra storage, immutable borrowed bytes, big-endian units.
 * References: https://learn.microsoft.com/en-us/typography/opentype/spec/otff
 * https://www.w3.org/TR/WOFF/ §4–5; https://www.w3.org/TR/WOFF2/ §3.2. */
export function readFontMetadata(bytes: Uint8Array): FontMetadata {
  if (bytes.byteLength < 12) throw new Error('Truncated font container header.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), signature = view.getUint32(0)
  const encodedBytes = bytes.byteLength
  if ([0x00010000, 0x4f54544f, 0x74727565, 0x74797031].includes(signature)) {
    const count = view.getUint16(4), directoryEnd = 12 + 16 * count
    if (!count || directoryEnd > encodedBytes) throw new Error('Invalid SFNT table directory.')
    let total = directoryEnd
    for (let i = 0; i < count; i++) {
      const entry = 12 + 16 * i, offset = view.getUint32(entry + 8), length = view.getUint32(entry + 12)
      if (length && (offset < directoryEnd || offset + length > encodedBytes)) throw new Error('SFNT table exceeds actual input bounds.')
      total += Math.ceil(length / 4) * 4
    }
    return { format: 'sfnt', encodedBytes, sfntReferenceBytes: total }
  }
  if (signature !== 0x774f4646 && signature !== 0x774f4632) throw new Error('Unsupported font container signature.')
  const woff2 = signature === 0x774f4632, headerSize = woff2 ? 48 : 44
  if (encodedBytes < headerSize) throw new Error('Truncated WOFF header.')
  const count = view.getUint16(12), reference = view.getUint32(16)
  if (view.getUint32(8) !== encodedBytes || view.getUint16(14) !== 0 || !count || !reference) throw new Error('Invalid WOFF length/table count/reserved fields.')
  if (woff2) {
    // totalSfntSize is NOT a decompression bound. Keep it as policy input only.
    if (view.getUint32(20) > encodedBytes - headerSize) throw new Error('WOFF2 compressed stream exceeds actual input.')
    return { format: 'woff2', encodedBytes, sfntReferenceBytes: reference }
  }
  const directoryEnd = 44 + 20 * count
  if (directoryEnd > encodedBytes) throw new Error('Invalid WOFF table directory.')
  let total = 12 + 16 * count
  for (let i = 0; i < count; i++) {
    const entry = 44 + 20 * i, offset = view.getUint32(entry + 4), compressed = view.getUint32(entry + 8), original = view.getUint32(entry + 12)
    if (compressed > original || compressed && (offset < directoryEnd || offset + compressed > encodedBytes)) throw new Error('WOFF table exceeds actual input bounds.')
    total += Math.ceil(original / 4) * 4
  }
  if (total !== reference) throw new Error('WOFF reconstructed table size does not match its header.')
  return { format: 'woff', encodedBytes, sfntReferenceBytes: total }
}

/** Explicit native-font admission policy. Uses actual encoded size and advisory
 * table reconstruction size; neither predicts glyph caches or native copies.
 * WOFF2 reconstruction may exceed its reference; no exact upper bound is claimed. */
export function fontPolicyBytes(metadata: FontMetadata): number {
  return Math.max(1024 ** 2, metadata.encodedBytes * 8, metadata.sfntReferenceBytes)
}
