// ── Particle Channel Types ─────────────────────────────────────────────────────
// V3 Flow Mode foundation. Not used in V1 Simple Mode evaluator.
// Stub lives here so the type is importable without circular deps.

import type { Vec2, ColorValue } from '@/lib/types'

/**
 * Per-particle data channels read/written by V3 Flow Operators.
 * In V1, ParticleInstance.currentXxx mirrors this shape but stays mutable fields.
 * In V3, ParticleInstance is replaced by an object implementing ParticleChannels.
 */
export interface ParticleChannels {
  // Physical
  position:     Vec2
  velocity:     Vec2
  acceleration: Vec2

  // Life
  ageMs:        number
  lifetimeMs:   number
  /** ageMs / lifetimeMs clamped to [0,1] */
  progress:     number

  // Visual
  size:         number
  scale:        number
  rotation:     number
  opacity:      number
  color:        ColorValue

  // Routing (V3)
  eventId:      string
  random:       number  // per-particle seeded float [0,1]

  // Extensible custom channels
  custom: Record<string, number | Vec2 | ColorValue | boolean>
}

/**
 * Placeholder for V3 ParticleFlowGraph — stored on ParticleEmitterData.flow.
 * Full definition lands in Sprint P5.
 */
export interface ParticleFlowGraphStub {
  _version: 'v3-stub'
}
