// ── ParticleRandom ─────────────────────────────────────────────────────────────
//
// LCG (Linear Congruential Generator) — deterministic, platform-independent.
// Same seed produces the same sequence on Web, Android, and iOS.
//
// CRITICAL — PRNG call order per particle MUST remain:
//   delay → spawnXY (2 calls) → lifetime → size → color → rotVelocity → seedPhase
// Breaking this order changes the visual appearance for the same seed.

export class ParticleRandom {
  private state: number

  constructor(seed: number) {
    // Ensure non-zero initial state
    this.state = (seed | 0) || 123456789
  }

  /** Returns next float in [0, 1) */
  next(): number {
    this.state = ((1664525 * this.state) + 1013904223) >>> 0
    return this.state / 4294967296
  }

  /** Returns a float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Returns a float in [-1, 1) */
  signed(): number {
    return this.next() * 2 - 1
  }

  /** Picks a uniformly-random item from the array */
  pick<T>(items: T[]): T {
    const i = Math.max(0, Math.min(items.length - 1, Math.floor(this.next() * items.length)))
    return items[i]
  }

  /** Fork: return a new PRNG seeded by the next value of this PRNG.
   *  Useful for giving each particle its own independent sequence. */
  fork(): ParticleRandom {
    // consume one value to advance state, seed fork with it
    return new ParticleRandom(this.state + this.next() * 0x7fffffff)
  }
}
