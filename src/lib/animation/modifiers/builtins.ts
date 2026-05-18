/** Built-in modifier evaluators (BL-46).
 *
 *  Each evaluator is a pure function: (ctx, params) → modifier value
 *  (NOT the final blended value — blending happens in pipeline.ts).
 *
 *  Foundation set:
 *    sine     — A·sin(2πf·u + φ) + offset · envelope(fadeIn, fadeOut)
 *    pulse    — squareWave(u, f, duty) · amplitude
 *    quantize — round(v / step) · step                     (reads currentValue)
 *    offset   — currentValue + delta                       (reads currentValue)
 *    scale    — currentValue · factor                      (reads currentValue)
 *    clamp    — max(min, min(max, currentValue))           (reads currentValue)
 *
 *  Six future modifier kinds (wave / noise / fractal / jitter / timeWarp /
 *  physics ones) get evaluators in BL-47..BL-49; this file ships only
 *  the foundation six so the pipeline + UI can ship today.
 */

import type { CurveModifier, CurveModifierContext } from './types'
import { signedNoise1D, fbm1D, envelopeRamp } from '../noise/noise'

// ── Param readers ──────────────────────────────────────────────────────────
// All params are stored as Record<string, number | boolean | string> so
// readers normalize via fallback defaults. Keeping defaults inline (not
// per-modifier classes) keeps the dispatcher tiny.

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
// Params: amplitude=1, frequency=1, phase=0, offset=0, fadeIn=0, fadeOut=0
export function evalSine(ctx: CurveModifierContext, m: CurveModifier): number {
  const p = m.parameters
  const amplitude = num(p, 'amplitude', 1)
  const frequency = num(p, 'frequency', 1)
  const phase     = num(p, 'phase',     0)
  const offset    = num(p, 'offset',    0)
  const fadeIn    = num(p, 'fadeIn',    0)
  const fadeOut   = num(p, 'fadeOut',   0)
  const w = Math.sin(2 * Math.PI * frequency * ctx.localT + phase) * amplitude + offset
  return w * envelope(ctx.localT, fadeIn, fadeOut)
}

// ── Pulse (square wave) ───────────────────────────────────────────────────
// Params: amplitude=1, frequency=1, duty=0.5 (∈[0,1]), fadeIn=0, fadeOut=0
export function evalPulse(ctx: CurveModifierContext, m: CurveModifier): number {
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
}

// ── Quantize ──────────────────────────────────────────────────────────────
// Snap currentValue to the nearest multiple of step. Useful for stop-motion,
// pixel-grid, integer counts.
// Params: step=1
export function evalQuantize(ctx: CurveModifierContext, m: CurveModifier): number {
  const step = num(m.parameters, 'step', 1)
  if (step <= 0) return ctx.currentValue
  return Math.round(ctx.currentValue / step) * step
}

// ── Offset ────────────────────────────────────────────────────────────────
// Add a constant. With blendMode='add' the weight controls the offset size.
// Params: delta=0
export function evalOffset(ctx: CurveModifierContext, m: CurveModifier): number {
  return ctx.currentValue + num(m.parameters, 'delta', 0)
}

// ── Scale ─────────────────────────────────────────────────────────────────
// Multiply currentValue by a factor. With blendMode='replace' + weight=1
// this exactly multiplies. Defaults to multiply identity (1).
// Params: factor=1
export function evalScale(ctx: CurveModifierContext, m: CurveModifier): number {
  return ctx.currentValue * num(m.parameters, 'factor', 1)
}

// ── Clamp ─────────────────────────────────────────────────────────────────
// Constrain to [min, max]. Useful at the tail of the stack to prevent
// upstream modifiers from pushing past a safe range.
// Params: min=-Infinity, max=Infinity
export function evalClamp(ctx: CurveModifierContext, m: CurveModifier): number {
  const lo = num(m.parameters, 'min', -Infinity)
  const hi = num(m.parameters, 'max',  Infinity)
  return Math.max(lo, Math.min(hi, ctx.currentValue))
}

// ── Noise (BL-47) ─────────────────────────────────────────────────────────
// Smooth value noise around 0 (signed). The seed is XORed with the
// modifier's id (via hashTrackSeed in pipeline) so two noise modifiers
// on the same track look different.
// Params:
//   seed=0, frequency=4, strength=10, positiveOnly=false,
//   rampIn=0, rampOut=0
export function evalNoise(ctx: CurveModifierContext, m: CurveModifier): number {
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
}

