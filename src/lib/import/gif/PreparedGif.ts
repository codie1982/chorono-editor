import type { ResourceReservation } from '../../resources/budget'
import type { DecodedGifSheet, GifMetadata } from './types'

/** One prepared PNG and its admitted output charge. No URL/native canvas/worker
 * is held. Source creation must adopt the Blob independently before release;
 * releasing here does not revoke that source or force native Blob GC. */
export class PreparedGif {
  private released = false
  constructor(readonly metadata: GifMetadata, private value?: DecodedGifSheet, private readonly ticket?: ResourceReservation) {}
  /** Borrow optional PNG until release. Static imports retain original File. */
  get sheet(): DecodedGifSheet | undefined { if (this.released) throw new Error('Prepared GIF is released.'); return this.value }
  /** Idempotently end transient output ownership after adoption/discard. */
  release(): void { if (this.released) return; this.released = true; this.value = undefined; this.ticket?.release() }
}
