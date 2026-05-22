// ── ZipWriter ─────────────────────────────────────────────────────────────────
//
// BL-83 — minimal, dependency-free ZIP writer using STORE (no compression).
// PNG/JPEG/WEBP frames are already compressed, so deflate would add CPU cost
// for ~0 size benefit. STORE keeps the bundle free of a zip library and the
// format trivial: per-file local header + data, then a central directory and
// the end-of-central-directory record.
//
// Spec: PKWARE APPNOTE — sections 4.3.7 (local header), 4.3.12 (central dir),
// 4.3.16 (EOCD). All multi-byte fields are little-endian.

const LOCAL_SIG   = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG    = 0x06054b50
const VERSION     = 20 // 2.0 — needed for STORE

// ── CRC-32 (IEEE 802.3 polynomial 0xEDB88320) ──────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

interface Entry {
  nameBytes: Uint8Array
  crc: number
  size: number
  offset: number
}

/**
 * Accumulates files and produces a STORE-mode ZIP Blob.
 *
 *   const zip = new ZipWriter()
 *   zip.add('frame_0001.png', bytes)
 *   const blob = zip.finish()
 */
export class ZipWriter {
  private parts: Uint8Array[] = []
  private entries: Entry[] = []
  private offset = 0
  private encoder = new TextEncoder()

  add(name: string, data: Uint8Array): void {
    const nameBytes = this.encoder.encode(name)
    const crc = crc32(data)
    const offset = this.offset

    const header = new Uint8Array(30 + nameBytes.length)
    const v = new DataView(header.buffer)
    v.setUint32(0, LOCAL_SIG, true)
    v.setUint16(4, VERSION, true)
    v.setUint16(6, 0, true)            // general purpose flags
    v.setUint16(8, 0, true)            // method 0 = store
    v.setUint16(10, 0, true)           // mod time
    v.setUint16(12, 0, true)           // mod date
    v.setUint32(14, crc, true)
    v.setUint32(18, data.length, true) // compressed size
    v.setUint32(22, data.length, true) // uncompressed size
    v.setUint16(26, nameBytes.length, true)
    v.setUint16(28, 0, true)           // extra field length
    header.set(nameBytes, 30)

    this.parts.push(header, data)
    this.offset += header.length + data.length
    this.entries.push({ nameBytes, crc, size: data.length, offset })
  }

  finish(): Blob {
    const central: Uint8Array[] = []
    let centralSize = 0

    for (const e of this.entries) {
      const rec = new Uint8Array(46 + e.nameBytes.length)
      const v = new DataView(rec.buffer)
      v.setUint32(0, CENTRAL_SIG, true)
      v.setUint16(4, VERSION, true)    // version made by
      v.setUint16(6, VERSION, true)    // version needed
      v.setUint16(8, 0, true)          // flags
      v.setUint16(10, 0, true)         // method store
      v.setUint16(12, 0, true)         // mod time
      v.setUint16(14, 0, true)         // mod date
      v.setUint32(16, e.crc, true)
      v.setUint32(20, e.size, true)    // compressed size
      v.setUint32(24, e.size, true)    // uncompressed size
      v.setUint16(28, e.nameBytes.length, true)
      v.setUint16(30, 0, true)         // extra length
      v.setUint16(32, 0, true)         // comment length
      v.setUint16(34, 0, true)         // disk number start
      v.setUint16(36, 0, true)         // internal attrs
      v.setUint32(38, 0, true)         // external attrs
      v.setUint32(42, e.offset, true)  // local header offset
      rec.set(e.nameBytes, 46)
      central.push(rec)
      centralSize += rec.length
    }

    const centralOffset = this.offset
    const eocd = new Uint8Array(22)
    const v = new DataView(eocd.buffer)
    v.setUint32(0, EOCD_SIG, true)
    v.setUint16(4, 0, true)                       // disk number
    v.setUint16(6, 0, true)                       // disk with central dir
    v.setUint16(8, this.entries.length, true)     // entries on this disk
    v.setUint16(10, this.entries.length, true)    // total entries
    v.setUint32(12, centralSize, true)
    v.setUint32(16, centralOffset, true)
    v.setUint16(20, 0, true)                       // comment length

    // Cast: Uint8Array is a valid BlobPart at runtime; the cast sidesteps TS's
    // strict ArrayBufferLike vs ArrayBuffer mismatch on the BlobPart union.
    const blobParts = [...this.parts, ...central, eocd] as unknown as BlobPart[]
    return new Blob(blobParts, { type: 'application/zip' })
  }
}
