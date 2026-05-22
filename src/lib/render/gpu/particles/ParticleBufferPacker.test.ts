import { describe, it, expect } from 'vitest'
import { ParticleBufferPacker, FLOATS_PER_PARTICLE, shapeToId } from './ParticleBufferPacker'
import { buildParticleTransformMatrix } from './WebGLInstancedQuadBackend'
import { ParticleInstance } from '@/lib/particles/runtime/ParticleInstance'
import type { ParticleEmitterData, ParticleShape } from '@/lib/particles/types'
import type { DisplayTransform } from '@/lib/render/resolveDisplayTransform'

// Minimal config — the packer only reads cfg.particle.starInnerRatio.
function cfg(starInnerRatio = 0.4): ParticleEmitterData {
  return { particle: { starInnerRatio } } as unknown as ParticleEmitterData
}

function makeParticle(shape: ParticleShape, overrides: Partial<ParticleInstance> = {}): ParticleInstance {
  const p = new ParticleInstance({
    id:               1,
    birthTimeMs:      0,
    lifetimeMs:       1000,
    basePosition:     { x: 0, y: 0 },
    baseSize:         10,
    baseRotation:     0,
    rotationVelocity: 0,
    baseColor:        { r: 255, g: 255, b: 255, a: 255 },
    shape,
    seedPhase:        0,
    positionTarget:   { x: 0, y: 0 },
  })
  Object.assign(p, overrides)
  return p
}

// Apply a column-major mat3 to a 2D point (z = 1).
function applyMat3(m: Float32Array, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[3] * y + m[6],
    y: m[1] * x + m[4] * y + m[7],
  }
}

describe('ParticleBufferPacker', () => {
  it('packs one alive particle with the documented 11-float layout', () => {
    const packer = new ParticleBufferPacker()
    const p = makeParticle('circle', {
      currentPosition: { x: 12, y: 34 },
      currentScale:    2,
      currentRotation: 90,
      currentOpacity:  0.5,
      currentColor:    { r: 255, g: 128, b: 0, a: 255 },
    })

    const count = packer.pack([p], cfg(), 100, 1)
    expect(count).toBe(1)

    const b = packer.getBuffer()
    expect(b[0]).toBeCloseTo(12)        // position.x
    expect(b[1]).toBeCloseTo(34)        // position.y
    expect(b[2]).toBeCloseTo(20)        // size = baseSize(10) * scale(2)
    expect(b[3]).toBeCloseTo(Math.PI / 2) // rotation 90° in radians
    expect(b[4]).toBeCloseTo(0.5)       // opacity = layerAlpha(1) * 0.5
    expect(b[5]).toBeCloseTo(1)         // r 255/255
    expect(b[6]).toBeCloseTo(128 / 255) // g
    expect(b[7]).toBeCloseTo(0)         // b
    expect(b[8]).toBeCloseTo(1)         // a
    expect(b[9]).toBe(0)                // shapeId circle
    expect(b[10]).toBe(0)               // shapeParam (non-star)
  })

  it('skips dead particles', () => {
    const packer = new ParticleBufferPacker()
    const alive = makeParticle('circle')
    const dead  = makeParticle('circle', { birthTimeMs: 0, lifetimeMs: 10 } as Partial<ParticleInstance>)
    // dead at relativeTime 5000 (age 5000 > lifetime 10)
    const count = packer.pack([alive, dead], cfg(), 5000, 1)
    // alive has lifetime 1000 → also dead at 5000; expect 0
    expect(count).toBe(0)
  })

  it('keeps only particles alive at the given relativeTime', () => {
    const packer = new ParticleBufferPacker()
    const a = makeParticle('rect') // lifetime 1000
    const count = packer.pack([a], cfg(), 500, 1)
    expect(count).toBe(1)
  })

  it('bakes layerAlpha into opacity and clamps to [0,1]', () => {
    const packer = new ParticleBufferPacker()
    const p = makeParticle('circle', { currentOpacity: 0.8 })
    packer.pack([p], cfg(), 100, 0.5)
    expect(packer.getBuffer()[4]).toBeCloseTo(0.4) // 0.5 * 0.8

    const over = makeParticle('circle', { currentOpacity: 5 })
    packer.pack([over], cfg(), 100, 1)
    expect(packer.getBuffer()[4]).toBe(1)          // clamped
  })

  it('carries starInnerRatio in shapeParam only for star', () => {
    const packer = new ParticleBufferPacker()
    packer.pack([makeParticle('star')], cfg(0.3), 100, 1)
    expect(packer.getBuffer()[10]).toBeCloseTo(0.3)

    packer.pack([makeParticle('triangle')], cfg(0.3), 100, 1)
    expect(packer.getBuffer()[10]).toBe(0)
  })

  it('maps every shape to a stable id 0-8', () => {
    const shapes: ParticleShape[] = [
      'circle', 'softCircle', 'rect', 'roundedRect', 'line',
      'triangle', 'star', 'smokePuff', 'flameBlob',
    ]
    expect(shapes.map(shapeToId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('reuses and grows the staging buffer', () => {
    const packer = new ParticleBufferPacker()
    const many = Array.from({ length: 100 }, () => makeParticle('circle'))
    packer.pack(many, cfg(), 100, 1)
    expect(packer.getBuffer().length).toBeGreaterThanOrEqual(100 * FLOATS_PER_PARTICLE)
  })
})

describe('buildParticleTransformMatrix', () => {
  const identity: DisplayTransform = { x: 0, y: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 }

  it('maps composition corners to clip space with y-flip', () => {
    const m = buildParticleTransformMatrix(100, 100, identity, 0, 0)

    const topLeft = applyMat3(m, 0, 0)
    expect(topLeft.x).toBeCloseTo(-1)
    expect(topLeft.y).toBeCloseTo(1)

    const bottomRight = applyMat3(m, 100, 100)
    expect(bottomRight.x).toBeCloseTo(1)
    expect(bottomRight.y).toBeCloseTo(-1)

    const center = applyMat3(m, 50, 50)
    expect(center.x).toBeCloseTo(0)
    expect(center.y).toBeCloseTo(0)
  })

  it('applies layer translation', () => {
    const m = buildParticleTransformMatrix(100, 100, { ...identity, x: 50, y: 50 }, 0, 0)
    // a local point at (0,0) shifts to world (50,50) → clip center
    const p = applyMat3(m, 0, 0)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(0)
  })

  it('applies scale around the anchor', () => {
    // scale 2× around anchor (0,0): local (50,50) → world (100,100) → clip bottom-right
    const m = buildParticleTransformMatrix(100, 100, { ...identity, scaleX: 2, scaleY: 2 }, 0, 0)
    const p = applyMat3(m, 50, 50)
    expect(p.x).toBeCloseTo(1)
    expect(p.y).toBeCloseTo(-1)
  })
})
