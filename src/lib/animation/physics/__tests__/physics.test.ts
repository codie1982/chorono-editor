import { describe, it, expect, beforeEach } from 'vitest'
import { overshootOut, elasticOut, bounceOut, decayOscillation } from '../easings'
import { stepSpring, settleSpring, DEFAULT_SPRING_PARAMS } from '../spring'
import { getSpringValue, clearAllSprings } from '../springCache'

describe('BL-49 stateless easings', () => {
  describe('overshootOut', () => {
    it('returns ~0 at u=0 and 1 at u=1', () => {
      expect(overshootOut(0)).toBeCloseTo(0, 10)
      expect(overshootOut(1)).toBe(1)
    })
    it('overshoots past 1 mid-curve', () => {
      // peak around u≈0.7-0.8
      const samples = [0.65, 0.7, 0.75, 0.8, 0.85].map((u) => overshootOut(u))
      expect(Math.max(...samples)).toBeGreaterThan(1)
    })
  })

  describe('elasticOut', () => {
    it('returns 0 at u=0 and 1 at u=1', () => {
      expect(elasticOut(0)).toBe(0)
      expect(elasticOut(1)).toBe(1)
    })
    it('oscillates around 1 mid-curve', () => {
      // Should cross above AND below 1 between 0.1 and 1.
      const samples = Array.from({ length: 50 }, (_, i) => elasticOut(0.1 + i * 0.018))
      expect(samples.some((v) => v > 1)).toBe(true)
      expect(samples.some((v) => v < 1)).toBe(true)
    })
  })

  describe('bounceOut', () => {
    it('returns ~0 at u=0 and 1 at u=1', () => {
      expect(bounceOut(0)).toBeCloseTo(0, 5)
      expect(bounceOut(1)).toBeCloseTo(1, 5)
    })
    it('never exceeds 1', () => {
      for (let i = 0; i <= 100; i++) {
        const v = bounceOut(i / 100)
        expect(v).toBeLessThanOrEqual(1.0001)
      }
    })
    it('hits the second bounce ~0.75 plateau', () => {
      // At the segment boundary u=1/d1 the value is n1·u² = 7.5625·(1/2.75)² ≈ 1
      // Just sample a known mid-segment value.
      expect(bounceOut(0.5)).toBeGreaterThan(0.7)
      expect(bounceOut(0.5)).toBeLessThan(0.9)
    })
  })

  describe('decayOscillation', () => {
    it('starts at 0 (sin(phase) ·  e^0 = 0 when phase=0)', () => {
      expect(decayOscillation(0, 10, 4, 3, 0)).toBe(0)
    })
    it('amplitude decays over time', () => {
      const a = Math.abs(decayOscillation(0.05, 10, 4, 3, Math.PI / 2))
      const b = Math.abs(decayOscillation(0.95, 10, 4, 3, Math.PI / 2))
      expect(a).toBeGreaterThan(b)
    })
  })
})

describe('BL-49 spring integrator', () => {
  it('zero velocity, zero displacement → stays at rest', () => {
    const s = stepSpring({ value: 5, velocity: 0 }, 5, 16, DEFAULT_SPRING_PARAMS)
    expect(s.value).toBe(5)
    expect(s.velocity).toBe(0)
  })

  it('displaced from target → accelerates toward target', () => {
    const s = stepSpring({ value: 0, velocity: 0 }, 100, 16, DEFAULT_SPRING_PARAMS)
    expect(s.value).toBeGreaterThan(0)
    expect(s.velocity).toBeGreaterThan(0)
  })

  it('settleSpring over long dt → approaches target (not overshooting infinitely)', () => {
    let s = { value: 0, velocity: 0 }
    s = settleSpring(s, 100, 0, 5000, DEFAULT_SPRING_PARAMS) // 5 sec
    expect(Math.abs(s.value - 100)).toBeLessThan(1)
    expect(Math.abs(s.velocity)).toBeLessThan(1)
  })

  it('dt of 0 is a no-op', () => {
    const init = { value: 7, velocity: 3 }
    expect(stepSpring(init, 0, 0, DEFAULT_SPRING_PARAMS)).toBe(init)
  })
})

describe('BL-49 spring cache', () => {
  beforeEach(clearAllSprings)

  it('first call returns target (no displacement on init)', () => {
    expect(getSpringValue('t', 'm', 100, 0, DEFAULT_SPRING_PARAMS)).toBe(100)
  })

  it('repeated calls with advancing time settle toward target', () => {
    let v = getSpringValue('t', 'm', 0, 0, DEFAULT_SPRING_PARAMS) // init at 0
    for (let t = 16; t <= 2000; t += 16) {
      v = getSpringValue('t', 'm', 100, t, DEFAULT_SPRING_PARAMS)
    }
    expect(Math.abs(v - 100)).toBeLessThan(5)
  })

  it('scrub backwards resets the spring', () => {
    getSpringValue('t', 'm', 100, 0,    DEFAULT_SPRING_PARAMS)
    getSpringValue('t', 'm', 100, 1000, DEFAULT_SPRING_PARAMS)
    // Jump back to t=500 — should reset and snap to target.
    expect(getSpringValue('t', 'm', 200, 500, DEFAULT_SPRING_PARAMS)).toBe(200)
  })
})
