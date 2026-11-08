import { BoundedBinaryReader, type BinaryPrefixReader } from '../../resources/io'
import type { ResourceAllocator } from '../../resources/budget'
import { cancelledJobError } from '../../resources/jobs'
import { readImageHeader } from './image/readImageHeader'
import type { ImageHeader } from './image/types'

export interface ImageMetadataSource {
  readBlob(blob: Blob, signal?: AbortSignal): Promise<ImageHeader>
  readUrl(url: string, signal?: AbortSignal): Promise<ImageHeader>
}

/** Owns at most a bounded header prefix, not a decoded frame/full encoded file.
 * Default 1 MiB prefix uses existing binary growth/cancel ownership and optional
 * shared budget. Transport-provided chunks/native copies are outside owned-byte
 * accounting. No metadata cache, DOM, worker or job scheduler lives here.
 * Callers supply queue capacity and frame admission before native construction. */
export class ImageMetadataReader implements ImageMetadataSource {
  private readonly reader: BinaryPrefixReader
  private readonly maxHeaderBytes: number
  private readonly fetcher: typeof fetch

  /** Construction validates finite prefix capacity and performs no IO. */
  constructor(options: { budget?: ResourceAllocator; reader?: BinaryPrefixReader; maxHeaderBytes?: number; fetch?: typeof fetch } = {}) {
    this.maxHeaderBytes = options.maxHeaderBytes ?? 1024 ** 2
    if (!Number.isSafeInteger(this.maxHeaderBytes) || this.maxHeaderBytes < 33 || this.maxHeaderBytes > 16 * 1024 ** 2) throw new RangeError('Invalid image header prefix limit.')
    this.reader = options.reader ?? new BoundedBinaryReader({ budget: options.budget, maxBytes: this.maxHeaderBytes })
    // Browser fetch is a platform method; storing it on this owner must not
    // later invoke it with the reader as its native receiver.
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis)
  }

  /** Blob backing is borrowed; actual prefix bytes are bounded independently of
   * declared size. Full encoded-file/native memory is not measured by this read. */
  async readBlob(blob: Blob, signal?: AbortSignal): Promise<ImageHeader> {
    if (signal?.aborted) throw cancelledJobError()
    return this.read(new Response(blob.stream()), signal)
  }

  /** Anonymous/CORS-compatible fetch. Remaining body is cancelled and actually
   * settles before header handoff. Network errors never bypass via native retry. */
  async readUrl(url: string, signal?: AbortSignal): Promise<ImageHeader> {
    if (signal?.aborted) throw cancelledJobError()
    return this.read(await this.fetcher(url, { signal }), signal)
  }

  /** Return scalar metadata only; the borrowed view is released on every path. */
  private async read(response: Response, signal?: AbortSignal): Promise<ImageHeader> {
    const input = await this.reader.readPrefix(response, this.maxHeaderBytes, { signal })
    try {
      if (signal?.aborted) throw cancelledJobError()
      return readImageHeader({ data: new Uint8Array(input.buffer), complete: input.byteLength < this.maxHeaderBytes })
    } finally { input.release() }
  }
}
