import { crc32 } from '../../../format/checksum/crc32'

/** Header-only fixtures, deliberately not decodable image files. Dimensions can
 * be enormous without allocating pixels; native browser tests use real codecs. */
export function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33), view = new DataView(bytes.buffer)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); view.setUint32(8, 13)
  view.setUint32(12, 0x49484452); view.setUint32(16, width); view.setUint32(20, height)
  bytes[24] = 8; bytes[25] = 6; updatePngChecksum(bytes)
  return bytes
}

/** Recompute IHDR CRC after an intentional header mutation, separating checksum
 * rejection from dimension/encoding validation in the tested public dispatcher. */
export function updatePngChecksum(bytes: Uint8Array): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(29, crc32(bytes.subarray(12, 29)))
}

/** One RGB SOF after an APP segment, with dimensions big-endian as in JPEG.
 * No scan/entropy data is included. marker selects baseline/progressive SOF. */
export function jpegHeader(width: number, height: number, marker = 0xc0): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 12, 34, 0xff, marker,
    0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3,
    1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0])
}

/** RIFF envelope with one padded chunk; caller supplies the header payload. */
export function webpHeader(kind: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(20 + payload.length + (payload.length & 1)), view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode('RIFF')); view.setUint32(4, bytes.length - 8, true)
  bytes.set(new TextEncoder().encode('WEBP' + kind), 8); view.setUint32(16, payload.length, true)
  bytes.set(payload, 20); return bytes
}
