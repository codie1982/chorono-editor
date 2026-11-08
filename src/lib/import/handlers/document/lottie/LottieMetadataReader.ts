import { ResourceBudget, ResourceBudgetGroup, type ResourceAllocator } from '../../../../resources/budget'
import { BoundedBinaryReader, BoundedTextReader, type BinaryInputReader, type TextInputReader } from '../../../../resources/io'
import { checkImportExecution, type ImportExecution } from '../../../resources/ImportExecution'
import { ZipReader } from '../../../zip'
import { parseLottieMetadata, type LottieMetadata } from './LottieMetadataConverter'

/** Narrow metadata port; implementations reject resource/cancellation failures,
 * return null only for missing animation JSON or invalid JSON metadata. */
export interface LottieMetadataLoader {
  read(file: File, format: 'json' | 'dotlottie', execution?: ImportExecution): Promise<LottieMetadata | null>
}
export interface LottieMetadataReaderOptions {
  budget?: ResourceAllocator
  inputReader?: BinaryInputReader
  zipReader?: ZipReader
  maxInputBytes?: number
}

/** Owns bounded original-file and decoded ZIP-entry scopes through metadata
 * conversion. Temporary UTF-16 text reserves 2×input bytes before decoding.
 * File/ZIP/text charges share one 256 MiB/8192 local policy and optional host
 * ledger. Native stream/decompress and JSON.parse internals remain outside
 * explicit-buffer accounting. No source URL/cache/scene mutation is owned.
 * Concurrent reads share byte policy; overall job scheduling belongs to import. */
export class LottieMetadataReader implements LottieMetadataLoader {
  private readonly input: BinaryInputReader
  private readonly zip: ZipReader
  private readonly text: TextInputReader
  private readonly budget: ResourceAllocator
  private readonly maxInputBytes: number

  /** Resolve policies/dependencies without reading data or starting native work. */
  constructor(options: LottieMetadataReaderOptions = {}) {
    this.maxInputBytes = options.maxInputBytes ?? 128 * 1024 ** 2
    if (!Number.isSafeInteger(this.maxInputBytes) || this.maxInputBytes <= 0 || this.maxInputBytes > 0x7fffffff) throw new RangeError('Invalid Lottie input byte limit.')
    const local = new ResourceBudget({ maxBytes: 256 * 1024 ** 2, maxEntries: 8192 })
    this.budget = options.budget ? new ResourceBudgetGroup([local, options.budget]) : local
    this.text = new BoundedTextReader({ budget: this.budget, maxInputBytes: this.maxInputBytes })
    this.input = options.inputReader ?? new BoundedBinaryReader({ maxBytes: this.maxInputBytes, budget: this.budget })
    this.zip = options.zipReader ?? new ZipReader({ budget: this.budget, maxArchiveBytes: this.maxInputBytes })
  }

  /** Read actual file stream bytes; reject size before IO when known. Borrowed
   * File storage is separate from managed transient buffers. Errors/abort always
   * release original and decoded leases after actual native settlement. */
  async read(file: File, format: 'json' | 'dotlottie', execution?: ImportExecution): Promise<LottieMetadata | null> {
    checkImportExecution(execution)
    if (file.size > this.maxInputBytes) throw new RangeError('Lottie file exceeds the input byte limit.')
    const input = await this.input.readResponse(new Response(file.stream(), { headers: { 'content-length': String(file.size) } }), execution)
    try {
      checkImportExecution(execution)
      if (format === 'json') return await this.parse(new Uint8Array(input.buffer), execution)
      const entries = this.zip.readEntries(input.buffer)
      const anim = entries.find(e => /animations\/.*\.json$/i.test(e.name))
        ?? entries.find(e => e.name.toLowerCase().endsWith('.json') && e.name !== 'manifest.json')
      if (!anim) return null
      return await this.zip.withEntry(input.buffer, anim, data => this.parse(data, execution), execution)
    } finally { input.release() }
  }

  /** UTF-8 input can require at most two UTF-16 storage bytes per input byte.
   * This is a text policy estimate, not JSON object/native decoder accounting.
   * Refusal happens before TextDecoder/JSON.parse, never via a silent fallback. */
  private async parse(data: Uint8Array, execution?: ImportExecution): Promise<LottieMetadata | null> {
    const result = await this.text.withBytes(data, parseLottieMetadata, { ...execution, label: 'Lottie metadata text' })
    checkImportExecution(execution)
    return result
  }
}
