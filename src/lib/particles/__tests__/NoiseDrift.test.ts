import { describe, it, expect } from 'vitest'
import { evaluateNoiseDrift } from '../animation/NoiseDrift'

describe('evaluateNoiseDrift', () => {
  it('returns Vec2', () => {
    const d = evaluateNoiseDrift(0, 0, 10, 1)
    expect(d).toHaveProperty('x')
    expect(d).toHaveProperty('y')
  })

  it('at age=0 x offset is 0 (sin(0+0)=0)', () => {
    const d = evaluateNoiseDrift(0, 0, 20, 1)
    expect(d.x).toBeCloseTo(0, 5)
  })

  it('amplitude scales output', () => {
    const a = evaluateNoiseDrift(250, 0, 1,  1)
    const b = evaluateNoiseDrift(250, 0, 10, 1)
    expect(Math.abs(b.x)).toBeCloseTo(Math.abs(a.x) * 10, 3)
    expect(Math.abs(b.y)).toBeCloseTo(Math.abs(a.y) * 10, 3)
  })

  it('different seed phases produce different values at same time', () => {
    // Use a time where sin != 0 and pi/3 phase gives clearly different x
    const a = evaluateNoiseDrift(250, 0,            20, 1)
    const b = evaluateNoiseDrift(250, Math.PI / 3,  20, 1)
    expect(a.x).not.toBeCloseTo(b.x, 1)
  })

  it('output magnitude is bounded by amplitude', () => {
    const amount = 30
    for (let t = 0; t < 5000; t += 50) {
      const d = evaluateNoiseDrift(t, 1.5, amount, 2)
      expect(Math.abs(d.x)).toBeLessThanOrEqual(amount + 0.001)
      expect(Math.abs(d.y)).toBeLessThanOrEqual(amount + 0.001)
    }
  })

  it('deterministic — same inputs same output', () => {
    const a = evaluateNoiseDrift(1234, 0.7, 15, 1.5)
    const b = evaluateNoiseDrift(1234, 0.7, 15, 1.5)
    expect(a).toEqual(b)
  })
})
