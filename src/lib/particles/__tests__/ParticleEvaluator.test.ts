import { describe, it, expect } from 'vitest'
import { ParticleInstance } from '../runtime/ParticleInstance'
import { ParticleEvaluator } from '../runtime/ParticleEvaluator'
import type { ParticleEmitterData } from '../types'
import type { ParticleInstanceParams } from '../runtime/ParticleInstance'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeInstance(birthTimeMs = 0, lifetimeMs = 1000): ParticleInstance {
  const params: ParticleInstanceParams = {
    id:               1,
    birthTimeMs,
    lifetimeMs,
    basePosition:     { x: 0, y: 0 },
    baseSize:         10,
    baseRotation:     0,
    rotationVelocity: 90,  // 90 deg/sec
    baseColor:        { r: 255, g: 0, b: 0, a: 255 },
    shape:            'circle',
    seedPhase:        0,
    positionTarget:   { x: 0, y: -50 },
  }
  return new ParticleInstance(params)
}

function makeCfg(overrides: Partial<ParticleEmitterData['animation']> = {}): ParticleEmitterData {
  return {
    mode: 'simple',
    emitter: { mode: 'burst', shape: 'point', burstCount: 1, maxParticles: 1, durationMs: 2000, loop: false },
    particle: { shape: 'circle', size: { min: 5, max: 10 }, colorMode: 'single', color: { r: 255, g: 0, b: 0, a: 255 } },
    animation: {
      lifetimeMs: { min: 1000, max: 1000 },
      positionTarget: { x: { min: 0, max: 0 }, y: { min: -50, max: -50 }, easing: 'linear' },
      ...overrides,
    } as any,
    random: { seed: 42, positionRandomness: 0, sizeRandomness: 0, rotationRandomness: 0, delayRandomness: 0, lifetimeRandomness: 0, colorRandomness: 0 },
    rendering: { blendMode: 'normal', softEdges: false, quality: 'medium' },
  }
}

// ── Rotation ──────────────────────────────────────────────────────────────────

describe('ParticleEvaluator rotation', () => {
  it('rotation increases with rotationVelocity * age', () => {
    const cfg = makeCfg()
    const evaluator = new ParticleEvaluator(cfg)
    const p = makeInstance(0, 1000)
    // At t=500ms: age=0.5s, rotVelocity=90deg/s → rotation = 0 + 90*0.5 = 45°
    evaluator.evaluate(p, 500)
    expect(p.currentRotation).toBeCloseTo(45, 1)
  })

  it('rotation at age=0 equals baseRotation', () => {
    const cfg = makeCfg()
    const evaluator = new ParticleEvaluator(cfg)
    const p = makeInstance(0, 1000)
    evaluator.evaluate(p, 0)
    expect(p.currentRotation).toBeCloseTo(0, 3)
  })
})

// ── Opacity fallback ──────────────────────────────────────────────────────────

describe('ParticleEvaluator opacity fallback', () => {
  it('without opacityOverLife: opacity = 1 - progress', () => {
    const cfg = makeCfg()
    // no opacityOverLife
    const evaluator = new ParticleEvaluator(cfg)
    const p = makeInstance(0, 1000)

    evaluator.evaluate(p, 0)
    expect(p.currentOpacity).toBeCloseTo(1, 3)

    evaluator.evaluate(p, 500)
    expect(p.currentOpacity).toBeCloseTo(0.5, 2)

    evaluator.evaluate(p, 1000)
    expect(p.currentOpacity).toBeCloseTo(0, 3)
  })

  it('with opacityOverLife gradient: uses gradient', () => {
    const cfg = makeCfg({
      lifetimeMs: { min: 1000, max: 1000 },
      opacityOverLife: {
        stops: [
          { t: 0,   value: 0 },
          { t: 0.5, value: 1 },
          { t: 1,   value: 0 },
        ],
      },
    })
    const evaluator = new ParticleEvaluator(cfg)
    const p = makeInstance(0, 1000)

    evaluator.evaluate(p, 0)
    expect(p.currentOpacity).toBeCloseTo(0, 3)

    evaluator.evaluate(p, 500)
    expect(p.currentOpacity).toBeCloseTo(1, 2)

    evaluator.evaluate(p, 1000)
    expect(p.currentOpacity).toBeCloseTo(0, 3)
  })
})

// ── Scale ─────────────────────────────────────────────────────────────────────

describe('ParticleEvaluator scale', () => {
  it('without scaleOverLife: scale = 1', () => {
    const cfg = makeCfg()
    const evaluator = new ParticleEvaluator(cfg)
    const p = makeInstance(0, 1000)
    evaluator.evaluate(p, 500)
    expect(p.currentScale).toBe(1)
  })

  it('with scaleOverLife: scales from 0.3 → 1 → 0', () => {
    const cfg = makeCfg({
      lifetimeMs: { min: 1000, max: 1000 },
      scaleOverLife: {
        stops: [
          { t: 0,   value: 0.3 },
          { t: 0.5, value: 1 },
          { t: 1,   value: 0 },
        ],
      },
    })
    const evaluator = new ParticleEvaluator(cfg)
    const p = makeInstance(0, 1000)

    evaluator.evaluate(p, 0)
    expect(p.currentScale).toBeCloseTo(0.3, 2)

    evaluator.evaluate(p, 500)
    expect(p.currentScale).toBeCloseTo(1, 2)

    evaluator.evaluate(p, 1000)
    expect(p.currentScale).toBeCloseTo(0, 2)
  })
})

// ── Color ─────────────────────────────────────────────────────────────────────

describe('ParticleEvaluator color', () => {
  it('without colorOverLife: color stays as baseColor', () => {
    const cfg = makeCfg()
    const evaluator = new ParticleEvaluator(cfg)
    const p = makeInstance(0, 1000)
    evaluator.evaluate(p, 500)
    expect(p.currentColor).toEqual(p.baseColor)
  })

  it('with colorOverLife: interpolates correctly', () => {
    const cfg = makeCfg()
    cfg.particle.colorOverLife = {
      stops: [
        { t: 0, value: { r: 0,   g: 0,   b: 0,   a: 255 } },
        { t: 1, value: { r: 255, g: 255, b: 255, a: 255 } },
      ],
    }
    const evaluator = new ParticleEvaluator(cfg)
    const p = makeInstance(0, 1000)

    evaluator.evaluate(p, 500)
    expect(p.currentColor.r).toBeCloseTo(128, 0)
    expect(p.currentColor.g).toBeCloseTo(128, 0)
    expect(p.currentColor.b).toBeCloseTo(128, 0)
  })
})
