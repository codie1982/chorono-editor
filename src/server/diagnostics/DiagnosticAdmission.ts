/** Global bounded ingress gate. It retains no IP, UA, user or request body.
 * Limits process-wide minute starts and simultaneous active body/IO jobs;
 * neither idle timers nor an unbounded network-identity map is created. */
export class DiagnosticAdmission {
  private windowAt = -1
  private started = 0
  private active = 0

  constructor(private readonly limit = 120, private readonly concurrent = 4,
    private readonly clock: () => number = Date.now) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000 ||
      !Number.isSafeInteger(concurrent) || concurrent < 1 || concurrent > 32) throw new RangeError('Invalid diagnostic admission limits.')
  }

  /** Acquire one release-once slot or reject. A backwards/invalid clock cannot
   * reset the rate window; it safely rejects rather than enlarging the budget. */
  acquire(): { release(): void } | undefined {
    let now: number
    try { now = this.clock() } catch { return }
    if (!Number.isSafeInteger(now) || now < 0 || now < this.windowAt) return
    if (this.windowAt < 0 || now - this.windowAt >= 60_000) { this.windowAt = now; this.started = 0 }
    if (this.active >= this.concurrent || this.started >= this.limit) return
    this.active++; this.started++
    let released = false
    return { release: () => { if (!released) { released = true; this.active-- } } }
  }
}
