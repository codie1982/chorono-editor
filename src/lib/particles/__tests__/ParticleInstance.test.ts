import { describe, it, expect } from 'vitest'
import { ParticleInstance, type ParticleInstanceParams } from '../runtime/ParticleInstance'

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeParams(birthTimeMs = 0, lifetimeMs = 1000): ParticleInstanceParams {
  return {
    id:               1,
    birthTimeMs,
    lifetimeMs,
    basePosition:     { x: 10, y: 20 },
    baseSize:         8,
    baseRotation:     45,
    rotationVelocity: 180,
    baseColor:        { r: 100, g: 200, b: 50, a: 255 },
    shape:            'rect',
    seedPhase:        1.23,
    positionTarget:   { x: 100, y: -100 },
  }
}

// ── getAge ────────────────────────────────────────────────────────────────────

describe('ParticleInstance.getAge', () => {
  it('returns 0 at birth', () => {
    const p = new ParticleInstance(makeParams(100))
    expect(p.getAge(100)).toBe(0)
  })

  it('returns positive age after birth', () => {
    const p = new ParticleInstance(makeParams(100))
    expect(p.getAge(600)).toBe(500)
  })

  it('returns negative before birth', () => {
    const p = new ParticleInstance(makeParams(500))
    expect(p.getAge(200)).toBe(-300)
  })
})

// ── getLifeProgress ──────────────────────────────────────────────────────────

describe('ParticleInstance.getLifeProgress', () => {
  it('is 0 at birth', () => {
    const p = new ParticleInstance(makeParams(0, 1000))
    expect(p.getLifeProgress(0)).toBe(0)
  })

  it('is 1 at end of life', () => {
    const p = new ParticleInstance(makeParams(0, 1000))
    expect(p.getLifeProgress(1000)).toBe(1)
  })

  it('is 0.5 at midlife', () => {
    const p = new ParticleInstance(makeParams(0, 1000))
    expect(p.getLifeProgress(500)).toBeCloseTo(0.5, 5)
  })

  it('clamps below 0', () => {
    const p = new ParticleInstance(makeParams(500, 1000))
    expect(p.getLifeProgress(0)).toBe(0)
  })

  it('clamps above 1', () => {
    const p = new ParticleInstance(makeParams(0, 1000))
    expect(p.getLifeProgress(9999)).toBe(1)
  })
})

// ── isAlive ───────────────────────────────────────────────────────────────────

describe('ParticleInstance.isAlive', () => {
  it('true at birthTimeMs', () => {
    const p = new ParticleInstance(makeParams(100, 500))
    expect(p.isAlive(100)).toBe(true)
  })

  it('true during lifetime', () => {
    const p = new ParticleInstance(makeParams(0, 1000))
    expect(p.isAlive(500)).toBe(true)
  })

  it('true at exact death time', () => {
    const p = new ParticleInstance(makeParams(0, 1000))
    expect(p.isAlive(1000)).toBe(true)
  })

  it('false before birth', () => {
    const p = new ParticleInstance(makeParams(200, 500))
    expect(p.isAlive(100)).toBe(false)
  })

  it('false after death', () => {
    const p = new ParticleInstance(makeParams(0, 500))
    expect(p.isAlive(600)).toBe(false)
  })
})

// ── reset (pool reuse) ────────────────────────────────────────────────────────

describe('ParticleInstance.reset', () => {
  it('resets to new params', () => {
    const p = new ParticleInstance(makeParams(0, 1000))
    const newParams = makeParams(500, 2000)
    newParams.id         = 99
    newParams.baseSize   = 42
    newParams.baseColor  = { r: 10, g: 20, b: 30, a: 200 }

    p.reset(newParams)
    expect(p.id).toBe(99)
    expect(p.birthTimeMs).toBe(500)
    expect(p.lifetimeMs).toBe(2000)
    expect(p.baseSize).toBe(42)
    expect(p.baseColor).toEqual({ r: 10, g: 20, b: 30, a: 200 })
  })

  it('returns same object (for pool chaining)', () => {
    const p = new ParticleInstance(makeParams())
    const ret = p.reset(makeParams(100))
    expect(ret).toBe(p)
  })

  it('mutable state is reset after pool reuse', () => {
    const p = new ParticleInstance(makeParams(0, 1000))
    // Manually dirty the state
    p.currentOpacity  = 0.1
    p.currentScale    = 3
    p.currentRotation = 270

    p.reset(makeParams(0, 1000))
    expect(p.currentOpacity).toBe(1)
    expect(p.currentScale).toBe(1)
    expect(p.currentRotation).toBe(makeParams().baseRotation)
  })
})
