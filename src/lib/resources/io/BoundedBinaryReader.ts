import { ResourceBudget, ResourceBudgetGroup, type ResourceAllocator, type ResourceReservation } from '../budget'
import { cancelledJobError } from '../jobs'
import { OwnedBinaryInput } from './OwnedBinaryInput'
import type { BinaryInputReader, BinaryInputLease, BinaryPrefixReader } from './types'

export interface BoundedBinaryReaderOptions {
  /** Actual response bytes, not compressed HTTP wire size; default 128 MiB. */
  maxBytes?: number
  budget?: ResourceAllocator
}

/** Bounded streaming input owner. A geometrically grown single buffer avoids
 * retaining one object per arbitrary network chunk. Growth/compaction admits
 * old+new overlap BEFORE allocating. Local 2×byte-limit / 128 records overlaps
 * an optional host ledger; no cache, original-file storage or timers are added.
 *
 * Transport-provided chunks and browser network/decompression copies are borrowed
 * and outside this owned-buffer estimate. Actual payload limits still reject an
 * oversized chunk before copying it. Content-Length is only an early rejection
 * hint for identity encoding; actual bytes are always checked independently.
 * Source/worker/Blob internals and physical RAM are not bounded by this policy. */
export class BoundedBinaryReader implements BinaryInputReader, BinaryPrefixReader {
  private readonly maxBytes: number
  private readonly local: ResourceBudget
  private readonly allocator: ResourceAllocator

  /** Construction validates immutable finite byte policy and allocates no data. */
  constructor(options: BoundedBinaryReaderOptions = {}) {
    this.maxBytes = options.maxBytes ?? 128 * 1024 ** 2
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes <= 0 || this.maxBytes > 0x7fffffff) throw new RangeError('Invalid binary input byte limit.')
    this.local = new ResourceBudget({ maxBytes: this.maxBytes * 2, maxEntries: 128 })
    this.allocator = options.budget ? new ResourceBudgetGroup([this.local, options.budget]) : this.local
  }

  /** Read one response exclusively. Returned input is compact and immutable by
   * convention until a native decoder consumes it. Abort cancels the body but
   * does not declare native read/cancel complete early. Headers never bypass the
   * actual-byte cap. Empty bodies produce a zero-length buffer with a 1-byte
   * minimum policy charge, preserving the ledger's positive-size contract. Absent
   * streaming capability rejects explicitly instead of allocating unboundedly.
   * Caller release is mandatory on success; errors release all owned storage. */
  readResponse(response: Response, options: { signal?: AbortSignal } = {}): Promise<BinaryInputLease> {
    return this.read(response, options)
  }

  /** Read at most maxBytes prefix bytes, cancelling the remaining body and
   * awaiting actual cancellation before handoff. Large Content-Length is expected
   * here, not a reason to download/reject the whole source. Only owned prefix
   * copies count toward this reader's cap; transport chunks remain borrowed.
   * Prefix bytes do NOT establish a full encoded-file size or validation claim. */
  readPrefix(response: Response, maxBytes: number, options: { signal?: AbortSignal } = {}): Promise<BinaryInputLease> {
    return this.read(response, options, maxBytes)
  }

  /** One authoritative buffer-growth/ownership path for whole and prefix reads. */
  private async read(response: Response, options: { signal?: AbortSignal }, prefix?: number): Promise<BinaryInputLease> {
    const { signal } = options, body = response.body
    if (body === undefined) throw new Error('Bounded binary input requires a streaming response body.')
    const reader = body?.getReader()
    let cancellation: Promise<void> | undefined, success = false
    let ticket: ResourceReservation | null = null
    let input: OwnedBinaryInput | undefined
    let storage: Uint8Array<ArrayBuffer> = new Uint8Array(0), used = 0
    /** Keep cancellation ownership until actual underlying settlement. */
    const cancel = () => { cancellation ??= reader ? reader.cancel(cancelledJobError()) : Promise.resolve(); void cancellation.catch(() => {}) }
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      this.check(signal)
      if (prefix !== undefined && (!Number.isSafeInteger(prefix) || prefix < 1 || prefix > this.maxBytes)) throw new RangeError('Invalid binary prefix byte limit.')
      const limit = prefix ?? this.maxBytes
      if (!response.ok) throw new Error(`HTTP ${response.status}: binary input download failed.`)
      const length = response.headers.get('content-length'), encoding = response.headers.get('content-encoding')?.trim().toLowerCase()
      if (prefix === undefined && (!encoding || encoding === 'identity') && length && /^\d+$/.test(length) && Number(length) > this.maxBytes) throw new RangeError('Binary input exceeds the response byte limit.')
      ticket = this.allocator.reserve('input', 1)
      if (!ticket) throw new RangeError('Binary input exceeds the managed resource budget.')
      while (reader) {
        const result = await reader.read(); this.check(signal)
        if (result.done) break
        const chunk = result.value
        if (!ArrayBuffer.isView(chunk) || chunk.BYTES_PER_ELEMENT !== 1) throw new TypeError('Binary input stream must contain byte chunks.')
        const amount = prefix === undefined ? chunk.byteLength : Math.min(chunk.byteLength, limit - used)
        const next = used + amount
        if (!Number.isSafeInteger(next) || next > limit) throw new RangeError('Binary input exceeds the response byte limit.')
        if (next > storage.byteLength) {
          const capacity = Math.min(limit, Math.max(next, storage.byteLength * 2))
          storage = this.replace(storage, capacity, used, ticket)
        }
        storage.set(chunk.subarray(0, amount), used); used = next
        if (prefix !== undefined && used === prefix) { cancel(); break }
      }
      this.check(signal)
      if (used !== storage.byteLength) storage = this.replace(storage, used, used, ticket)
      if (cancellation) { await cancellation; this.check(signal) }
      ticket.commit()
      input = new OwnedBinaryInput(storage.buffer, ticket, this.allocator)
      storage = new Uint8Array(0); success = true
      return input
    } finally {
      signal?.removeEventListener('abort', cancel)
      if (!success) cancel()
      let cleaned = false
      try {
        try { if (cancellation) await cancellation }
        finally { reader?.releaseLock() }
        cleaned = true
      }
      finally {
        // A result is not transferred until native cleanup also succeeds.
        // If cleanup throws after preparation, no caller can release that result.
        if (!success || !cleaned) {
          storage = new Uint8Array(0)
          if (input) input.release(); else ticket?.release()
        }
      }
    }
  }

  /** Detached policy diagnostics; pending growth overlaps are estimates and
   * must not be added to heap or a host's overlapping allocation ledger. */
  getSnapshot() { return this.local.getSnapshot() }

  /** Admit source+replacement peak, allocate/copy once, then drop old capacity.
   * JS GC may reclaim old storage later; this tracks explicit ownership only. */
  private replace(old: Uint8Array<ArrayBuffer>, size: number, used: number, ticket: ResourceReservation): Uint8Array<ArrayBuffer> {
    if (!ticket.resize(old.byteLength + size)) throw new RangeError('Binary input growth exceeds the managed resource budget.')
    const next = new Uint8Array(size)
    next.set(old.subarray(0, used)); ticket.resize(size)
    return next
  }

  /** Cancellation is checked after each awaited native operation and at handoff. */
  private check(signal?: AbortSignal): void { if (signal?.aborted) throw cancelledJobError() }
}
