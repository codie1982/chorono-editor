import type { ResourceAllocator, ResourceReservation } from '@/lib/resources/budget'

/** Admission failure is distinct from unavailable hardware. Rendering callers
 * propagate it instead of silently changing quality/backend under pressure. */
export class GpuAdmissionError extends RangeError {
  constructor() { super('GPU working set exceeds the managed resource budget.'); this.name = 'GpuAdmissionError' }
}

/**
 * Owns accounting/lifetime for one mutable GPU workspace, not an LRU cache.
 * ResourceBudget supplies the shared eviction policy. The backend supplies a
 * synchronous idempotent destructor for textures, buffers, programs and staging
 * storage; the owner never touches GL handles itself. Immutable decoded values
 * continue using ResidentResourceCache, whose replacement/pin semantics differ.
 *
 * prepare reserves a complete replacement alongside the old charge before any
 * native mutation, then commits and releases the old estimate. Borrowed results
 * remain protected until the current JS job ends; this covers synchronous
 * Canvas2D composition even when that composition allocates another resource.
 * hold additionally protects a multi-call pass across jobs. Callers must not use
 * a borrowed result after that job, the next backend operation, clear or loss.
 * Idle storage is reclaimable immediately and expires after a bounded grace.
 * Driver copies, shader binaries and deferred physical deletion are unknown.
 */
export class GpuStorageOwner {
  private current?: ResourceReservation
  private pending?: ResourceReservation
  private jobHeld = false
  private pins = 0
  private generation = 0
  private failed = false
  private releasedAt = 0
  private timer?: ReturnType<typeof setTimeout>

  /** Construction allocates no native storage/timer. bytes are positive safe
   * estimates; maxIdleMs is finite, nonnegative and within the timer range. */
  constructor(private readonly budget: ResourceAllocator, private readonly destroyStorage: () => void,
    private readonly maxIdleMs = 2000) {
    if (!Number.isSafeInteger(maxIdleMs) || maxIdleMs < 0 || maxIdleMs > 2147483647) throw new RangeError('Invalid GPU idle duration.')
  }

  /** Protect existing storage or atomically account an allocate/resize callback.
   * Without update the estimate must equal current storage. Denial never calls
   * update. Native failure destroys partial storage before uncharging; failed
   * destruction quarantines BOTH estimates for explicit clear/retry. */
  prepare(bytes: number, update?: () => void): void {
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new RangeError('Invalid GPU storage estimate.')
    if (this.failed) throw new Error('GPU storage cleanup must succeed before reuse.')
    this.current?.protect()
    this.protectJob()
    if (!update) {
      if (!this.current || this.current.bytes !== bytes) throw new Error('GPU storage update callback is required.')
      return
    }
    const ticket = this.budget.reserve('gpu', bytes)
    if (!ticket) throw new GpuAdmissionError()
    this.pending = ticket
    try { update() }
    catch (error) { this.clear(); throw error }
    ticket.commit(); this.current?.release(); this.current = ticket; this.pending = undefined
  }

  /** Independent pass pin; release is idempotent. Context loss/clear invalidates
   * old generations so a late release cannot decrement a restored pass. */
  hold(): () => void {
    if (!this.current || this.failed) throw new Error('GPU storage is not ready.')
    this.current.protect(); this.pins++
    const generation = this.generation
    let active = true
    return () => {
      if (!active) return
      active = false
      if (generation !== this.generation) return
      this.pins--; this.makeIdle()
    }
  }

  /** Force invalidation for context loss/shutdown, or explicit failed-cleanup
   * retry. Valid borrowed outputs must no longer be used. A failed destructor
   * leaves charges protected and prevents reuse; no automatic retry busy loop. */
  clear(): void {
    this.generation++; this.jobHeld = false; this.pins = 0
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.current?.protect(); this.pending?.commit(); this.pending?.protect()
    try { this.destroyStorage() }
    catch { this.failed = true; return }
    this.current?.release(); this.pending?.release()
    this.current = this.pending = undefined; this.failed = false
  }

  /** Detached accounting; bytes overlap the injected ledger, not extra RAM. */
  getSnapshot() { return { bytes: (this.current?.bytes ?? 0) + (this.pending?.bytes ?? 0),
    protected: this.jobHeld || this.pins > 0 || this.failed, failedCleanup: this.failed } }

  /** Explicit unused-resource action also retries quarantined cleanup. Valid
   * current-job/streaming borrowers remain protected; no automatic retry loop. */
  clearIdle(): void { if (this.failed || (!this.jobHeld && !this.pins)) this.clear() }

  /** At most one job-bound release; stale context-loss callbacks cannot idle a
   * newly restored generation. No RAF or per-frame polling is scheduled. */
  private protectJob(): void {
    if (this.jobHeld) return
    this.jobHeld = true
    const generation = this.generation
    queueMicrotask(() => {
      if (generation !== this.generation) return
      this.jobHeld = false; this.makeIdle()
    })
  }

  /** Global pressure uses ResourceBudget's existing LRU; one timer enforces
   * grace even without pressure. Explicit pins survive both paths. */
  private makeIdle(): void {
    if (!this.current || this.jobHeld || this.pins || this.failed) return
    this.releasedAt = Date.now()
    this.current.allowReclaim(() => {
      this.clear()
      if (this.failed) throw new Error('GPU storage cleanup failed.')
    })
    if (this.maxIdleMs === 0) { this.clear(); return }
    this.scheduleCleanup()
  }

  /** Refreshed activity retains the original wakeup, then schedules only the
   * remaining grace. Active passes need no timer until their final release. */
  private scheduleCleanup(): void {
    if (this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.current || this.jobHeld || this.pins || this.failed) return
      if (Date.now() - this.releasedAt >= this.maxIdleMs) this.clear()
      else this.scheduleCleanup()
    }, Math.max(1, this.maxIdleMs - (Date.now() - this.releasedAt)))
    this.timer.unref?.()
  }
}
