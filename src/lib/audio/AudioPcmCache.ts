import type { ResourceAllocator, ResourceReservation } from '../resources/budget'
import { ResidentResourceCache, type ResourceLease } from '../resources/residency'

/** Borrowed PCM is valid only while this lease lives. Each consumer releases
 * exactly once (duplicates are harmless) and stops retaining raw buffer data
 * afterwards. retain forks ownership, including retired entries. No PCM is
 * zeroed on release; the final owner drops references for browser GC. */
export interface AudioPcmLease { readonly buffer: AudioBuffer; retain(): AudioPcmLease; release(): void }
export interface AudioPcmCacheOptions { budget?: ResourceAllocator; maxBytes?: number; maxEntries?: number; maxIdleMs?: number }

/** Adapt the shared residency owner to AudioBuffer's Float32 byte measurement
 * and established buffer-named lease API. Identity, limits and idle behavior are
 * preserved; no PCM/source copies or new eviction algorithm are introduced.
 * AudioBuffer has no destructor; last release drops references for browser GC.
 * Shared admission, pin/retire and timers live in ResidentResourceCache. */
export class AudioPcmCache {
  private readonly owner: ResidentResourceCache<AudioBuffer>
  readonly maxBytes: number
  /** Local default remains 256 MiB/128 allocations, with optional shared limit. */
  constructor(options: AudioPcmCacheOptions = {}) {
    this.maxBytes = options.maxBytes ?? 256 * 1024 ** 2
    this.owner = new ResidentResourceCache({ ...options, category: 'audio', label: 'audio',
      maxBytes: this.maxBytes, maxEntries: options.maxEntries ?? 128, dispose: () => {} })
  }
  /** Reserve an estimated working set before fetch/decode; native internals are
   * not bounded by this estimate. Producer releases on any failed admission. */
  reserve(estimate: number): ResourceReservation { return this.owner.reserve(estimate) }
  /** Reconcile actual Float32 channel bytes and transfer ownership. null key is
   * a retired generation, usable only by its current consumers. */
  admit(url: string | null, buffer: AudioBuffer, ticket: ResourceReservation, sourceUrl = url): AudioPcmLease {
    return this.wrap(this.owner.admit(url, buffer, buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT, ticket, sourceUrl))
  }
  /** A cache hit creates a protected consumer; no new PCM allocation. */
  acquire(url: string): AudioPcmLease | undefined { const lease = this.owner.acquire(url); return lease ? this.wrap(lease) : undefined }
  /** Invalidate only this exact decoded buffer; newer same-source data survives. */
  invalidate(url: string, buffer: AudioBuffer): void { this.owner.invalidate(url, buffer) }
  /** Legacy raw borrow ends at the next mutation/reclamation. */
  peek(url: string): AudioBuffer | undefined { return this.owner.peek(url) }
  /** Numeric source-byte inventory includes retired pins without refreshing LRU. */
  describeSources(): ReadonlyMap<string, number> { return this.owner.describeSources() }
  /** Diagnostic raw values for service dedupe only, never ownership. */
  buffers(): AudioBuffer[] { return this.owner.values() }
  /** Local accounting overlaps the shared scope and is not added to it. */
  getSnapshot() { return this.owner.getSnapshot() }
  /** Invalidate lookup while keeping live consumer pins/reservations charged. */
  clear(): void { this.owner.clear() }
  /** Reclaim idle PCM; never stop independent playback pins. */
  clearIdle(): void { this.owner.clearIdle() }
  /** Preserve the public buffer-named lease without duplicating pin logic. */
  private wrap(lease: ResourceLease<AudioBuffer>): AudioPcmLease {
    return { get buffer() { return lease.value }, retain: () => this.wrap(lease.retain()), release: () => lease.release() }
  }
}
