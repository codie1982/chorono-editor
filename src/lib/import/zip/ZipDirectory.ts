import type { ZipEntry, ZipLimits } from './types'

/** Validated extraction range, internal to the ZIP module. */
export interface ZipDirectoryEntry extends ZipEntry { readonly dataStart: number; readonly dataEnd: number }

/** Pure bounded ZIP32 parser: validates ranges before DataView reads, local vs
 * central agreement, descriptors and non-overlapping file ranges. STORE/DEFLATE,
 * UTF-8 names and signed/unsigned ZIP32 descriptors are supported. Encryption,
 * ZIP64, split archives and central signatures explicitly reject. No paths are
 * written to disk. Output preserves central order. O(bytes + n log n), bounded n;
 * range validation sorts a separate array without reordering returned entries.
 * PKWARE APPNOTE 6.3.10 §§4.3.7–9, 4.3.12, 4.3.16:
 * https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT */
export class ZipDirectory {
  constructor(private readonly limits: ZipLimits) {}

  /** Borrow archive bytes synchronously; only immutable names/numbers escape.
   * Declaration/metadata limits reject before inflation, never partial lists. */
  read(buffer: ArrayBuffer): ZipDirectoryEntry[] {
    if (buffer.byteLength > this.limits.maxArchiveBytes) throw new RangeError('ZIP archive exceeds the byte limit.')
    const view = new DataView(buffer), bytes = new Uint8Array(buffer), eocd = this.findEnd(view)
    if (eocd < 0) throw new Error('Invalid ZIP end-of-central-directory record.')
    const count = view.getUint16(eocd + 10, true), size = view.getUint32(eocd + 12, true), start = view.getUint32(eocd + 16, true)
    if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) throw new Error('ZIP64 is not supported.')
    if (view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true) || view.getUint16(eocd + 8, true) !== count) throw new Error('Split ZIP archives are not supported.')
    if (count > this.limits.maxEntries) throw new RangeError('ZIP entry count exceeds the limit.')
    this.range(start, size, eocd)
    if (start + size !== eocd || count * 46 > size) throw new Error('Invalid ZIP central-directory extent.')
    const entries: ZipDirectoryEntry[] = [], names = new Set<string>()
    let ptr = start, total = 0
    for (let i = 0; i < count; i++) {
      this.range(ptr, 46, eocd)
      if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error('Invalid ZIP central-directory signature.')
      const flags = view.getUint16(ptr + 8, true), method = view.getUint16(ptr + 10, true)
      this.features(flags, method, view.getUint16(ptr + 6, true))
      const compressedSize = view.getUint32(ptr + 20, true), uncompressedSize = view.getUint32(ptr + 24, true), localHeaderOffset = view.getUint32(ptr + 42, true)
      if ([compressedSize, uncompressedSize, localHeaderOffset].includes(0xffffffff)) throw new Error('ZIP64 is not supported.')
      if (view.getUint16(ptr + 34, true)) throw new Error('Split ZIP entries are not supported.')
      if (uncompressedSize > this.limits.maxEntryBytes) throw new RangeError('ZIP entry exceeds the decoded byte limit.')
      total += uncompressedSize
      if (total > this.limits.maxTotalBytes) throw new RangeError('ZIP aggregate decoded bytes exceed the limit.')
      const nameLength = view.getUint16(ptr + 28, true), extraLength = view.getUint16(ptr + 30, true), commentLength = view.getUint16(ptr + 32, true)
      this.range(ptr + 46, nameLength + extraLength + commentLength, eocd)
      const nameBytes = bytes.subarray(ptr + 46, ptr + 46 + nameLength), name = this.name(nameBytes)
      if (names.has(name)) throw new Error('Duplicate ZIP entry path.')
      names.add(name)
      this.extra(view, ptr + 46 + nameLength, extraLength)
      const descriptor = { name, method, compressedSize, uncompressedSize, localHeaderOffset, flags, crc32: view.getUint32(ptr + 16, true) }
      const range = this.local(view, bytes, descriptor, nameBytes, start)
      if (name.endsWith('/') && uncompressedSize) throw new Error('ZIP directory entry contains file data.')
      entries.push(Object.freeze({ ...descriptor, ...range }))
      ptr += 46 + nameLength + extraLength + commentLength
    }
    if (ptr !== eocd) throw new Error('ZIP central-directory size/count mismatch.')
    const ordered = entries.slice().sort((a, b) => a.localHeaderOffset - b.localHeaderOffset)
    for (let i = 1; i < ordered.length; i++) if (ordered[i].localHeaderOffset < ordered[i - 1].dataEnd) throw new Error('Overlapping ZIP entry ranges.')
    return entries
  }

  /** Match a terminal EOCD and its exact comment length, not an arbitrary payload
   * signature. ZIP32's maximum comment bounds this backward scan. */
  private findEnd(view: DataView): number {
    for (let i = view.byteLength - 22, min = Math.max(0, view.byteLength - 22 - 65535); i >= min; i--) {
      if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === view.byteLength) return i
    }
    return -1
  }

  /** Validate payload/descriptor from central sizes, including bit-3 files with
   * zero local sizes. Returned dataEnd includes descriptors for overlap checks. */
  private local(view: DataView, bytes: Uint8Array, entry: ZipEntry, name: Uint8Array, end: number): { dataStart: number; dataEnd: number } {
    const p = entry.localHeaderOffset
    this.range(p, 30, end)
    if (view.getUint32(p, true) !== 0x04034b50) throw new Error('Invalid ZIP local-header signature.')
    this.features(view.getUint16(p + 6, true), view.getUint16(p + 8, true), view.getUint16(p + 4, true))
    if (view.getUint16(p + 6, true) !== entry.flags || view.getUint16(p + 8, true) !== entry.method) throw new Error('ZIP local/central flags or method mismatch.')
    const nameLength = view.getUint16(p + 26, true), extraLength = view.getUint16(p + 28, true)
    this.range(p + 30, nameLength + extraLength, end)
    if (name.length !== nameLength || name.some((b, i) => b !== bytes[p + 30 + i])) throw new Error('ZIP local/central name mismatch.')
    this.extra(view, p + 30 + nameLength, extraLength)
    const dataStart = p + 30 + nameLength + extraLength
    this.range(dataStart, entry.compressedSize, end)
    let dataEnd = dataStart + entry.compressedSize
    if (entry.method === 0 && entry.compressedSize !== entry.uncompressedSize) throw new Error('ZIP stored size mismatch.')
    if (entry.flags & 8) {
      this.range(dataEnd, 12, end)
      // A CRC can equal the optional signature: prefer a matching unsigned triple.
      if (!this.descriptorMatches(view, dataEnd, entry)) {
        this.range(dataEnd, 16, end)
        if (view.getUint32(dataEnd, true) !== 0x08074b50 || !this.descriptorMatches(view, dataEnd + 4, entry)) throw new Error('ZIP data descriptor mismatch.')
        dataEnd += 4
      }
      dataEnd += 12
    } else if (!this.descriptorMatches(view, p + 14, entry)) throw new Error('ZIP local/central size or CRC mismatch.')
    return { dataStart, dataEnd }
  }
  /** Compare CRC/size triples; caller validates the 12-byte range first. */
  private descriptorMatches(view: DataView, p: number, entry: ZipEntry): boolean {
    return view.getUint32(p, true) === entry.crc32 && view.getUint32(p + 4, true) === entry.compressedSize && view.getUint32(p + 8, true) === entry.uncompressedSize
  }
  /** Avoid silent subarray truncation and incidental DataView errors. */
  private range(offset: number, size: number, end: number): void {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset > end || size > end - offset) throw new Error('Truncated or invalid ZIP byte range.')
  }
  /** Report unsupported encryption/patched/reserved flags as capability errors. */
  private features(flags: number, method: number, version: number): void {
    if (version >= 45) throw new Error('ZIP64 or newer ZIP features are not supported.')
    if (flags & ~0x080e || (method === 0 && flags & 6)) throw new Error('Unsupported ZIP encryption or flags.')
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method ${method}.`)
  }
  /** Reject malformed extra fields and non-sentinel ZIP64 extensions. */
  private extra(view: DataView, start: number, size: number): void {
    const end = start + size
    for (let p = start; p < end;) {
      this.range(p, 4, end)
      if (view.getUint16(p, true) === 1) throw new Error('ZIP64 extra fields are not supported.')
      const length = view.getUint16(p + 2, true); this.range(p + 4, length, end); p += 4 + length
    }
  }
  /** Preserve UTF-8 behavior, rejecting invalid encoding instead of introducing
   * replacement-character collisions. Exact names, no normalization/case folding. */
  private name(bytes: Uint8Array): string {
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (!name || name.startsWith('/') || /[\\:\u0000-\u001f]/.test(name) || name.split('/').some(x => x === '..' || x === '.')) throw new Error('Unsafe or empty ZIP entry path.')
    return name
  }
}
