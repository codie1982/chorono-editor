export interface SimulationClockOptions {
  readonly durationMs: number
  readonly stepHz: number
  readonly sampleFps: number
}

/**
 * Immutable integer-tick clock shared by bounded 2D simulation adapters.
 *
 * Time starts at zero. The first sample is tick zero and the final sample is
 * the exact duration tick. This initial implementation requires both duration
 * and output sampling to align exactly with the fixed step, avoiding hidden
 * fractional ticks or frame-rate-dependent drift.
 */
export class SimulationClock {
  readonly durationMs: number
  readonly stepHz: number
  readonly sampleFps: number
  readonly stepDurationMs: number
  readonly totalTicks: number
  readonly sampleStrideTicks: number
  readonly sampleCount: number

  constructor(options: SimulationClockOptions) {
    const { durationMs, stepHz, sampleFps } = options
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError('Simulation duration must be positive and finite')
    if (!Number.isSafeInteger(stepHz) || stepHz < 1 || stepHz > 1000) throw new RangeError('Simulation step rate is invalid')
    if (!Number.isSafeInteger(sampleFps) || sampleFps < 1 || sampleFps > 240) throw new RangeError('Simulation sample rate is invalid')
    if (stepHz % sampleFps !== 0) throw new RangeError('Simulation sample rate must divide the fixed step rate')
    const ticks = durationMs * stepHz / 1000
    if (!Number.isSafeInteger(ticks) || ticks < 1) throw new RangeError('Simulation duration must align to an integer fixed-step tick')
    this.durationMs = durationMs
    this.stepHz = stepHz
    this.sampleFps = sampleFps
    this.stepDurationMs = 1000 / stepHz
    this.totalTicks = ticks
    this.sampleStrideTicks = stepHz / sampleFps
    this.sampleCount = ticks / this.sampleStrideTicks + 1
    if (!Number.isSafeInteger(this.sampleCount)) throw new RangeError('Simulation sample schedule is invalid')
  }

  /** Returns whether a post-step tick belongs in the output clip. */
  isSampleTick(tick: number): boolean {
    return Number.isSafeInteger(tick) && tick >= 0 && tick <= this.totalTicks && tick % this.sampleStrideTicks === 0
  }

  /** Maps a sample tick to its dense zero-based index. */
  sampleIndexForTick(tick: number): number {
    if (!this.isSampleTick(tick)) throw new RangeError('Tick is not on the simulation sample schedule')
    return tick / this.sampleStrideTicks
  }

  /** Returns local simulation milliseconds for one integer tick. */
  timeMsForTick(tick: number): number {
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > this.totalTicks) throw new RangeError('Simulation tick is outside the clock')
    return tick * this.stepDurationMs
  }

  /** Creates an owned exact-end sample schedule in local milliseconds. */
  sampleTimesMs(): Float64Array {
    const result = new Float64Array(this.sampleCount)
    for (let index = 0; index < result.length; index++) result[index] = index * 1000 / this.sampleFps
    result[result.length - 1] = this.durationMs
    return result
  }
}
