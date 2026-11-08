/**
 * Monotonic visible-document time for benchmark warmup; hidden intervals never
 * satisfy a warmup requirement. Caller supplies timestamps in milliseconds and
 * owns the visibility listener. Holds only scalars, no clock/timer/platform API.
 */
export class VisibleTimeClock {
  private elapsed = 0
  private last: number
  constructor(private visible: boolean, now: number) { this.last = now }

  /** Accumulates the prior visibility interval before changing visibility. */
  setVisible(visible: boolean, now: number): void {
    this.elapsed = this.read(now)
    this.last = now
    this.visible = visible
  }

  /** Reads active elapsed time; the supplied clock must not move backward. */
  read(now: number): number {
    if (!Number.isFinite(now) || now < this.last) throw new RangeError('Non-monotonic visibility clock.')
    return this.elapsed + (this.visible ? now - this.last : 0)
  }
}
