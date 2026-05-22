// ── ZipReader ─────────────────────────────────────────────────────────────────
//
// Dependency-free ZIP reader. Parses the central directory (correct sizes even
// when local headers use data descriptors) and inflates DEFLATE entries via the
// browser/Node `DecompressionStream('deflate-raw')` — no third-party library.
//
// Used by dotLottie import (BL-07c); reusable for future package formats
// (After Effects packages, .chorono project packages).
//
// Parsing (`readEntries`) is pure + synchronous so it can be unit-tested with a
// hand-built buffer. Inflation (`extract`/`readAll`) is async (streaming).

const SIG_EOCD     = 0x06054b50 // End of central directory
const SIG_CENTRAL  = 0x02014b50 // Central directory file header
const METHOD_STORE = 0
const METHOD_DEFLATE = 8

export interface ZipEntry {
  /** Entry path inside the archive. */
  name: string
  /** Compression method (0 = stored, 8 = deflate). */
  method: number
  compressedSize: number
  uncompressedSize: number
  /** Byte offset of this entry's local file header. */
  localHeaderOffset: number
}

export class ZipReader {
  /**
   * Parse the central directory into an entry list. Pure + synchronous.
   * Throws if the EOCD record can't be found (not a ZIP).
   */
  readEntries(buffer: ArrayBuffer): ZipEntry[] {
    const view  = new DataView(buffer)
    const bytes = new Uint8Array(buffer)
    const eocd  = this.findEocd(view, bytes.length)
    if (eocd < 0) throw new Error('Not a ZIP archive (no end-of-central-directory record)')

    const entryCount = view.getUint16(eocd + 10, true)
    let ptr = view.getUint32(eocd + 16, true) // central directory offset

    const entries: ZipEntry[] = []
    for (let i = 0; i < entryCount; i++) {
      if (view.getUint32(ptr, true) !== SIG_CENTRAL) break
      const method           = view.getUint16(ptr + 10, true)
      const compressedSize   = view.getUint32(ptr + 20, true)
      const uncompressedSize = view.getUint32(ptr + 24, true)
      const nameLen          = view.getUint16(ptr + 28, true)
      const extraLen         = view.getUint16(ptr + 30, true)
      const commentLen       = view.getUint16(ptr + 32, true)
      const localHeaderOffset = view.getUint32(ptr + 42, true)
      const name = this.decodeUtf8(bytes.subarray(ptr + 46, ptr + 46 + nameLen))
      entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset })
      ptr += 46 + nameLen + extraLen + commentLen
    }
    return entries
  }

  /** Extract + inflate a single entry to raw bytes. */
  async extract(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
    const view  = new DataView(buffer)
    const bytes = new Uint8Array(buffer)
    const lho   = entry.localHeaderOffset
    // Local header: filename + extra lengths live at offsets 26/28 (these can
    // differ from the central directory's, so re-read them here).
    const nameLen  = view.getUint16(lho + 26, true)
    const extraLen = view.getUint16(lho + 28, true)
    const dataStart = lho + 30 + nameLen + extraLen
    const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize)

    if (entry.method === METHOD_STORE) return compressed.slice()
    if (entry.method === METHOD_DEFLATE) return this.inflateRaw(compressed)
    throw new Error(`Unsupported ZIP compression method ${entry.method} for "${entry.name}"`)
  }

  /** Extract every entry into a name → bytes map. */
  async readAll(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
    const out = new Map<string, Uint8Array>()
    for (const entry of this.readEntries(buffer)) {
      if (entry.name.endsWith('/')) continue // directory
      out.set(entry.name, await this.extract(buffer, entry))
    }
    return out
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private findEocd(view: DataView, length: number): number {
    // EOCD is 22 bytes + optional comment (≤ 65535). Scan backwards.
    const minPos = Math.max(0, length - 22 - 0xffff)
    for (let i = length - 22; i >= minPos; i--) {
      if (view.getUint32(i, true) === SIG_EOCD) return i
    }
    return -1
  }

  private async inflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream('deflate-raw')
    // Cast: TS 5.7's generic Uint8Array<ArrayBufferLike> isn't seen as a BlobPart.
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds)
    const buf = await new Response(stream).arrayBuffer()
    return new Uint8Array(buf)
  }

  private decodeUtf8(bytes: Uint8Array): string {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

export const zipReader = new ZipReader()
