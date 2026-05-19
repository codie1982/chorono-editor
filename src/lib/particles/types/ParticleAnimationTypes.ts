// ── Particle Animation Types ───────────────────────────────────────────────────
// LifeGradient, MotionModifier, BurstMarker — all serializable.

import type { EasingType, ColorValue, Vec2 } from '@/lib/types'
import type { RangeNumber } from './ParticleEmitterTypes'

// ── LifeGradient ─────────────────────────────────────────────────────────────
//
// Generic gradient evaluated over particle lifetime (0 = birth, 1 = death).
// Works for numbers (opacity, scale) and colors.

export interface LifeGradientStop<T> {
  /** Normalized life position 0–1. */
  t:       number
  value:   T
  /** Easing applied from the PREVIOUS stop to this one. */
  easing?: EasingType
}

export interface ParticleLifeGradient<T> {
  stops: LifeGradientStop<T>[]
}

// ── Motion modifiers ──────────────────────────────────────────────────────────

export type MotionModifierType = 'noiseDrift' | 'sineWave' | 'spiral'

export interface MotionModifierConfig {
  type:    MotionModifierType
  enabled: boolean
  /** Pixel amplitude of the motion */
  amount?: number
  /** Cycles per second */
  speed?:  number
  /** Phase offset in radians */
  phase?:  number
}

// ── Animation config ──────────────────────────────────────────────────────────

export interface ParticleAnimationConfig {
  lifetimeMs:        RangeNumber
  /** Drift from spawn point over lifetime */
  positionOffset?:  {
    x: RangeNumber
    y: RangeNumber
    easing?: EasingType
  }
  /** Scale multiplier over lifetime */
  scaleOverLife?:   ParticleLifeGradient<number>
  /** Opacity over lifetime */
  opacityOverLife?: ParticleLifeGradient<number>
  /** Angular velocity range (deg/sec) */
  rotationVelocity?: RangeNumber
  motionModifiers?:  MotionModifierConfig[]
}

// ── Burst markers ─────────────────────────────────────────────────────────────
// Additional bursts at specific timeline positions (V2).

export interface ParticleBurstMarker {
  id: string
  /** Composition-time position in ms */
  timeMs:      number
  count:       number
  /** Offset added to the master seed — each marker gets a unique distribution */
  seedOffset?: number
  /** If set, this burst uses a different preset's config */
  presetId?:   string
}
