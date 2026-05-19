import { describe, it, expect } from 'vitest'
import {
  evaluateLifeGradient,
  evalNumberGradient,
  evalColorGradient,
  lerpColor,
  colorToCss,
} from '../animation/LifeGradient'
import type { ParticleLifeGradient } from '../types/ParticleAnimationTypes'
import type { ColorValue } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const numGrad = (stops: Array<{ t: number; value: number; easing?: any }>): ParticleLifeGradient<number> =>
  ({ stops })

const colorGrad = (stops: Array<{ t: number; value: ColorValue; easing?: any }>): ParticleLifeGradient<ColorValue> =>
  ({ stops })

const RED:   ColorValue = { r: 255, g: 0,   b: 0,   a: 255 }
const BLUE:  ColorValue = { r: 0,   g: 0,   b: 255, a: 255 }
const WHITE: ColorValue = { r: 255, g: 255, b: 255, a: 255 }
const TRANS: ColorValue = { r: 0,   g: 0,   b: 0,   a: 0   }

// ── evalNumberGradient ────────────────────────────────────────────────────────

describe('evalNumberGradient', () => {
  it('clamps to first stop below t=0', () => {
    const g = numGrad([{ t: 0, value: 1 }, { t: 1, value: 0 }])
    expect(evalNumberGradient(g, -0.5)).toBe(1)
  })

  it('clamps to last stop above t=1', () => {
    const g = numGrad([{ t: 0, value: 0 }, { t: 1, value: 5 }])
    expect(evalNumberGradient(g, 1.5)).toBe(5)
  })

  it('single stop always returns that value', () => {
    const g = numGrad([{ t: 0.5, value: 42 }])
    expect(evalNumberGradient(g, 0)).toBe(42)
    expect(evalNumberGradient(g, 0.5)).toBe(42)
    expect(evalNumberGradient(g, 1)).toBe(42)
  })

  it('interpolates linearly between two stops', () => {
    const g = numGrad([{ t: 0, value: 0 }, { t: 1, value: 10 }])
    expect(evalNumberGradient(g, 0)).toBeCloseTo(0)
    expect(evalNumberGradient(g, 0.5)).toBeCloseTo(5)
    expect(evalNumberGradient(g, 1)).toBeCloseTo(10)
  })

  it('picks correct segment for 3-stop gradient', () => {
    // 0→10 in first half, 10→0 in second half
    const g = numGrad([{ t: 0, value: 0 }, { t: 0.5, value: 10 }, { t: 1, value: 0 }])
    expect(evalNumberGradient(g, 0.25)).toBeCloseTo(5)
    expect(evalNumberGradient(g, 0.5)).toBeCloseTo(10)
    expect(evalNumberGradient(g, 0.75)).toBeCloseTo(5)
  })

  it('opacity fade example: 0→1→0', () => {
    const g = numGrad([
      { t: 0, value: 0 },
      { t: 0.2, value: 1 },
      { t: 1, value: 0 },
    ])
    expect(evalNumberGradient(g, 0)).toBeCloseTo(0)
    expect(evalNumberGradient(g, 0.2)).toBeCloseTo(1)
    expect(evalNumberGradient(g, 1)).toBeCloseTo(0)
  })

  it('smoke opacity: opens then fades', () => {
    const g = numGrad([
      { t: 0, value: 0.35 },
      { t: 1, value: 0, easing: 'easeIn' },
    ])
    expect(evalNumberGradient(g, 0)).toBeCloseTo(0.35)
    expect(evalNumberGradient(g, 1)).toBeCloseTo(0)
    // Midpoint should be somewhere between 0 and 0.35
    const mid = evalNumberGradient(g, 0.5)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(0.35)
  })
})

// ── evalColorGradient ─────────────────────────────────────────────────────────

describe('evalColorGradient', () => {
  it('returns first stop color at t=0', () => {
    const g = colorGrad([{ t: 0, value: RED }, { t: 1, value: BLUE }])
    expect(evalColorGradient(g, 0)).toEqual(RED)
  })

  it('returns last stop color at t=1', () => {
    const g = colorGrad([{ t: 0, value: RED }, { t: 1, value: BLUE }])
    expect(evalColorGradient(g, 1)).toEqual(BLUE)
  })

  it('interpolates midpoint correctly', () => {
    const g = colorGrad([{ t: 0, value: RED }, { t: 1, value: BLUE }])
    const mid = evalColorGradient(g, 0.5)
    // r: 255→0 midpoint≈128; b: 0→255 midpoint≈128
    expect(mid.r).toBeCloseTo(128, 0)
    expect(mid.b).toBeCloseTo(128, 0)
    expect(mid.g).toBe(0)
    expect(mid.a).toBe(255)
  })

  it('fades to transparent at end of magicDust config', () => {
    const g = colorGrad([
      { t: 0,   value: { r: 180, g: 100, b: 255, a: 255 } },
      { t: 0.5, value: { r: 80,  g: 180, b: 255, a: 255 } },
      { t: 1,   value: { r: 255, g: 200, b: 80,  a: 0   } },
    ])
    expect(evalColorGradient(g, 1).a).toBe(0)
  })
})

// ── lerpColor ─────────────────────────────────────────────────────────────────

describe('lerpColor', () => {
  it('t=0 returns a', () => { expect(lerpColor(RED, BLUE, 0)).toEqual(RED) })
  it('t=1 returns b', () => { expect(lerpColor(RED, BLUE, 1)).toEqual(BLUE) })
  it('t=0.5 interpolates channels', () => {
    const c = lerpColor(WHITE, TRANS, 0.5)
    expect(c.r).toBe(128)
    expect(c.a).toBe(128)
  })
  it('output channels are integers', () => {
    const c = lerpColor(RED, BLUE, 0.333)
    expect(Number.isInteger(c.r)).toBe(true)
    expect(Number.isInteger(c.g)).toBe(true)
    expect(Number.isInteger(c.b)).toBe(true)
    expect(Number.isInteger(c.a)).toBe(true)
  })
})

// ── colorToCss ────────────────────────────────────────────────────────────────

describe('colorToCss', () => {
  it('produces rgba() string', () => {
    expect(colorToCss({ r: 255, g: 0, b: 0, a: 255 })).toBe('rgba(255,0,0,1.000)')
  })
  it('transparent is a=0', () => {
    expect(colorToCss({ r: 0, g: 0, b: 0, a: 0 })).toBe('rgba(0,0,0,0.000)')
  })
  it('half alpha', () => {
    const c = colorToCss({ r: 100, g: 200, b: 50, a: 128 })
    expect(c).toMatch(/^rgba\(100,200,50,0\.5/)
  })
})
