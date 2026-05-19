// ── Particle Emitter Types ─────────────────────────────────────────────────────
// Core configuration interfaces for the particle emitter system (BL-13).
// All configs are plain JSON — serializable, diffable, undoable.

import type { Vec2, ColorValue, EasingType } from '@/lib/types'

// ── Math helpers ──────────────────────────────────────────────────────────────

export interface RangeNumber { min: number; max: number }
export type RangeOrFixed = number | RangeNumber

// ── Emitter ───────────────────────────────────────────────────────────────────

export type EmitterMode  = 'continuous' | 'burst'
export type EmitterShape = 'point' | 'line' | 'circle' | 'rectangle' | 'path' | 'sourceLayer'

export interface EmitterArea {
  /** rectangle: half-extents */
  width?:       number
  height?:      number
  /** circle: radius in px */
  radius?:      number
  /** line: endpoints in layer-local coords */
  lineStart?:   Vec2
  lineEnd?:     Vec2
  /** path emitter: id of a sibling bezierPath layer */
  pathLayerId?: string
  /** sourceLayer emitter: any layer id whose bounds drive the emit area.
   *  The particle layer reads the source's transform.x/y, size, and shape to
   *  sample spawn points. Updated live each frame so animating the source
   *  also moves the emit region. */
  sourceLayerId?: string
  /** If true, particles spawn on the edge, not inside the area */
  emitFromEdge?: boolean
}

export interface ParticleEmitterConfig {
  mode:           EmitterMode
  shape:          EmitterShape
  /** Continuous mode: particles emitted per second */
  ratePerSecond?: number
  /** Burst mode: particles per burst */
  burstCount?:    number
  /** Hard cap on simultaneously-alive particles */
  maxParticles:   number
  /** How long the emitter runs (ms). Continuous wraps; burst fires once. */
  durationMs:     number
  loop:           boolean
  /** Delay before first emit (ms) */
  startDelayMs?:  number
  area?:          EmitterArea
}

// ── Particle visual ───────────────────────────────────────────────────────────

export type ParticleShape =
  | 'circle' | 'softCircle'
  | 'rect'   | 'roundedRect'
  | 'line'
  | 'star'
  | 'triangle'
  | 'smokePuff'
  | 'flameBlob'

export type ParticleColorMode = 'single' | 'palette' | 'random' | 'gradientOverLife'

export interface ParticleStrokeConfig {
  enabled: boolean
  color:   ColorValue
  width:   number
}

export interface ParticleVisualConfig {
  shape:     ParticleShape
  size:      RangeNumber     // randomized per-particle between min/max
  colorMode: ParticleColorMode
  color?:    ColorValue                        // colorMode === 'single'
  palette?:  ColorValue[]                      // colorMode === 'palette' | 'random'
  colorOverLife?: import('./ParticleAnimationTypes').ParticleLifeGradient<ColorValue>
  stroke?:   ParticleStrokeConfig
  /** star: tip count (default 5) */
  starPoints?:    number
  /** star: inner radius / outer radius ratio (default 0.4) */
  starInnerRatio?: number
}

// ── Random config ─────────────────────────────────────────────────────────────

export interface ParticleRandomConfig {
  /** Master seed — same seed = same visual every frame (deterministic) */
  seed: number
  /** 0–1: spread of initial position from spawn point */
  positionRandomness:  number
  sizeRandomness:      number
  rotationRandomness:  number
  delayRandomness:     number
  lifetimeRandomness:  number
  colorRandomness:     number
}

// ── Root emitter data ─────────────────────────────────────────────────────────
// Imported by core.ts Layer as `particleEmitter?: ParticleEmitterData`.

export interface ParticleEmitterData {
  /** 'simple': stateless evaluator (V1). 'flow': ParticleFlowGraph (V3). */
  mode:      'simple' | 'flow'
  emitter:   ParticleEmitterConfig
  particle:  ParticleVisualConfig
  animation: import('./ParticleAnimationTypes').ParticleAnimationConfig
  random:    ParticleRandomConfig
  rendering: import('./ParticleRenderingTypes').ParticleRenderingConfig
  /** BurstMarkers extend the timeline with additional on-demand bursts (V2). */
  burstMarkers?: import('./ParticleAnimationTypes').ParticleBurstMarker[]
  /** Flow graph — only when mode === 'flow' (V3). */
  flow?: import('./ParticleChannelTypes').ParticleFlowGraphStub
}
