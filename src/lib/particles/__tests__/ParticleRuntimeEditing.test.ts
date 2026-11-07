import { describe, expect, it } from 'vitest'
import { newParticleEmitterLayer } from '../../defaults'
import { computeSpawnParams } from '../runtime/ParticleSpawner'
import { ParticleInstance } from '../runtime/ParticleInstance'
import { ParticleEvaluator } from '../runtime/ParticleEvaluator'
import type { MotionModifierType } from '../types'
import { evalNumberGradient } from '../animation/LifeGradient'
function data() {
  const cfg = newParticleEmitterLayer().particleEmitter!
  cfg.emitter = { mode: 'burst', shape: 'circle', burstCount: 500, maxParticles: 500, durationMs: 2000, loop: false, area: { radius: 50, width: 200, height: 40 } }
  cfg.animation.lifetimeMs = { min: 5000, max: 5000 }
  cfg.random = { seed: 42, positionRandomness: 0, sizeRandomness: 0, rotationRandomness: 0, delayRandomness: 0, lifetimeRandomness: 0, colorRandomness: 0 }
  return cfg
}
describe('native emitter edge geometry', () => {
  it('emits on the circle or rectangle perimeter while retaining all later random samples', () => {
    for (const shape of ['circle', 'rectangle'] as const) {
      const cfg = data(); cfg.emitter.shape = shape
      const interior = computeSpawnParams(cfg, 500)
      cfg.emitter.area!.emitFromEdge = true
      const edge = computeSpawnParams(cfg, 500)
      expect(edge).toHaveLength(500)
      expect(edge.map(p => [p.baseSize, p.lifetimeMs, p.seedPhase, p.baseColor])).toEqual(interior.map(p => [p.baseSize, p.lifetimeMs, p.seedPhase, p.baseColor]))
      for (const particle of edge) {
        const { x, y } = particle.basePosition
        if (shape === 'circle') expect(Math.hypot(x, y)).toBeCloseTo(50, 8)
        else expect(Math.min(Math.abs(Math.abs(x) - 100), Math.abs(Math.abs(y) - 20))).toBeLessThan(1e-8)
      }
      if (shape === 'rectangle') {
        // Long horizontal edges account for 200/(200+40) of the perimeter.
        const horizontal = edge.filter(p => Math.abs(Math.abs(p.basePosition.y) - 20) < 1e-8).length / edge.length
        expect(horizontal).toBeGreaterThan(0.7); expect(horizontal).toBeLessThan(0.95)
      }
    }
  })
})
function instance() { return new ParticleInstance({ id: 1, birthTimeMs: 0, lifetimeMs: 5000, basePosition: { x: 0, y: 0 }, baseSize: 1, baseRotation: 0,
  rotationVelocity: 0, baseColor: { r: 255, g: 255, b: 255, a: 255 }, shape: 'circle', seedPhase: 0, positionTarget: { x: 0, y: 0 } }) }
describe('native motion modifier phase', () => {
  it('uses the requested phase for noise drift, sine wave and spiral motion', () => {
    for (const type of ['noiseDrift', 'sineWave', 'spiral'] as MotionModifierType[]) {
      const cfg = data(); cfg.animation.motionModifiers = [{ type, enabled: true, amount: 40, speed: 1, phase: 0 }]
      const zero = instance(); new ParticleEvaluator(cfg).evaluate(zero, 250)
      cfg.animation.motionModifiers[0].phase = Math.PI / 2
      const shifted = instance(); new ParticleEvaluator(cfg).evaluate(shifted, 250)
      expect(shifted.currentPosition).not.toEqual(zero.currentPosition)
      if (type === 'sineWave') { expect(zero.currentPosition.x).toBeCloseTo(40); expect(shifted.currentPosition.x).toBeCloseTo(0) }
      if (type === 'spiral') { expect(zero.currentPosition.y).toBeCloseTo(10); expect(shifted.currentPosition.x).toBeCloseTo(-10) }
    }
  })
})

describe('native lifetime stop boundaries', () => {
  it('jumps to an interior hold stop exactly at the authored life position', () => {
    const gradient = { stops: [{ t: 0, value: 1 }, { t: 0.5, value: 0.25, easing: 'hold' as const }, { t: 1, value: 0 }] }
    expect(evalNumberGradient(gradient, 0.4999)).toBe(1)
    expect(evalNumberGradient(gradient, 0.5)).toBe(0.25)
    expect(evalNumberGradient(gradient, 0.75)).toBe(0.125)
  })
})
