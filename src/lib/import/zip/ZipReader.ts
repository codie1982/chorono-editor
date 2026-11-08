import { crc32 } from '../../format/checksum'
import { ResourceBudget, ResourceBudgetGroup } from '../../resources/budget'
import { BoundedBinaryReader, type BinaryInputLease } from '../../resources/io'
import { checkImportExecution, type ImportExecution } from '../resources/ImportExecution'
import { ZipDirectory, type ZipDirectoryEntry } from './ZipDirectory'
import { resolveZipLimits, type ZipEntry, type ZipInflater, type ZipReaderOptions } from './types'
export type { ZipEntry, ZipInflater, ZipLimits, ZipReaderOptions } from './types'

/** One borrowed chunk avoids Response(BufferSource)'s implicit binary copy. */
function borrowedStream(data: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream({ start(controller) { controller.enqueue(data); controller.close() } })
}

/** Raw-DEFLATE adapter; browser internals are outside managed buffer estimates.
 * Every yielded byte passes through the bounded owner before retention. */
const nativeInflater: ZipInflater = { decompress(data) {
  return borrowedStream(data).pipeThrough(new DecompressionStream('deflate-raw'))
} }

/** ZIP32 validation and bounded extraction owner. No archive cache is held.
 * Caller owns input through actual extraction settlement and returned leases
 * through release. Output/growth/concurrent leases share a local 256 MiB/8192
 * record ledger and optional host budget. Exact decoded size AND CRC must match
 * before delivery. Refusal never truncates or silently reduces quality.
 * Legacy raw-return methods are bounded handoff adapters, not retained owners;
 * application code uses extractLease/withEntry to charge buffers through use. */
export class ZipReader {
  private readonly limits
  private readonly directory: ZipDirectory
  private readonly reader: BoundedBinaryReader
  private readonly inflater: ZipInflater
  private readonly local = new ResourceBudget({ maxBytes: 256 * 1024 ** 2, maxEntries: 8192 })

  /** Immutable policies/backends; construction performs no data allocation/IO. */
  constructor(options: ZipReaderOptions = {}) {
    this.limits = resolveZipLimits(options)
    this.directory = new ZipDirectory(this.limits)
    this.reader = new BoundedBinaryReader({ maxBytes: this.limits.maxEntryBytes,
      budget: options.budget ? new ResourceBudgetGroup([this.local, options.budget]) : this.local })
    this.inflater = options.inflater ?? nativeInflater
  }

  /** Validate all directory/local ranges in central order without inflation or
   * retaining input. Errors never return a partial directory list. */
  readEntries(buffer: ArrayBuffer): ZipEntry[] { return this.directory.read(buffer) }

  /** Return owned compact output; re-read authoritative directory metadata rather
   * than trusting forged/stale descriptors. Borrowed input must remain unchanged
   * through settlement. Caller releases success; every error cleans output up. */
  async extractLease(buffer: ArrayBuffer, entry: ZipEntry, execution?: ImportExecution): Promise<BinaryInputLease> {
    checkImportExecution(execution)
    const validated = this.directory.read(buffer).find(e => e.name === entry.name && e.localHeaderOffset === entry.localHeaderOffset)
    if (!validated || validated.method !== entry.method || validated.compressedSize !== entry.compressedSize || validated.uncompressedSize !== entry.uncompressedSize || validated.crc32 !== entry.crc32 || validated.flags !== entry.flags) throw new Error('ZIP entry descriptor does not match this archive.')
    return this.decode(buffer, validated, execution)
  }

  /** Borrow output through actual callback settlement. A late abort rejects
   * before delivery. Persistent callback outputs need independent ownership. */
  async withEntry<T>(buffer: ArrayBuffer, entry: ZipEntry, work: (data: Uint8Array<ArrayBuffer>) => T | Promise<T>, execution?: ImportExecution): Promise<T> {
    const lease = await this.extractLease(buffer, entry, execution)
    try { const result = await work(new Uint8Array(lease.buffer)); checkImportExecution(execution); return result }
    finally { lease.release() }
  }

  /** Bounded compatibility handoff; charge ends on return, caller owns retention.
   * No copy/force-GC. @deprecated Use extractLease/withEntry in application code. */
  async extract(buffer: ArrayBuffer, entry: ZipEntry, execution?: ImportExecution): Promise<Uint8Array> {
    const lease = await this.extractLease(buffer, entry, execution)
    try { return new Uint8Array(lease.buffer) } finally { lease.release() }
  }

  /** Central-order compatibility batch handoff, skipping directories. All partial
   * output leases remain admitted together until handoff; errors/abort release
   * the entire batch. Actual aggregate bytes cannot exceed maxTotalBytes and
   * each output must match its declaration. @deprecated Caller-owned retention
   * after return is outside this extraction scope. */
  async readAll(buffer: ArrayBuffer, execution?: ImportExecution): Promise<Map<string, Uint8Array>> {
    checkImportExecution(execution)
    const entries = this.directory.read(buffer), leases: BinaryInputLease[] = [], out = new Map<string, Uint8Array>()
    let total = 0
    try {
      for (const entry of entries) {
        if (entry.name.endsWith('/')) continue
        const lease = await this.decode(buffer, entry, execution); leases.push(lease)
        total += lease.byteLength
        if (total > this.limits.maxTotalBytes) throw new RangeError('ZIP actual aggregate output exceeds the byte limit.')
        out.set(entry.name, new Uint8Array(lease.buffer))
      }
      checkImportExecution(execution); return out
    } finally { leases.forEach(lease => lease.release()) }
  }

  /** Local diagnostics overlap host/reader policy; never add the totals. */
  getSnapshot() { return this.local.getSnapshot() }

  /** Bounded reader owns native read/cancel settlement. Archive views are
   * borrowed; output is delivered only after exact length and CRC verification. */
  private async decode(buffer: ArrayBuffer, entry: ZipDirectoryEntry, execution?: ImportExecution): Promise<BinaryInputLease> {
    checkImportExecution(execution)
    const compressed = new Uint8Array(buffer, entry.dataStart, entry.compressedSize)
    const stream = entry.method === 0 ? borrowedStream(compressed) : this.inflater.decompress(compressed)
    const input = await this.reader.readResponse(new Response(stream), execution)
    try {
      checkImportExecution(execution)
      if (input.byteLength !== entry.uncompressedSize) throw new Error('ZIP actual decoded size differs from its directory.')
      if (crc32(new Uint8Array(input.buffer)) !== entry.crc32) throw new Error('ZIP entry CRC mismatch.')
      return input
    } catch (error) { input.release(); throw error }
  }
}

/** Private/local default; application composition injects the editor ledger. */
export const zipReader = new ZipReader()
