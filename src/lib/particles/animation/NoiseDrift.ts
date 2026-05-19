// ── NoiseDrift ─────────────────────────────────────────────────────────────────
//
// Sinusoidal organic drift — fast, deterministic, mobile-friendly.
// No Perlin/Simplex dependency; Perlin arrives in Sprint P7.
//
// Returns a Vec2 offset added to the particle's evaluated position each frame.

import type { Vec2 } from '@/lib/types'

/**
 * @param ageMs     Particle age in ms
 * @param seedPhase Per-particle phase offset (from spawn) — ensures each particle
 *                  drifts differently even with the same emitter config.
 * @param amount    Pixel amplitude (half the full swing)
 * @param speed     Drift speed in cycles per second (default 1)
 */
export function evaluateNoiseDrift(
  ageMs:     number,
  seedPhase: number,
  amount:    number,
  speed:     number = 1,
): Vec2 {
  const t = ageMs / 1000  // convert to seconds
  return {
    x: Math.sin(t * speed * Math.PI * 2 + seedPhase)           * amount,
    y: Math.cos(t * speed * Math.PI * 2 * 0.7 + seedPhase + 1) * amount * 0.35,
  }
}
