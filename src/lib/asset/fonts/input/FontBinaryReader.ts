import { BoundedBinaryReader, type BinaryInputLease, type BinaryInputReader } from '../../../resources/io'
import { cancelledJobError } from '../../../resources/jobs'
import type { ResourceAllocator } from '../../../resources/budget'
import { readFontMetadata, type FontMetadata } from './readFontMetadata'

/** Owned encoded input plus detached container facts. release is mandatory;
 * parsers retaining DataViews must keep input alive for their full lifetime. */
export interface FontBinaryInput { readonly input: BinaryInputLease; readonly metadata: FontMetadata }
export interface FontBinarySource {
  readUrl(url: string, signal?: AbortSignal): Promise<FontBinaryInput>
}

/** One bounded full-read port shared by native font and outline parsers. Default
 * actual encoded cap is 32 MiB, independently of Content-Length/File metadata.
 * Input growth/cancellation reuse BoundedBinaryReader, with optional host ledger.
 * No queue, font cache, parser or native registration is owned by this reader. */
export class FontBinaryReader implements FontBinarySource {
  private readonly reader: BinaryInputReader
  private readonly fetcher: typeof fetch
  /** Inject existing IO/platform ports; construction performs no network work. */
  constructor(options: { budget?: ResourceAllocator; reader?: BinaryInputReader; fetch?: typeof fetch; maxBytes?: number } = {}) {
    this.reader = options.reader ?? new BoundedBinaryReader({ budget: options.budget, maxBytes: options.maxBytes ?? 32 * 1024 ** 2 })
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis)
  }
  /** Read and validate before decoder invocation. Errors/abort release every
   * owned byte; successful handoff transfers the input lease to the caller. */
  async readUrl(url: string, signal?: AbortSignal): Promise<FontBinaryInput> {
    if (signal?.aborted) throw cancelledJobError()
    const input = await this.reader.readResponse(await this.fetcher(url, { signal }), { signal })
    try {
      if (signal?.aborted) throw cancelledJobError()
      return { input, metadata: readFontMetadata(new Uint8Array(input.buffer)) }
    } catch (error) { input.release(); throw error }
  }
}
