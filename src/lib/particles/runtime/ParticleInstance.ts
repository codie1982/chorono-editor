// ── ParticleInstance ───────────────────────────────────────────────────────────
//
// Represents a single living particle.
//   - Readonly spawn data: set once at birth and never changed.
//   - Mutable current state: written by ParticleEvaluator each frame.
//
// Kept as a class (not interface) so ParticlePool can call reset() for reuse.

import type { Vec2, ColorValue } from '@/lib/types'
import type { ParticleShape } from '../types/ParticleEmitterTypes'

// ── Spawn params ──────────────────────────────────────────────────────────────

export interface ParticleInstanceParams {
  id:               number
  birthTimeMs:      number
  lifetimeMs:       number
  /** Spawn origin in layer-local coords */
  basePosition:     Vec2
  /** Base size in px (before scaleOverLife) */
  baseSize:         number
  /** Initial rotation in degrees */
  baseRotation:     number
  /** Degrees per second */
  rotationVelocity: number
  baseColor:        ColorValue
  shape:            ParticleShape
  /** Seed phase for noiseDrift (per-particle uniqueness) */
  seedPhase:        number
  /** Target offset at end of lifetime (for positionOffset animation) */
  positionTarget:   Vec2
}

// ── Class ─────────────────────────────────────────────────────────────────────

export class ParticleInstance {
  // Spawn data (immutable)
  readonly id:               number
  readonly birthTimeMs:      number
  readonly lifetimeMs:       number
  readonly basePosition:     Vec2
  readonly baseSize:         number
  readonly baseRotation:     number
  readonly rotationVelocity: number
  readonly baseColor:        ColorValue
  readonly shape:            ParticleShape
  readonly seedPhase:        number
  readonly positionTarget:   Vec2

  // Current frame state (written by ParticleEvaluator)
  currentPosition: Vec2       = { x: 0, y: 0 }
  currentScale:    number     = 1
  currentRotation: number     = 0
  currentOpacity:  number     = 1
  currentColor:    ColorValue = { r: 255, g: 255, b: 255, a: 255 }

  constructor(p: ParticleInstanceParams) {
    this.id               = p.id
    this.birthTimeMs      = p.birthTimeMs
    this.lifetimeMs       = p.lifetimeMs
    this.basePosition     = p.basePosition
    this.baseSize         = p.baseSize
    this.baseRotation     = p.baseRotation
    this.rotationVelocity = p.rotationVelocity
    this.baseColor        = p.baseColor
    this.shape            = p.shape
    this.seedPhase        = p.seedPhase
    this.positionTarget   = p.positionTarget
    // init mutable state
    this.currentColor     = { ...p.baseColor }
    this.currentRotation  = p.baseRotation
    this.currentPosition  = { ...p.basePosition }
  }

  /** Age in ms. Negative = not yet born. */
  getAge(timeMs: number): number {
    return timeMs - this.birthTimeMs
  }

  /** 0 (birth) → 1 (death). Clamped. */
  getLifeProgress(timeMs: number): number {
    return Math.max(0, Math.min(1, this.getAge(timeMs) / this.lifetimeMs))
  }

  /** True while age ∈ [0, lifetimeMs]. */
  isAlive(timeMs: number): boolean {
    const age = this.getAge(timeMs)
    return age >= 0 && age <= this.lifetimeMs
  }

  /**
   * Reset to new spawn params for object pool reuse.
   * Returns `this` so ParticlePool.acquire() can do:
   *   `return pool.pop()?.reset(params) ?? new ParticleInstance(params)`
   */
  reset(p: ParticleInstanceParams): this {
    ;(this as any).id               = p.id
    ;(this as any).birthTimeMs      = p.birthTimeMs
    ;(this as any).lifetimeMs       = p.lifetimeMs
    ;(this as any).basePosition     = p.basePosition
    ;(this as any).baseSize         = p.baseSize
    ;(this as any).baseRotation     = p.baseRotation
    ;(this as any).rotationVelocity = p.rotationVelocity
    ;(this as any).baseColor        = p.baseColor
    ;(this as any).shape            = p.shape
    ;(this as any).seedPhase        = p.seedPhase
    ;(this as any).positionTarget   = p.positionTarget
    this.currentColor               = { ...p.baseColor }
    this.currentRotation            = p.baseRotation
    this.currentPosition            = { ...p.basePosition }
    this.currentScale               = 1
    this.currentOpacity             = 1
    return this
  }
}
