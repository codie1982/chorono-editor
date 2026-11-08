// ── ParticleSpawner ────────────────────────────────────────────────────────────
//
// Computes the set of ParticleInstance spawn params for a given emitter config
// and current time. Pure — no side-effects, no state.

import type { Vec2, ColorValue } from '@/lib/types'
import type {
  ParticleEmitterConfig, ParticleEmitterData, ParticleVisualConfig,
  ParticleRandomConfig, ParticleAnimationConfig, RangeNumber,
} from '../types'
import { ParticleInstance, type ParticleInstanceParams } from './ParticleInstance'
import { ParticlePool } from './ParticlePool'
import { ParticleRandom } from './ParticleRandom'
import { sampleRectangleEmission } from '../animation/EmissionArea'
import { resolveEmissionGeometry, type EmissionGeometry, type SourceLayerContext } from './EmissionGeometry'
export type { SourceLayerContext } from './EmissionGeometry'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sampleRange(rng: ParticleRandom, r: RangeNumber): number {
  return rng.range(r.min, r.max)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpColor(a: ColorValue, b: ColorValue, t: number): ColorValue {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
    a: Math.round(lerp(a.a, b.a, t)),
  }
}

// ── Spawn position by emitter shape ──────────────────────────────────────────

/**
 * Returns a spawn position in layer-local coordinates.
 * NOTE: Always consumes exactly 2 RNG values (even for 'point') to keep
 * the PRNG call sequence stable regardless of shape — this is the contract.
 *
 * Referenced path/source geometry is resolved into emitter-local coordinates
 * once per frame, including the two layers' independent parent transforms.
 */
function computeSpawnPosition(
  rng: ParticleRandom,
  cfg: ParticleEmitterConfig,
  sourceGeometry?: EmissionGeometry,
): Vec2 {
  const area = cfg.area ?? {}

  switch (cfg.shape) {
    case 'point': {
      rng.next()  // slot 1 — consumed to maintain sequence parity
      rng.next()  // slot 2
      return { x: 0, y: 0 }
    }

    case 'rectangle': {
      const hw = (area.width  ?? 100) / 2
      const hh = (area.height ?? 100) / 2
      return sampleRectangleEmission(rng.next(), rng.next(), hw, hh, !!area.emitFromEdge)
    }

    case 'circle': {
      // Uniform disk: sqrt prevents centre clustering
      const r    = area.radius ?? 50
      const angle = rng.next() * Math.PI * 2
      const radial = rng.next()
      const dist  = area.emitFromEdge ? r : Math.sqrt(radial) * r
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
      }
    }

    case 'line': {
      const a = area.lineStart ?? { x: -50, y: 0 }
      const b = area.lineEnd   ?? { x:  50, y: 0 }
      const t = rng.next()
      rng.next() // consume second slot
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
    }

    case 'path': {
      const u = rng.next(), v = rng.next()
      return sourceGeometry?.(u, v) ?? { x: 0, y: 0 }
    }

    case 'sourceLayer': {
      const u = rng.next(), v = rng.next()
      return sourceGeometry?.(u, v) ?? { x: 0, y: 0 }
    }
  }
}

// ── Color selection ───────────────────────────────────────────────────────────

function pickColor(rng: ParticleRandom, cfg: ParticleVisualConfig): ColorValue {
  switch (cfg.colorMode) {
    case 'single':
      return cfg.color ?? { r: 255, g: 255, b: 255, a: 255 }

    case 'palette':
      if (cfg.palette && cfg.palette.length > 0) return rng.pick(cfg.palette)
      return cfg.color ?? { r: 255, g: 255, b: 255, a: 255 }

    case 'random':
      // HSL random (vivid): use palette if provided, else random RGB
      if (cfg.palette && cfg.palette.length > 0) return rng.pick(cfg.palette)
      return {
        r: Math.round(rng.next() * 255),
        g: Math.round(rng.next() * 255),
        b: Math.round(rng.next() * 255),
        a: 255,
      }

    case 'gradientOverLife':
      // color is evaluated per-frame; base color = first stop or white
      if (cfg.colorOverLife && cfg.colorOverLife.stops.length > 0) {
        return cfg.colorOverLife.stops[0].value
      }
      return cfg.color ?? { r: 255, g: 255, b: 255, a: 255 }
  }
}

// ── Particle count per time ───────────────────────────────────────────────────

/**
 * Returns the array of ParticleInstanceParams for alive particles at `timeMs`.
 * Stateless — same inputs always produce the same output (deterministic).
 *
 * `sourceCtx` is required when the emitter shape is 'sourceLayer' so the
 * spawner can resolve the source layer's bounds; otherwise it's ignored.
 */
