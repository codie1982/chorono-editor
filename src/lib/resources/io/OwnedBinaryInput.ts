import type { ResourceAllocator, ResourceReservation } from '../budget'
import type { BinaryInputLease } from './types'

/** One transient input buffer and its already admitted charge. No cache, source
 * URL, native decoder or scene is owned. Returned buffers are borrowed; logical
 * release drops the private reference, not a promise of immediate GC/OS reclaim.
 * Copy callbacks protect the original through non-abortable conversion; pending
 * release is idempotent and completes after the last callback settles. */
export class OwnedBinaryInput implements BinaryInputLease {
  private releaseRequested = false
  private copies = 0
  private readonly length: number
  /** The producer transfers a compact buffer and committed ticket exactly once. */
  constructor(private data: ArrayBuffer | undefined, private readonly ticket: ResourceReservation,
    private readonly allocator: ResourceAllocator) { this.length = data?.byteLength ?? 0 }

  /** Borrow without copying. Released or natively consumed/detached data cannot
   * be borrowed again; its logical charge still lasts until explicit release. */
  get buffer(): ArrayBuffer {
    if (this.releaseRequested || !this.data) throw new Error('Binary input lease is released.')
    if (this.length > 0 && this.data.byteLength === 0) throw new Error('Binary input buffer was consumed by a native decoder.')
    return this.data
  }
  /** Logical admitted length stays valid even if native decode detaches data. */
  get byteLength(): number { return this.releaseRequested ? 0 : this.length }

  /** Account a simultaneous full-size conversion before invoking caller work.
   * Only the callback owns its output; this reservation ends on actual callback
   * settlement. Failed admission starts no conversion and preserves input. */
  async withCopy<T>(work: (buffer: ArrayBuffer) => T | Promise<T>): Promise<T> {
    const buffer = this.buffer, copy = this.allocator.reserve('input', this.ticket.bytes)
    if (!copy) throw new RangeError('Binary input copy exceeds the managed resource budget.')
    this.copies++
    try { return await work(buffer) }
    finally { copy.release(); this.copies--; this.finishRelease() }
  }

  /** Drop ownership once, deferring while any conversion still borrows input. */
  release(): void { this.releaseRequested = true; this.finishRelease() }

  /** No mutable payload escapes once original and copy scopes have ended. */
  private finishRelease(): void {
    if (!this.releaseRequested || this.copies) return
    this.data = undefined; this.ticket.release()
  }
}
