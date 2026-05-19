import { describe, it, expect } from 'vitest'
import { ParticlePool } from '../runtime/ParticlePool'
import { ParticleInstance, type ParticleInstanceParams } from '../runtime/ParticleInstance'

function baseParams(id = 1): ParticleInstanceParams {
  return {
    id, birthTimeMs: 0, lifetimeMs: 1000,
    basePosition: { x: 0, y: 0 }, baseSize: 8,
    baseRotation: 0, rotationVelocity: 0,
    baseColor: { r: 255, g: 255, b: 255, a: 255 },
    shape: 'circle', seedPhase: 0, positionTarget: { x: 0, y: 0 },
  }
}

describe('ParticlePool', () => {
  it('acquire() returns a ParticleInstance', () => {
    const pool = new ParticlePool()
    const p = pool.acquire(baseParams())
    expect(p).toBeInstanceOf(ParticleInstance)
  })

  it('release() + acquire() reuses the same object', () => {
    const pool = new ParticlePool()
    const p1 = pool.acquire(baseParams(1))
    pool.release(p1)
    const p2 = pool.acquire(baseParams(2))
    // Same object reference (reset was called)
    expect(p2).toBe(p1)
    // New id was applied via reset
    expect(p2.id).toBe(2)
  })

  it('freeCount tracks correctly', () => {
    const pool = new ParticlePool()
    expect(pool.freeCount).toBe(0)

    const p = pool.acquire(baseParams())
    expect(pool.freeCount).toBe(0)

    pool.release(p)
    expect(pool.freeCount).toBe(1)

    pool.acquire(baseParams())
    expect(pool.freeCount).toBe(0)
  })

  it('releaseAll() returns multiple particles', () => {
    const pool = new ParticlePool()
    const p1 = pool.acquire(baseParams(1))
    const p2 = pool.acquire(baseParams(2))
    const p3 = pool.acquire(baseParams(3))
    pool.releaseAll([p1, p2, p3])
    expect(pool.freeCount).toBe(3)
  })

  it('clear() drains the pool', () => {
    const pool = new ParticlePool()
    // Pre-create two instances and release them both into the pool
    const a = new ParticleInstance(baseParams(10))
    const b = new ParticleInstance(baseParams(11))
    pool.release(a)
    pool.release(b)
    expect(pool.freeCount).toBe(2)
    pool.clear()
    expect(pool.freeCount).toBe(0)
  })

  it('allocates fresh instance when pool is empty', () => {
    const pool = new ParticlePool()
    // Nothing in pool — must allocate new
    const p = pool.acquire(baseParams(77))
    expect(p.id).toBe(77)
  })
})
