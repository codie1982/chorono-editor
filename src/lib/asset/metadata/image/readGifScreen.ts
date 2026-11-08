/** GIF87a/89a logical screen header, shared by full GIF framing and image
 * metadata. Requires 13 bytes; rejects zero dimensions. Palette/frame/LZW checks
 * belong to full framing/decoder. No allocation, retained views or mutation.
 * https://www.w3.org/Graphics/GIF/spec-gif89a.txt §§17–18. */
export function readGifScreen(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 13) throw new Error('Truncated GIF block.')
  const signature = String.fromCharCode(...Array.from(bytes.subarray(0, 6)))
  if (signature !== 'GIF87a' && signature !== 'GIF89a') throw new Error('Invalid GIF signature.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint16(6, true), height = view.getUint16(8, true)
  if (!width || !height) throw new Error('GIF logical screen has zero dimensions.')
  return { width, height }
}
