// ── LifeGradient ───────────────────────────────────────────────────────────────
//
// Generic evaluator for ParticleLifeGradient<T>.
// Works for both number (opacity, scale) and ColorValue gradients.

import type { ColorValue } from '@/lib/types'
import type { ParticleLifeGradient } from '../types/ParticleAnimationTypes'
import { getEasing } from './ParticleEasing'

// ── Generic evaluator ─────────────────────────────────────────────────────────

export function evaluateLifeGradient<T>(
  gradient: ParticleLifeGradient<T>,
  progress:    number,
  interpolate: (a: T, b: T, t: number) => T,
): T {
  const stops = gradient.stops
  if (stops.length === 0) throw new Error('LifeGradient: empty stops array')
  if (stops.length === 1) return stops[0].value

  // Clamp to boundary
  if (progress <= stops[0].t)                return stops[0].value
  if (progress >= stops[stops.length - 1].t) return stops[stops.length - 1].value

  for (let i = 0; i < stops.length - 1; i++) {
    const cur = stops[i]
    const nxt = stops[i + 1]
    if (progress >= cur.t && progress < nxt.t) {
      const span   = nxt.t - cur.t
      const localT = span === 0 ? 1 : (progress - cur.t) / span
      const eased  = getEasing(nxt.easing)(localT)
      return interpolate(cur.value, nxt.value, eased)
    }
  }
  return stops[stops.length - 1].value
}

// ── Number specialization ─────────────────────────────────────────────────────

export function evalNumberGradient(
  g: ParticleLifeGradient<number>,
  progress: number,
): number {
  return evaluateLifeGradient(g, progress, (a, b, t) => a + (b - a) * t)
}

// ── ColorValue specialization ─────────────────────────────────────────────────

export function lerpColor(a: ColorValue, b: ColorValue, t: number): ColorValue {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
    a: Math.round(a.a + (b.a - a.a) * t),
  }
}

export function evalColorGradient(
  g: ParticleLifeGradient<ColorValue>,
  progress: number,
): ColorValue {
  return evaluateLifeGradient(g, progress, lerpColor)
}

// ── CSS helper ────────────────────────────────────────────────────────────────

export function colorToCss(c: ColorValue): string {
  return `rgba(${c.r},${c.g},${c.b},${(c.a / 255).toFixed(3)})`
}