export function computeSpawnParams(
  cfg: ParticleEmitterData,
  relativeTimeMs: number,
  pool?: ParticlePool,
  sourceCtx?: SourceLayerContext,
): ParticleInstance[] {
  const { emitter, particle: vis, animation, random, rendering } = cfg

  // Effective duration (capped for loop case)
  const duration  = emitter.durationMs
  const startDelay = emitter.startDelayMs ?? 0

  // Time within the active window (accounting for loop)
  let localTime = relativeTimeMs - startDelay
  if (localTime < 0) return []
  if (emitter.loop) {
    localTime = ((localTime % duration) + duration) % duration
  }
  if (!emitter.loop && localTime > duration) return []

  // Master RNG for spawn sequence — same seed = same particles
  const masterRng = new ParticleRandom(random.seed)

  // Resolve sourceLayer geometry once per frame (constant across all particles)
  const srcGeom = ((emitter.shape === 'sourceLayer' || emitter.shape === 'path') && sourceCtx)
    ? resolveEmissionGeometry(sourceCtx, emitter)
    : undefined

  // Compute total particle count to simulate
  let totalParticles: number
  if (emitter.mode === 'burst') {
    totalParticles = Math.min(emitter.burstCount ?? 80, emitter.maxParticles)
  } else {
    // continuous: how many would have spawned by localTime
    const rate = emitter.ratePerSecond ?? 30
    totalParticles = Math.min(
      Math.ceil(rate * (localTime / 1000)),
      emitter.maxParticles,
    )
  }

  const alive: ParticleInstance[] = []
  let particleId = 0

  for (let i = 0; i < totalParticles; i++) {
    particleId++

    // ── PRNG sequence (contract — order must not change) ─────────────────────
    // 1. delay
    const delayFraction = rng_nextWithRandomness(masterRng, random.delayRandomness)
    let birthMs: number

    if (emitter.mode === 'burst') {
      // Burst: all born around time 0 with small jitter
      birthMs = delayFraction * 50  // up to 50ms jitter
    } else {
      const rate = emitter.ratePerSecond ?? 30
      const interval = 1000 / rate
      birthMs = i * interval + delayFraction * interval * random.delayRandomness
    }

    // 2. spawnXY (2 slots consumed inside)
    const spawnPos = computeSpawnPosition(
      masterRng, emitter,
      srcGeom,
    )

    // 3. lifetime
    const lifetimeMs = sampleRange(masterRng, animation.lifetimeMs)
      * (1 + masterRng.signed() * random.lifetimeRandomness)

    // 4. size
    const sizeRaw = sampleRange(masterRng, vis.size)
    const size    = sizeRaw * (1 + masterRng.signed() * random.sizeRandomness)

    // 5. color (may consume 1–2 RNG slots for 'random' colorMode)
    const baseColor = pickColor(masterRng, vis)

    // 6. rotationVelocity
    const rotVelocity = animation.rotationVelocity
      ? sampleRange(masterRng, animation.rotationVelocity)
      : 0

    // 7. seedPhase (for NoiseDrift)
    const seedPhase = masterRng.next() * Math.PI * 2

    // 8. baseRotation
    const baseRotation = masterRng.signed() * 180 * random.rotationRandomness

    // Position offset target
    const posOffset = animation.positionOffset
    const positionTarget: Vec2 = posOffset
      ? {
          x: sampleRange(masterRng, posOffset.x),
          y: sampleRange(masterRng, posOffset.y),
        }
      : { x: 0, y: 0 }

    // Position jitter
    const px = spawnPos.x + masterRng.signed() * 20 * random.positionRandomness
    const py = spawnPos.y + masterRng.signed() * 20 * random.positionRandomness

    const params: ParticleInstanceParams = {
      id:               particleId,
      birthTimeMs:      birthMs,
      lifetimeMs:       Math.max(lifetimeMs, 50),
      basePosition:     { x: px, y: py },
      baseSize:         Math.max(size, 0.5),
      baseRotation,
      rotationVelocity: rotVelocity,
      baseColor,
      shape:            vis.shape,
      seedPhase,
      positionTarget,
    }

    // Check if alive at localTime
    const age = localTime - params.birthTimeMs
    if (age >= 0 && age <= params.lifetimeMs) {
      const inst = pool ? pool.acquire(params) : new ParticleInstance(params)
      alive.push(inst)
    }
  }

  return alive
}

// ── Helper: apply randomness factor to an RNG call ────────────────────────────

function rng_nextWithRandomness(rng: ParticleRandom, randomness: number): number {
  return rng.next() * randomness
}
