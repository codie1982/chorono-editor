import { ResourceBudget, ResourceBudgetGroup, type ResourceAllocator, type ResourceCategory, type ResourceReservation } from '../budget'

/** A value is borrowed only while this pin lives. retain creates an independent
 * pin (also for retired entries); duplicate release is harmless. Callers must
 * stop using raw values after release. Access/retain after release throws. */
export interface ResourceLease<T> { readonly value: T; retain(): ResourceLease<T>; release(): void }
export interface ResidentCacheOptions<T> {
  category: ResourceCategory; label: string; maxBytes: number; maxEntries: number
  budget?: ResourceAllocator; maxIdleMs?: number
  /** Synchronous final destruction; on failure the allocation stays charged and
   * quarantined. A retry must be safe after a partially completed destruction. */
  dispose(value: T): void
}
interface Entry<T> { key: string | null; source: string | null; value: T | null; ticket: ResourceReservation; pins: number; releasedAt: number; failed: boolean }

/**
 * Shared residency lifecycle for disposable decoded values. Domain adapters
 * supply identity, measured bytes and a destructor; this class owns pin/retire,
 * idle grace and local+shared admission. ResourceBudget remains the authoritative
 * LRU/eviction algorithm. No DOM/audio types, scene state or source URL disposal
 * are required. Instances share only explicitly injected budget accounting.
 *
 * Reserve before preparation, then admit actual bytes. Failed admission leaves
 * the resource and reservation with the producer. Successful admission transfers
 * value ownership here and returns a delivery pin. clear removes lookups while
 * preserving pinned data/charges. One idle timer releases unneeded data; native
 * cleanup failure is quarantined without an automatic busy retry loop.
 */
export class ResidentResourceCache<T> {
  private readonly entries = new Map<string, Entry<T>>()
  private readonly retained = new Set<Entry<T>>()
  private readonly tickets = new WeakSet<ResourceReservation>()
  private readonly local: ResourceBudget
  private readonly allocator: ResourceAllocator
  private readonly maxIdleMs: number
  private timer?: ReturnType<typeof setTimeout>
  readonly maxBytes: number

