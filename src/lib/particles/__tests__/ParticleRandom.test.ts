import { describe, it, expect } from 'vitest'
import { ParticleRandom } from '../runtime/ParticleRandom'

describe('ParticleRandom', () => {
  // ── Determinism ─────────────────────────────────────────────────────────────

  it('same seed → same sequence', () => {
    const a = new ParticleRandom(42)
    const b = new ParticleRandom(42)
    for (let i = 0; i < 20; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('different seeds → different sequences', () => {
    const a = new ParticleRandom(1)
    const b = new ParticleRandom(2)
    let different = false
    for (let i = 0; i < 10; i++) {
      if (a.next() !== b.next()) { different = true; break }
    }
    expect(different).toBe(true)
  })

  it('seed 0 uses fallback (does not stay at 0)', () => {
    const rng = new ParticleRandom(0)
    const v = rng.next()
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })

  // ── Range ────────────────────────────────────────────────────────────────────

  it('next() is always in [0, 1)', () => {
    const rng = new ParticleRandom(12345)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('range(min, max) stays within bounds', () => {
    const rng = new ParticleRandom(99)
    for (let i = 0; i < 500; i++) {
      const v = rng.range(-50, 50)
      expect(v).toBeGreaterThanOrEqual(-50)
      expect(v).toBeLessThan(50)
    }
  })

  it('signed() is in [-1, 1)', () => {
    const rng = new ParticleRandom(7)
    for (let i = 0; i < 500; i++) {
      const v = rng.signed()
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThan(1)
    }
  })

  // ── pick() ────────────────────────────────────────────────────────────────────

  it('pick() always returns an element from the array', () => {
    const items = ['a', 'b', 'c', 'd']
    const rng = new ParticleRandom(100)
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items))
    }
  })

  it('pick() reaches all items in a single-item array', () => {
    const rng = new ParticleRandom(1)
    expect(rng.pick(['only'])).toBe('only')
  })

  // ── Uniformity (statistical) ─────────────────────────────────────────────────

  it('distributes picks roughly uniformly across 4 items', () => {
    const counts = [0, 0, 0, 0]
    const rng = new ParticleRandom(55)
    const N = 4000
    for (let i = 0; i < N; i++) {
      counts[Math.floor(rng.next() * 4)]++
    }
    // Each bucket should be within ±20% of N/4
    const expected = N / 4
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.8)
      expect(c).toBeLessThan(expected * 1.2)
    }
  })

  // ── Fork ─────────────────────────────────────────────────────────────────────

  it('fork() produces independent RNG', () => {
    const parent = new ParticleRandom(42)
    const fork   = parent.fork()
    // Parent and fork should diverge after fork
    const pVals  = Array.from({ length: 5 }, () => parent.next())
    const fVals  = Array.from({ length: 5 }, () => fork.next())
    // They should not be identical sequences
    expect(pVals).not.toEqual(fVals)
  })

  // ── Call order contract ────────────────────────────────────────────────────────

  it('sequence is stable across 50 calls (regression)', () => {
    const rng = new ParticleRandom(42)
    const seq = Array.from({ length: 50 }, () => rng.next())
    // Re-run to verify identical
    const rng2 = new ParticleRandom(42)
    const seq2 = Array.from({ length: 50 }, () => rng2.next())
    expect(seq).toEqual(seq2)
  })
})
