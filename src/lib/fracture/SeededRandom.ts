/**
 * Small deterministic unsigned PRNG used only for fracture authoring.
 *
 * Each instance owns one 32-bit state. The zero seed is remapped because the
 * xorshift32 recurrence would otherwise remain zero. This generator is not a
 * security primitive and its sequence is part of the fracture compiler v1
 * contract.
 */
export class SeededRandom {
  private state: number

  constructor(seed: number) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new RangeError('Fracture seed must be an unsigned 32-bit integer')
    }
    this.state = (seed || 0x6d2b79f5) >>> 0
  }

  /** Returns the next value in the half-open interval [0, 1). */
  next(): number {
    let value = this.state
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    this.state = value >>> 0
    return this.state / 0x100000000
  }
}
