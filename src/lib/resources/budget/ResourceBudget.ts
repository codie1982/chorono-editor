import { RESOURCE_CATEGORIES, type ResourceAllocator, type ResourceBudgetSnapshot,
  type ResourceCategory, type ResourceCategoryUsage, type ResourceReservation, type ReservationState } from './types'

interface Allocation {
  id: number; category: ResourceCategory; bytes: number; state: ReservationState; reclaim?: () => void
}

/**
 * Shared admission ledger for explicitly registered runtime allocations. Byte
 * charges are owner-supplied estimates, not process RAM. Pending and resident
 * charges share one limit; protected allocations cannot be reclaimed. Idle LRU
 * order is Map insertion order, refreshed only by owner activity, without clocks,
 * sorting, polling or platform handles. Entry count bounds ledger metadata too.
 *
 * Owners retain resource data and must physically dispose before releasing the
 * charge. A failed/no-op idle disposer stays charged and becomes protected; no
 * hidden over-admission follows a cleanup failure. Reentrant admission during a
 * disposer is refused, so old bytes cannot fund a new allocation before disposal
 * finishes. release/decrease operations remain valid during cleanup. Instances
 * share no state. Snapshots are detached; source IDs/URLs are never recorded.
 */
export class ResourceBudget implements ResourceAllocator {
  private readonly entries = new Map<number, Allocation>()
  private readonly idle = new Map<number, Allocation>()
  private nextId = 0
  private charged = 0
  private reserved = 0
  private reclaimable = 0
  private peak = 0
  private admissions = 0
  private denials = 0
  private reclaims = 0
  private reclaimFailures = 0
  private reclaiming = false
  private readonly maxBytes: number
  private readonly maxEntries: number

