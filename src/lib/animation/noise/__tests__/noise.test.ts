import { describe, it, expect } from 'vitest'
import { hash1, shash1, valueNoise1D, signedNoise1D, fbm1D } from '../noise'

describe('BL-47 deterministic noise', () => {
  it('hash1 is deterministic across calls', () => {
    expect(hash1(1)).toBe(hash1(1))
    expect(hash1(42, 7)).toBe(hash1(42, 7))
  })

  it('hash1 stays in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const v = hash1(i * 0.37, i)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('shash1 stays in [-1, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const v = shash1(i * 0.37, i)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThan(1)
    }
  })

  it('valueNoise1D is C0 continuous (smoothstep avoids C1 spikes within a cell)', () => {
    // Adjacent samples within a cell should be close.
    const a = valueNoise1D(1.25, 0)
    const b = valueNoise1D(1.255, 0)
    expect(Math.abs(a - b)).toBeLessThan(0.1)
  })

  it('signedNoise1D shifts to [-1, 1)', () => {
    for (let i = 0; i < 50; i++) {
      const v = signedNoise1D(i * 0.13, i)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThan(1)
    }
  })

  it('fbm1D blends octaves and stays in [-1, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const v = fbm1D(i * 0.1, 0, 4, 2, 0.5)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1.0001) // tiny FP slack
    }
  })

  it('fbm1D with octaves=1 equals signedNoise1D', () => {
    for (let i = 0; i < 20; i++) {
      const x = i * 0.07
      expect(fbm1D(x, 42, 1, 2, 0.5)).toBeCloseTo(signedNoise1D(x, 42), 5)
    }
  })

  it('different seeds produce different sequences', () => {
    const a = Array.from({ length: 20 }, (_, i) => signedNoise1D(i, 0))
    const b = Array.from({ length: 20 }, (_, i) => signedNoise1D(i, 1))
    expect(a).not.toEqual(b)
  })
})
