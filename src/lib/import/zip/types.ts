import type { ResourceAllocator } from '../../resources/budget'

/** Immutable ZIP32 central-directory metadata; offsets are archive-relative.
 * A descriptor never grants permission to read unchecked offsets. */
export interface ZipEntry {
  readonly name: string
  readonly method: number
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly localHeaderOffset: number
  readonly crc32: number
  readonly flags: number
}

/** Rejection policies in bytes/counts. These bound explicitly owned buffers,
 * not native decompressor internals, parsed JSON objects or whole process RAM. */
export interface ZipLimits {
  readonly maxArchiveBytes: number
  readonly maxEntryBytes: number
  readonly maxTotalBytes: number
  readonly maxEntries: number
}

/** Backend borrows compressed bytes until its stream settles/cancels. It must
 * not detach/mutate input. Unsupported platforms throw; no unbounded fallback. */
export interface ZipInflater { decompress(data: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array> }
export interface ZipReaderOptions extends Partial<ZipLimits> {
  budget?: ResourceAllocator
  inflater?: ZipInflater
}

/** Resolve finite ZIP32 policies once; source data never selects its limits. */
export function resolveZipLimits(options: Partial<ZipLimits>): ZipLimits {
  const limits: ZipLimits = { maxArchiveBytes: options.maxArchiveBytes ?? 128 * 1024 ** 2,
    maxEntryBytes: options.maxEntryBytes ?? 64 * 1024 ** 2,
    maxTotalBytes: options.maxTotalBytes ?? 128 * 1024 ** 2, maxEntries: options.maxEntries ?? 4096 }
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > (name === 'maxEntries' ? 65534 : 0x7fffffff)) throw new RangeError(`Invalid ZIP policy: ${name}.`)
  }
  return Object.freeze(limits)
}