  /** Immutable limits use estimated bytes and record count. Zero bytes disables
   * admission; capacity must remain a positive safe integer. No allocation here. */
  constructor(options: { maxBytes: number; maxEntries?: number }) {
    this.maxBytes = options.maxBytes; this.maxEntries = options.maxEntries ?? 4096
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes < 0
      || !Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1) throw new RangeError('Invalid shared resource budget limits.')
  }

  /** Reserve positive integer estimated bytes before work begins. Impossible
   * protected working sets preserve useful idle entries. Valid refusals return
   * null and increment denials; callbacks are consulted only under pressure. */
  reserve(category: ResourceCategory, bytes: number): ResourceReservation | null {
    this.validateBytes(bytes)
    if (!RESOURCE_CATEGORIES.includes(category)) throw new RangeError('Unknown resource budget category.')
    if (!this.makeRoom(bytes, 1)) return null
    const record: Allocation = { id: ++this.nextId, category, bytes: 0, state: 'reserved' }
    this.entries.set(record.id, record); this.charge(record, bytes); this.admissions++
    return {
      get bytes() { return record.bytes }, get state() { return record.state },
      resize: size => this.resize(record, size),
      commit: () => { if (record.state === 'reserved') { this.reserved -= record.bytes; record.state = 'resident' } },
      protect: () => this.protect(record),
      allowReclaim: dispose => this.allowReclaim(record, dispose),
      touch: () => { if (record.reclaim) { this.idle.delete(record.id); this.idle.set(record.id, record) } },
      release: () => this.release(record),
    }
  }

  /** Ask all currently idle owners to dispose. Protected/pending allocations
   * stay valid; callback failures are reported numerically without uncharging
   * uncertain resources. No scene, source, history or active lease is touched. */
  reclaimIdle(): void {
    if (this.reclaiming) return
    for (const record of Array.from(this.idle.values())) this.reclaim(record)
  }

  /** Detached accounting. protected/reclaimable partition charged bytes;
   * resident/reserved are another partition and must not be added again. */
  getSnapshot(): ResourceBudgetSnapshot {
    const categories = {} as Record<ResourceCategory, ResourceCategoryUsage>
    RESOURCE_CATEGORIES.forEach(category => { categories[category] = { residentBytes: 0, reservedBytes: 0, reclaimableBytes: 0, entries: 0 } })
    this.entries.forEach(record => {
      const usage = categories[record.category]
      usage.entries++; usage[record.state === 'reserved' ? 'reservedBytes' : 'residentBytes'] += record.bytes
      if (record.reclaim) usage.reclaimableBytes += record.bytes
    })
    return { maxBytes: this.maxBytes, maxEntries: this.maxEntries, chargedBytes: this.charged,
      residentBytes: this.charged - this.reserved, reservedBytes: this.reserved,
      protectedBytes: this.charged - this.reclaimable, reclaimableBytes: this.reclaimable,
      availableBytes: this.maxBytes - this.charged, peakBytes: this.peak, entries: this.entries.size,
      admissions: this.admissions, denials: this.denials, reclaims: this.reclaims, reclaimFailures: this.reclaimFailures, categories }
  }

  /** Charge a delta against the record's current phase and idle classification. */
  private charge(record: Allocation, delta: number): void {
    record.bytes += delta; this.charged += delta
    if (record.state === 'reserved') this.reserved += delta
    if (record.reclaim) this.reclaimable += delta
    this.peak = Math.max(this.peak, this.charged)
  }
  /** Invalid byte requests are programming errors, distinct from capacity refusal. */
  private validateBytes(bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new RangeError('Resource allocation bytes must be a positive safe integer.')
  }
  /** Resize reserves a growth delta BEFORE owner allocation. Failed growth keeps
   * the existing charge. A released handle returns false and cannot resurrect. */
  private resize(record: Allocation, bytes: number): boolean {
    this.validateBytes(bytes)
    if (!this.entries.has(record.id)) return false
    const delta = bytes - record.bytes
    if (delta > 0 && !this.makeRoom(delta, 0, record)) return false
    if (!this.entries.has(record.id)) return false
    this.charge(record, delta)
    return true
  }
  /** Active work removes the idle callback before any resource mutation. */
  private protect(record: Allocation): void {
    if (!record.reclaim) return
    this.reclaimable -= record.bytes; this.idle.delete(record.id); record.reclaim = undefined
  }
  /** Only completed resources can become idle; repeat calls refresh global LRU. */
  private allowReclaim(record: Allocation, dispose: () => void): void {
    if (record.state === 'released') return
    if (record.state !== 'resident') throw new Error('Pending allocations cannot be reclaimed before completion.')
    if (typeof dispose !== 'function') throw new TypeError('Resource disposer must be a function.')
    if (!record.reclaim) this.reclaimable += record.bytes
    record.reclaim = dispose; this.idle.delete(record.id); this.idle.set(record.id, record)
  }
  /** The owner has disposed physical storage. Duplicate release is harmless. */
  private release(record: Allocation): void {
    if (record.state === 'released') return
    this.charge(record, -record.bytes); this.idle.delete(record.id); this.entries.delete(record.id)
    record.reclaim = undefined; record.state = 'released'
  }
  /** Refuse nested admission and impossible protected sets before eviction;
   * pressure scans at most the bounded idle snapshot. Fits are O(1). */
  private makeRoom(bytes: number, count: number, excluded?: Allocation): boolean {
    const idleBytes = this.reclaimable - (excluded?.reclaim ? excluded.bytes : 0)
    const idleCount = this.idle.size - Number(!!excluded?.reclaim)
    if (this.reclaiming || bytes > this.maxBytes - (this.charged - idleBytes)
      || count > this.maxEntries - (this.entries.size - idleCount)) { this.denials++; return false }
    const fits = () => bytes <= this.maxBytes - this.charged && count <= this.maxEntries - this.entries.size
    if (!fits()) for (const record of Array.from(this.idle.values())) {
      if (record !== excluded) this.reclaim(record)
      if (fits()) break
    }
    if (!fits()) { this.denials++; return false }
    return true
  }
  /** Keep the charge until the owner releases it. Failure/no-op leaves a
   * protected record rather than pretending its storage disappeared. */
  private reclaim(record: Allocation): void {
    const dispose = record.reclaim
    if (!dispose || record.state === 'released') return
    this.protect(record); this.reclaiming = true
    let failed = false
    try { dispose() } catch { failed = true }
    finally { this.reclaiming = false }
    if (!this.entries.has(record.id)) this.reclaims++
    else { this.protect(record); failed = true }
    if (failed) this.reclaimFailures++
  }
}
