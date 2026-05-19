// ── ParticleEasing ─────────────────────────────────────────────────────────────
//
// Easing function resolver for LifeGradient stops.
// Reuses bezierEasing from evaluator.ts for 'customBezier'; built-in fast
// paths for the four standard easings.

import type { EasingType } from '@/lib/types'
import { bezierEasing } from '@/lib/evaluator'

export type EasingFn = (t: number) => number

const identity = (t: number) => t
const easeIn   = (t: number) => t * t * t
const easeOut  = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

// hold: jumps to new value at the stop position (step function)
const hold = (_t: number) => 0

const PRESETS: Record<string, EasingFn> = {
  linear:    identity,
  hold,
  easeIn,
  easeOut,
  easeInOut,
}

export function getEasing(easing?: EasingType): EasingFn {
  if (!easing || easing === 'linear') return identity
  return PRESETS[easing] ?? identity
}
