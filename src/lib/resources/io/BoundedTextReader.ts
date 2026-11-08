import { ResourceBudget, ResourceBudgetGroup, type ResourceAllocator } from '../budget'
import { cancelledJobError } from '../jobs'
import { BoundedBinaryReader } from './BoundedBinaryReader'
import type { BinaryInputReader } from './types'

export interface TextReadOptions {
  signal?: AbortSignal
  /** Simultaneous full UTF-16 representations; default 1. A sanitizer that
   * retains original/intermediate/replacement strings may request more. */
  copies?: number
  /** Diagnostic only; does not affect accounting or serialized source data. */
  label?: string
}
/** Borrowed text exists through actual callback settlement. Returning/retaining
 * the string or byte view outside the callback violates this transient scope.
 * Independently owned outputs (e.g. a parsed scene/source lease) may escape;
 * consumers own their final cancellation/discard/publication checks. */
export interface TextInputReader {
  withBlob<T>(blob: Blob, work: (text: string) => T | Promise<T>, options?: TextReadOptions): Promise<T>
  withBytes<T>(bytes: Uint8Array, work: (text: string) => T | Promise<T>, options?: TextReadOptions): Promise<T>
}
export interface BoundedTextReaderOptions {
  budget?: ResourceAllocator
  /** Actual UTF-8 input bytes, default 64 MiB; independent of text copy policy. */
  maxInputBytes?: number
  /** Injected adapters must enforce their own actual-byte cap. Returned lengths
   * are also checked before decoding; default input reader enforces this limit
   * during streaming, before copying oversized actual data. */
  inputReader?: BinaryInputReader
}

/** Owns encoded input + UTF-16 policy reservations through conversion. Reuses
 * BoundedBinaryReader for actual streaming/growth/cancel ownership. Each instance
 * has a 256 MiB/8192-record local ledger overlapping an optional host budget;
 * concurrent callbacks share that ledger. Blob storage, TextDecoder internals,
 * parsed JSON/DOM objects and eventual GC/physical RAM are not exact accounting.
 * No files/strings/results are cached, and no queue/timer is created here. */
export class BoundedTextReader implements TextInputReader {
  private readonly input: BinaryInputReader
  private readonly budget: ResourceAllocator
  private readonly maxInputBytes: number

  /** Resolve immutable byte policy without IO. Private adapters are borrowed. */
  constructor(options: BoundedTextReaderOptions = {}) {
    this.maxInputBytes = options.maxInputBytes ?? 64 * 1024 ** 2
    if (!Number.isSafeInteger(this.maxInputBytes) || this.maxInputBytes < 1 || this.maxInputBytes > 0x7fffffff) throw new RangeError('Invalid text input byte limit.')
    const local = new ResourceBudget({ maxBytes: 256 * 1024 ** 2, maxEntries: 8192 })
    this.budget = options.budget ? new ResourceBudgetGroup([local, options.budget]) : local
    this.input = options.inputReader ?? new BoundedBinaryReader({ maxBytes: this.maxInputBytes, budget: this.budget })
  }

  /** Reject known oversized/pre-aborted files before opening a stream. Actual
   * bytes still pass through the binary cap. Input survives async conversion,
   * even if cancellation occurs while the callback cannot stop immediately. */
  async withBlob<T>(blob: Blob, work: (text: string) => T | Promise<T>, options: TextReadOptions = {}): Promise<T> {
    this.check(options.signal)
    if (blob.size > this.maxInputBytes) throw new RangeError('Text input exceeds the input byte limit.')
    this.textCopies(options)
    const input = await this.input.readResponse(new Response(blob.stream(), { headers: { 'content-length': String(blob.size) } }), options)
    try { return await this.withBytes(new Uint8Array(input.buffer), work, options) }
    finally { input.release() }
  }

  /** Decode borrowed UTF-8 using Blob.text-compatible replacement/BOM behavior.
   * UTF-8 needs at most 2 UTF-16 storage bytes per input byte. Reservation occurs
   * before TextDecoder, and includes requested simultaneous text copies. The
   * caller owns the byte lease across this entire callback. Final abort after
   * an owned output returns is the consumer's responsibility; this reader does
   * not throw away an output it cannot dispose. All transient charges release
   * after real callback settlement, including throws and aborted legacy work. */
  async withBytes<T>(bytes: Uint8Array, work: (text: string) => T | Promise<T>, options: TextReadOptions = {}): Promise<T> {
    this.check(options.signal)
    if (bytes.byteLength > this.maxInputBytes) throw new RangeError('Text input exceeds the input byte limit.')
    const charge = Math.max(1, bytes.byteLength * 2 * this.textCopies(options))
    const text = this.budget.reserve('input', charge)
    if (!text) throw new RangeError(`${options.label ?? 'Input text'} exceeds the managed resource budget.`)
    try {
      const value = new TextDecoder().decode(bytes)
      this.check(options.signal)
      return await work(value)
    } finally { text.release() }
  }

  /** Validate before decoding; the finite copy count bounds policy arithmetic. */
  private textCopies(options: TextReadOptions): number {
    const copies = options.copies ?? 1
    if (!Number.isSafeInteger(copies) || copies < 1 || copies > 16) throw new RangeError('Invalid text copy policy.')
    return copies
  }
  /** Shared cancellation error, with no claim of native/GC completion. */
  private check(signal?: AbortSignal): void { if (signal?.aborted) throw cancelledJobError() }
}