  /** No resource is created by construction. Byte/entry validity is delegated to
   * ResourceBudget; grace is finite nonnegative milliseconds (default 2000). */
  constructor(private readonly options: ResidentCacheOptions<T>) {
    this.maxBytes = options.maxBytes; this.maxIdleMs = options.maxIdleMs ?? 2000
    if (!Number.isFinite(this.maxIdleMs) || this.maxIdleMs < 0) throw new RangeError('Invalid resource idle duration.')
    this.local = new ResourceBudget({ maxBytes: this.maxBytes, maxEntries: options.maxEntries })
    this.allocator = new ResourceBudgetGroup(options.budget ? [this.local, options.budget] : [this.local])
  }
  /** Reserve a positive safe byte estimate before native work; not a guarantee
   * about internal decoder copies. Producer releases on failure/transfers via
   * admit. Zero-capacity owners refuse preparation before native construction. */
  reserve(bytes: number, category = this.options.category): ResourceReservation {
    const ticket=this.tryReserve(bytes,category)
    if(!ticket)throw new RangeError(`${this.options.label} preparation exceeds the managed resource budget.`)
    return ticket
  }
  /** Same allocation contract for cooperating bounded readers: capacity refusal
   * is null, invalid sizes/categories still throw. The reader owns ticket
   * commit/release; disposable values continue using admit/discard as before. */
  tryReserve(bytes:number,category=this.options.category):ResourceReservation|null{
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new RangeError('Resource preparation needs a positive safe byte estimate.')
    const ticket = this.allocator.reserve(category, bytes)
    if(ticket)this.tickets.add(ticket)
    return ticket
  }
  /** Transfer an owned resource at its measured positive byte size. null key is
   * a stale generation: existing consumers can use it, but no cache hit can.
   * source is diagnostic identity only; retained retired entries are included. */
  admit(key: string | null, value: T, bytes: number, ticket: ResourceReservation, source = key): ResourceLease<T> {
    if (!this.tickets.has(ticket) || ticket.state !== 'reserved' || !Number.isSafeInteger(bytes) || bytes <= 0 || !ticket.resize(bytes)) {
      throw new RangeError(`Decoded ${this.options.label} exceeds the managed resource budget.`)
    }
    ticket.commit(); this.tickets.delete(ticket)
    const entry: Entry<T> = { key, source, value, ticket, pins: 0, releasedAt: 0, failed: false }
    if (key !== null) { const old = this.entries.get(key); if (old) this.retire(old); this.entries.set(key, entry) }
    this.retained.add(entry); return this.pin(entry)
  }
  /** Destroy a producer's failed/stale value while its reservation still owns
   * the estimated working set. Failure quarantines value and charge for explicit
   * cleanup; it never silently drops accounting for an uncertain native handle.
   * No measured-size claim is made for a failed preparation estimate. */
  discard(value: T, ticket: ResourceReservation, source: string | null = null): void {
    if (!this.tickets.has(ticket) || ticket.state !== 'reserved') throw new Error('Resource reservation is not owned or already transferred.')
    ticket.commit(); this.tickets.delete(ticket)
    const entry: Entry<T> = { key: null, source, value, ticket, pins: 0, releasedAt: 0, failed: false }
    this.retained.add(entry); this.tryDrop(entry)
  }
  /** Cache hit owns one pin; diagnostics/peek never refresh idle lifetime. */
  acquire(key: string): ResourceLease<T> | undefined { const entry = this.entries.get(key); return entry ? this.pin(entry) : undefined }
  /** Remove only the exact current value. Late cancelled delivery cannot evict
   * another generation using the same key; existing consumer pins survive. */
  invalidate(key: string, expected: T): void {
    const entry = this.entries.get(key)
    if (entry?.value === expected) this.retire(entry)
  }
  /** Legacy borrow valid only until the next mutation/reclamation. */
  peek(key: string): T | undefined { return this.entries.get(key)?.value ?? undefined }
  /** Detached diagnostic list, not ownership; caller must not retain the values. */
  values(): T[] { return Array.from(this.retained, entry => entry.value!) }
  /** Sum retained bytes by source, including retired/failed records; no LRU touch. */
  describeSources(): ReadonlyMap<string, number> {
    const result = new Map<string, number>()
    this.retained.forEach(entry => { if (entry.source !== null) result.set(entry.source, (result.get(entry.source) ?? 0) + entry.ticket.bytes) })
    return result
  }
  /** Numeric local accounting overlaps the shared scope; do not add them. */
  getSnapshot() { return { ...this.local.getSnapshot(), retiredEntries: Array.from(this.retained).filter(entry => entry.key === null).length,
    failedEntries: Array.from(this.retained).filter(entry => entry.failed).length } }
  /** Invalidate lookups. Protected values stay alive; failed cleanup remains
   * quarantined/charged rather than throwing halfway through other entries. */
  clear(): void { this.stopTimer(); Array.from(this.entries.values()).forEach(entry => this.retire(entry)) }
  /** Reclaim idle values, retrying each quarantined destructor once explicitly. */
  clearIdle(): void {
    Array.from(this.retained).forEach(entry => { if (entry.failed && !entry.pins) this.tryDrop(entry) })
    this.local.reclaimIdle()
  }
  /** One pin per handle; last release exposes an idle entry or destroys retired
   * data. Destruction errors are visible in diagnostics, never uncharged. */
  private pin(entry: Entry<T>): ResourceLease<T> {
    entry.ticket.protect(); entry.pins++
    let released = false
    const live = () => { if (released || !this.retained.has(entry)) throw new Error('Resource lease has been released.'); return entry.value! }
    return { get value() { return live() }, retain: () => { live(); return this.pin(entry) }, release: () => {
      if (released) return
      released = true; entry.pins--
      if (entry.pins) return
      if (entry.key === null || this.maxIdleMs === 0) { this.tryDrop(entry); return }
      entry.releasedAt = Date.now(); entry.ticket.allowReclaim(() => this.drop(entry)); this.scheduleCleanup()
    } }
  }
  /** Only lookup identity is invalidated while a consumer still owns a pin. */
  private retire(entry: Entry<T>): void { this.unlink(entry); if (!entry.pins) this.tryDrop(entry) }
  /** Remove before disposal so a partially destroyed resource can never be hit. */
  private unlink(entry: Entry<T>): void {
    if (entry.key !== null && this.entries.get(entry.key) === entry) this.entries.delete(entry.key)
    entry.key = null
  }
  /** Dispose before releasing either scope. Reclaimer callers receive failure
   * so ResourceBudget can report it; timer/release callers use tryDrop instead. */
  private drop(entry: Entry<T>): void {
    if (entry.pins) throw new Error('Cannot release a pinned resource.')
    this.unlink(entry); entry.ticket.protect()
    try { this.options.dispose(entry.value!) } catch (error) { entry.failed = true; throw error }
    entry.value = null; this.retained.delete(entry); entry.ticket.release()
    if (!this.retained.size) this.stopTimer()
  }
  /** Quarantine failures without creating unhandled timer/pin-release errors. */
  private tryDrop(entry: Entry<T>): void { try { this.drop(entry) } catch { /* Numeric failedEntries retains the charge. */ } }
  /** One deadline wakeup; failed entries wait for an explicit cleanup retry. */
  private scheduleCleanup(): void {
    if (this.timer !== undefined) return
    let deadline = Infinity
    this.retained.forEach(entry => { if (!entry.pins && !entry.failed) deadline = Math.min(deadline, entry.releasedAt + this.maxIdleMs) })
    if (!Number.isFinite(deadline)) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      const cutoff = Date.now() - this.maxIdleMs
      Array.from(this.retained).forEach(entry => { if (!entry.pins && !entry.failed && entry.releasedAt <= cutoff) this.tryDrop(entry) })
      this.scheduleCleanup()
    }, Math.max(0, deadline - Date.now()))
    this.timer.unref?.()
  }
  /** Active resources need no periodic polling. */
  private stopTimer(): void { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined }
}