// ── Fractal Noise (BL-47) ─────────────────────────────────────────────────
// Multi-octave fBm — wind, organic motion, paper texture, etc.
// Params:
//   seed=0, frequency=4, strength=10, positiveOnly=false,
//   octaves=4, lacunarity=2, gain=0.5, rampIn=0, rampOut=0
export function evalFractalNoise(ctx: CurveModifierContext, m: CurveModifier): number {
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
}

// ── Jitter (BL-47) ────────────────────────────────────────────────────────
// Step-quantized noise — picks a fresh random value every 1/frequency of
// the segment, holds it until the next step. Use for cameras shake / UI
// vibration / glitch effects (sharp transitions, no smooth interpolation).
// Params: seed=0, frequency=8, strength=10
export function evalJitter(ctx: CurveModifierContext, m: CurveModifier): number {
  const p = m.parameters
  const seedOffset = num(p, 'seed', 0)
  const frequency  = num(p, 'frequency', 8)
  const strength   = num(p, 'strength', 10)
  const stepIndex = Math.floor(ctx.localT * frequency)
  return signedNoise1D(stepIndex, ctx.seed + seedOffset) * strength
}

// ── Wave (BL-47) ──────────────────────────────────────────────────────────
// Generalized waveform: sine | cosine | square | triangle | sawtooth |
// reverseSawtooth. Different from Sine modifier because no envelope —
// pure periodic, intended for use in modifier chains where envelope is
// already applied elsewhere (or undesired).
// Params: form='sine', amplitude=1, frequency=1, phase=0, duty=0.5
export function evalWave(ctx: CurveModifierContext, m: CurveModifier): number {
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
}

// ── Dispatcher ────────────────────────────────────────────────────────────
// Single entry point used by the pipeline. Unknown modifier kinds (those
// reserved for future sprints) currently no-op by returning currentValue
// so the UI can store them without crashing the runtime.
export function evaluateModifier(ctx: CurveModifierContext, m: CurveModifier): number {
  switch (m.type) {
    case 'sine':         return evalSine(ctx, m)
    case 'pulse':        return evalPulse(ctx, m)
    case 'quantize':     return evalQuantize(ctx, m)
    case 'offset':       return evalOffset(ctx, m)
    case 'scale':        return evalScale(ctx, m)
    case 'clamp':        return evalClamp(ctx, m)
    case 'noise':        return evalNoise(ctx, m)
    case 'fractalNoise': return evalFractalNoise(ctx, m)
    case 'jitter':       return evalJitter(ctx, m)
    case 'wave':         return evalWave(ctx, m)
    // BL-48 / BL-49 modifiers — no-op until those sprints ship.
    default:             return ctx.currentValue
  }
}

// ── Default parameter sets per modifier type ──────────────────────────────
// Used when adding a fresh modifier from the UI — gives a sensible
// starting shape without forcing the user to fill in every field.
export function defaultParametersFor(type: CurveModifier['type']): CurveModifier['parameters'] {
  switch (type) {
    case 'sine':         return { amplitude: 10, frequency: 2, phase: 0, offset: 0, fadeIn: 0, fadeOut: 0 }
    case 'pulse':        return { amplitude: 10, frequency: 2, duty: 0.5, fadeIn: 0, fadeOut: 0 }
    case 'quantize':     return { step: 1 }
    case 'offset':       return { delta: 0 }
    case 'scale':        return { factor: 1 }
    case 'clamp':        return { min: 0, max: 1 }
    // BL-47
    case 'noise':        return { seed: 0, frequency: 4, strength: 10, positiveOnly: false, rampIn: 0, rampOut: 0 }
    case 'fractalNoise': return { seed: 0, frequency: 4, strength: 10, positiveOnly: false, octaves: 4, lacunarity: 2, gain: 0.5, rampIn: 0, rampOut: 0 }
    case 'jitter':       return { seed: 0, frequency: 8, strength: 10 }
    case 'wave':         return { form: 'sine', amplitude: 1, frequency: 1, phase: 0, duty: 0.5 }
    default:             return {}
  }
}
