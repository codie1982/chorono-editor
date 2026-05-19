// ── ParticleEvaluator ──────────────────────────────────────────────────────────
//
// Updates a ParticleInstance's current-frame state (position, scale, rotation,
// opacity, color) from its spawn data + the global time.
// Called once per alive particle per frame.

import type { Vec2 } from '@/lib/types'
import type { ParticleEmitterData } from '../types'
import type { ParticleInstance } from './ParticleInstance'
import { evalNumberGradient, evalColorGradient } from '../animation/LifeGradient'
import { evaluateNoiseDrift } from '../animation/NoiseDrift'
import { getEasing } from '../animation/ParticleEasing'

export class ParticleEvaluator {
  constructor(private readonly cfg: ParticleEmitterData) {}

  /**
   * Write evaluated state into `particle` for the given global time.
   * Caller must ensure `particle.isAlive(globalTimeMs)` before calling.
   */
  evaluate(particle: ParticleInstance, globalTimeMs: number): void {
    const progress = particle.getLifeProgress(globalTimeMs)
    const ageMs    = particle.getAge(globalTimeMs)
    const anim     = this.cfg.animation

    // ── Position ──────────────────────────────────────────────────────────────
    particle.currentPosition = this.evaluatePosition(particle, progress, ageMs)

    // ── Scale ─────────────────────────────────────────────────────────────────
    particle.currentScale = anim.scaleOverLife
      ? evalNumberGradient(anim.scaleOverLife, progress)
      : 1

    // ── Rotation ──────────────────────────────────────────────────────────────
    particle.currentRotation =
      particle.baseRotation + particle.rotationVelocity * (ageMs / 1000)

    // ── Opacity ───────────────────────────────────────────────────────────────
    particle.currentOpacity = anim.opacityOverLife
      ? evalNumberGradient(anim.opacityOverLife, progress)
      : Math.max(0, 1 - progress)  // linear fade fallback

    // ── Color ─────────────────────────────────────────────────────────────────
    if (this.cfg.particle.colorOverLife) {
      particle.currentColor = evalColorGradient(this.cfg.particle.colorOverLife, progress)
    } else {
      particle.currentColor = particle.baseColor
    }
  }

  private evaluatePosition(
    particle: ParticleInstance,
    progress: number,
    ageMs:    number,
  ): Vec2 {
    const anim = this.cfg.animation
    let x = particle.basePosition.x
    let y = particle.basePosition.y

    // Position offset (drift toward positionTarget)
    const easing = getEasing(anim.positionOffset?.easing)
    const t      = easing(progress)
    x += particle.positionTarget.x * t
    y += particle.positionTarget.y * t

    // Motion modifiers
    const mods = anim.motionModifiers ?? []
    for (const mod of mods) {
      if (!mod.enabled) continue
      switch (mod.type) {
        case 'noiseDrift': {
          const drift = evaluateNoiseDrift(
            ageMs,
            particle.seedPhase,
            mod.amount ?? 20,
            mod.speed  ?? 1,
          )
          x += drift.x
          y += drift.y
          break
        }
        case 'sineWave': {
          // Horizontal wave
          x += Math.sin(ageMs / 1000 * (mod.speed ?? 1) * Math.PI * 2 + particle.seedPhase) * (mod.amount ?? 15)
          break
        }
        case 'spiral': {
          const t2 = ageMs / 1000 * (mod.speed ?? 1)
          const r = t2 * (mod.amount ?? 20)
          x += Math.cos(t2 * Math.PI * 2 + particle.seedPhase) * r
          y += Math.sin(t2 * Math.PI * 2 + particle.seedPhase) * r
          break
        }
      }
    }

    return { x, y }
  }
}
