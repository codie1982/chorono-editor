/** Built-in modifier plugins (BL-46..49).
 *
 *  Each modifier is a ModifierPlugin registered into `modifierRegistry`:
 *    • evaluate(ctx, m) — pure (ctx, params) → modifier value
 *                         (NOT the final blended value — blending is pipeline.ts)
 *    • defaultParameters() — UI starting values for a freshly-added modifier
 *
 *  Dispatch is the registry lookup (no per-type switch). Adding a modifier
 *  kind = one new plugin + register(); evaluateModifier/defaultParametersFor
 *  below stay untouched.
 */

import type { CurveModifier, CurveModifierContext } from './types'
import { modifierRegistry, type ModifierPlugin } from './ModifierRegistry'
import { signedNoise1D, fbm1D, envelopeRamp } from '../noise/noise'
import {
  overshootOut, elasticOut, bounceOut, decayOscillation,
} from '../physics/easings'
import { getSpringValue } from '../physics/springCache'
import type { SpringParams } from '../physics/spring'

// ── Param readers ──────────────────────────────────────────────────────────
// All params are stored as Record<string, number | boolean | string> so
// readers normalize via fallback defaults.

function num(p: CurveModifier['parameters'], key: string, fallback: number): number {
  const v = p[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// ── Envelope helper (fade in / out at segment boundaries) ─────────────────
//
// localT ∈ [0,1]. Returns 1 in the middle, smoothly ramps to 0 at the
// edges depending on fadeIn / fadeOut. Used by Sine + Pulse so wave
// segments don't crackle when they start / stop.
function smoothstep(u: number): number { return u * u * (3 - 2 * u) }

function envelope(localT: number, fadeIn: number, fadeOut: number): number {
  let value = 1
  if (fadeIn > 0 && localT < fadeIn)        value *= smoothstep(localT / fadeIn)
  if (fadeOut > 0 && localT > 1 - fadeOut)  value *= smoothstep((1 - localT) / fadeOut)
  return value
}

// ── Sine ──────────────────────────────────────────────────────────────────
// A·sin(2πf·u + φ) + offset, gated by a fadeIn/fadeOut envelope.
const sineModifier: ModifierPlugin = {
  type: 'sine',
  evaluate(ctx, m) {
    const p = m.parameters
    const amplitude = num(p, 'amplitude', 1)
    const frequency = num(p, 'frequency', 1)
    const phase     = num(p, 'phase',     0)
    const offset    = num(p, 'offset',    0)
    const fadeIn    = num(p, 'fadeIn',    0)
    const fadeOut   = num(p, 'fadeOut',   0)
    const w = Math.sin(2 * Math.PI * frequency * ctx.localT + phase) * amplitude + offset
    return w * envelope(ctx.localT, fadeIn, fadeOut)
  },
  defaultParameters: () => ({ amplitude: 10, frequency: 2, phase: 0, offset: 0, fadeIn: 0, fadeOut: 0 }),
}

// ── Pulse (square wave) ───────────────────────────────────────────────────
const pulseModifier: ModifierPlugin = {
  type: 'pulse',
  evaluate(ctx, m) {
    const p = m.parameters
    const amplitude = num(p, 'amplitude', 1)
    const frequency = num(p, 'frequency', 1)
    const duty      = Math.max(0, Math.min(1, num(p, 'duty', 0.5)))
    const fadeIn    = num(p, 'fadeIn',  0)
    const fadeOut   = num(p, 'fadeOut', 0)
    // Wave: phase ∈ [0,1); high during [0, duty), low after.
    const phase = ((ctx.localT * frequency) % 1 + 1) % 1
    const square = phase < duty ? 1 : -1
    return square * amplitude * envelope(ctx.localT, fadeIn, fadeOut)
  },
  defaultParameters: () => ({ amplitude: 10, frequency: 2, duty: 0.5, fadeIn: 0, fadeOut: 0 }),
}

// ── Quantize ──────────────────────────────────────────────────────────────
// Snap currentValue to the nearest multiple of step (stop-motion, pixel-grid).
const quantizeModifier: ModifierPlugin = {
  type: 'quantize',
  evaluate(ctx, m) {
    const step = num(m.parameters, 'step', 1)
    if (step <= 0) return ctx.currentValue
    return Math.round(ctx.currentValue / step) * step
  },
  defaultParameters: () => ({ step: 1 }),
}

// ── Offset ────────────────────────────────────────────────────────────────
// Add a constant. With blendMode='add' the weight controls the offset size.
const offsetModifier: ModifierPlugin = {
  type: 'offset',
  evaluate: (ctx, m) => ctx.currentValue + num(m.parameters, 'delta', 0),
  defaultParameters: () => ({ delta: 0 }),
}

// ── Scale ─────────────────────────────────────────────────────────────────
// Multiply currentValue by a factor (multiply identity = 1).
const scaleModifier: ModifierPlugin = {
  type: 'scale',
  evaluate: (ctx, m) => ctx.currentValue * num(m.parameters, 'factor', 1),
  defaultParameters: () => ({ factor: 1 }),
}

// ── Clamp ─────────────────────────────────────────────────────────────────
// Constrain to [min, max] — typically the tail of the stack.
const clampModifier: ModifierPlugin = {
  type: 'clamp',
  evaluate(ctx, m) {
    const lo = num(m.parameters, 'min', -Infinity)
    const hi = num(m.parameters, 'max',  Infinity)
    return Math.max(lo, Math.min(hi, ctx.currentValue))
  },
  defaultParameters: () => ({ min: 0, max: 1 }),
}

// ── Noise (BL-47) ─────────────────────────────────────────────────────────
// Smooth value noise around 0 (signed). The seed is XORed with the modifier
// id (via hashTrackSeed in pipeline) so two noise modifiers look different.
const noiseModifier: ModifierPlugin = {
  type: 'noise',
  evaluate(ctx, m) {
    const p = m.parameters
    const seedOffset = num(p, 'seed', 0)
    const frequency  = num(p, 'frequency', 4)
    const strength   = num(p, 'strength', 10)
    const positiveOnly = p.positiveOnly === true
    const rampIn  = num(p, 'rampIn', 0)
    const rampOut = num(p, 'rampOut', 0)
    let n = signedNoise1D(ctx.localT * frequency, ctx.seed + seedOffset)
    if (positiveOnly) n = (n + 1) * 0.5
    return n * strength * envelopeRamp(ctx.localT, rampIn, rampOut)
  },
  defaultParameters: () => ({ seed: 0, frequency: 4, strength: 10, positiveOnly: false, rampIn: 0, rampOut: 0 }),
}

// ── Fractal Noise (BL-47) ─────────────────────────────────────────────────
// Multi-octave fBm — wind, organic motion, paper texture, etc.
const fractalNoiseModifier: ModifierPlugin = {
  type: 'fractalNoise',
  evaluate(ctx, m) {
    const p = m.parameters
    const seedOffset = num(p, 'seed', 0)
    const frequency  = num(p, 'frequency', 4)
    const strength   = num(p, 'strength', 10)
    const positiveOnly = p.positiveOnly === true
    const octaves    = Math.max(1, Math.min(8, Math.round(num(p, 'octaves', 4))))
    const lacunarity = num(p, 'lacunarity', 2)
    const gain       = num(p, 'gain', 0.5)
    const rampIn     = num(p, 'rampIn',  0)
    const rampOut    = num(p, 'rampOut', 0)
    let n = fbm1D(ctx.localT * frequency, ctx.seed + seedOffset, octaves, lacunarity, gain)
    if (positiveOnly) n = (n + 1) * 0.5
    return n * strength * envelopeRamp(ctx.localT, rampIn, rampOut)
  },
  defaultParameters: () => ({ seed: 0, frequency: 4, strength: 10, positiveOnly: false, octaves: 4, lacunarity: 2, gain: 0.5, rampIn: 0, rampOut: 0 }),
}

// ── Jitter (BL-47) ────────────────────────────────────────────────────────
// Step-quantized noise — fresh random value every 1/frequency, held until the
// next step. Camera shake / UI vibration / glitch (sharp transitions).
const jitterModifier: ModifierPlugin = {
  type: 'jitter',
  evaluate(ctx, m) {
    const p = m.parameters
    const seedOffset = num(p, 'seed', 0)
    const frequency  = num(p, 'frequency', 8)
    const strength   = num(p, 'strength', 10)
    const stepIndex = Math.floor(ctx.localT * frequency)
    return signedNoise1D(stepIndex, ctx.seed + seedOffset) * strength
  },
  defaultParameters: () => ({ seed: 0, frequency: 8, strength: 10 }),
}

// ── Wave (BL-47) ──────────────────────────────────────────────────────────
// Generalized waveform: sine|cosine|square|triangle|sawtooth|reverseSawtooth.
// No envelope (unlike the Sine modifier) — pure periodic for modifier chains.
const waveModifier: ModifierPlugin = {
  type: 'wave',
  evaluate(ctx, m) {
    const p = m.parameters
    const amplitude = num(p, 'amplitude', 1)
    const frequency = num(p, 'frequency', 1)
    const phase     = num(p, 'phase',     0)
    const duty      = Math.max(0, Math.min(1, num(p, 'duty', 0.5)))
    const form = typeof p.form === 'string' ? p.form : 'sine'
    const u = ctx.localT * frequency + phase / (2 * Math.PI)
    const t = ((u % 1) + 1) % 1
    let v: number
    switch (form) {
      case 'cosine':           v = Math.cos(2 * Math.PI * (u)); break
      case 'square':           v = t < duty ? 1 : -1;           break
      case 'triangle':         v = 1 - 4 * Math.abs(t - 0.5);   break
      case 'sawtooth':         v = t * 2 - 1;                   break
      case 'reverseSawtooth':  v = 1 - t * 2;                   break
      case 'sine':
      default:                 v = Math.sin(2 * Math.PI * u);
    }
    return v * amplitude
  },
  defaultParameters: () => ({ form: 'sine', amplitude: 1, frequency: 1, phase: 0, duty: 0.5 }),
}

// ── Physics modifiers (BL-49) ─────────────────────────────────────────────
// All stateless except Spring (state cached by track+modifier id — see
// springCache.ts). They return the eased/target value; pick blendMode to taste.

// Overshoot — eases u → 1 with a small overshoot then settle.
const overshootModifier: ModifierPlugin = {
  type: 'overshoot',
  evaluate: (ctx, m) =>
    overshootOut(ctx.localT, num(m.parameters, 'tension', 1.70158)) * num(m.parameters, 'amplitude', 1),
  defaultParameters: () => ({ amplitude: 1, tension: 1.70158 }),
}

// Elastic — wobbling settle around target.
const elasticModifier: ModifierPlugin = {
  type: 'elastic',
  evaluate: (ctx, m) =>
    elasticOut(ctx.localT, num(m.parameters, 'amplitude', 1), num(m.parameters, 'period', 0.3)),
  defaultParameters: () => ({ amplitude: 1, period: 0.3 }),
}

// Bounce — accelerating drops, classic Robert Penner bounce.
const bounceModifier: ModifierPlugin = {
  type: 'bounce',
  evaluate: (ctx, m) => bounceOut(ctx.localT) * num(m.parameters, 'amplitude', 1),
  defaultParameters: () => ({ amplitude: 1 }),
}

// Decay — damped sinusoidal oscillation: A·e^(-λt)·sin(2πft + φ).
const decayModifier: ModifierPlugin = {
  type: 'decay',
  evaluate(ctx, m) {
    const p = m.parameters
    return decayOscillation(
      ctx.localT,
      num(p, 'amplitude', 10),
      num(p, 'frequency', 4),
      num(p, 'damping',   3),
      num(p, 'phase',     0),
    )
  },
  defaultParameters: () => ({ amplitude: 10, frequency: 4, damping: 3, phase: 0 }),
}

// Spring — stateful mass-spring-damper chasing ctx.baseValue. State cached by
// (track key, modId); seed is the deterministic track stand-in (see pipeline).
const springModifier: ModifierPlugin = {
  type: 'spring',
  evaluate(ctx, m) {
    const p = m.parameters
    const params: SpringParams = {
      stiffness: num(p, 'stiffness', 170),
      damping:   num(p, 'damping',   26),
      mass:      num(p, 'mass',      1),
    }
    const cacheTrackKey = String(ctx.seed)
    return getSpringValue(cacheTrackKey, m.id, ctx.baseValue, ctx.timeMs, params)
  },
  defaultParameters: () => ({ stiffness: 170, damping: 26, mass: 1 }),
}

// ── Registration ──────────────────────────────────────────────────────────
// `timeWarp` is intentionally absent — the track field handles it; an unknown
// modifier type falls through to the no-op below.
const BUILTIN_MODIFIERS: ModifierPlugin[] = [
  sineModifier, pulseModifier, quantizeModifier, offsetModifier, scaleModifier, clampModifier,
  noiseModifier, fractalNoiseModifier, jitterModifier, waveModifier,
  overshootModifier, elasticModifier, bounceModifier, decayModifier, springModifier,
]
for (const plugin of BUILTIN_MODIFIERS) modifierRegistry.register(plugin)

// ── Public API ────────────────────────────────────────────────────────────

/** Single entry point used by the pipeline. Unknown modifier kinds (reserved
 *  for future sprints, e.g. timeWarp) no-op by returning currentValue. */
export function evaluateModifier(ctx: CurveModifierContext, m: CurveModifier): number {
  return modifierRegistry.get(m.type)?.evaluate(ctx, m) ?? ctx.currentValue
}

/** Default parameter set for a freshly-added modifier. Unknown kinds → {}. */
export function defaultParametersFor(type: CurveModifier['type']): CurveModifier['parameters'] {
  return modifierRegistry.get(type)?.defaultParameters() ?? {}
}
