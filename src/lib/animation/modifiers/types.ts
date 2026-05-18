/** Curve modifier types and the discriminated-union of modifier kinds
 *  (BL-46). Modifiers are applied AFTER base keyframe interpolation +
 *  AFTER out-of-range resolution; they reshape the value that's about
 *  to be written to the layer property.
 *
 *  See ANIMATION_SIGNAL_SYSTEM.md (BL-46 spec) and the doc this is
 *  derived from. Foundation sprint ships 6 modifier types:
 *
 *    sine | pulse | quantize | offset | scale | clamp
 *
 *  BL-47 will add: wave (square/triangle/saw), noise, fractalNoise, jitter
 *  BL-48 will add: timeWarp
 *  BL-49 will add: bounce, elastic, overshoot, decay, spring
 */

export type CurveModifierType =
  // Foundation (BL-46) ────────────────────────────────────────────────
  | 'sine'        // sinusoidal wave, optional fade envelope
  | 'pulse'       // square wave (on/off bursts)
  | 'quantize'    // round value to step
  | 'offset'      // add a constant
  | 'scale'       // multiply by a constant
  | 'clamp'       // limit to [min, max]
  // Future sprints — listed here so the union compiles end-to-end
  | 'wave'           // BL-47
  | 'noise'          // BL-47
  | 'fractalNoise'   // BL-47
  | 'jitter'         // BL-47
  | 'timeWarp'       // BL-48
  | 'bounce'         // BL-49
  | 'elastic'        // BL-49
  | 'overshoot'      // BL-49
  | 'decay'          // BL-49
  | 'spring'         // BL-49

export type CurveBlendMode =
  | 'add'        // currentValue + modValue * weight
  | 'multiply'   // currentValue * (1 + (modValue - 1) * weight)
  | 'replace'    // currentValue*(1-weight) + modValue*weight
  | 'blend'      // currentValue + (modValue - currentValue) * weight

export interface CurveModifier {
  /** Stable id — survives reorder, used as React key + undo target */
  id: string
  type: CurveModifierType
  enabled: boolean
  blendMode: CurveBlendMode
  /** 0..1 — typical UI slider; values >1 amplify */
  weight: number
  /** Modifier-specific parameters. Each modifier reads only the keys it
   *  knows about; unknown keys are ignored, missing keys fall back to
   *  defaults defined per modifier type. */
  parameters: Record<string, number | boolean | string>
}

/** Context passed to every modifier when evaluating. All fields are
 *  pre-computed by the evaluator; modifiers do NOT touch the scene. */
export interface CurveModifierContext {
  /** Absolute timeline time (ms) of the evaluation. */
  timeMs: number
  /** Segment-normalized time in [0, 1] — 0 at the segment's leading key,
   *  1 at the trailing key. For TRACK-scope modifiers we treat the whole
   *  track range as one segment. */
  localT: number
  segmentStartMs: number
  segmentEndMs:   number
  durationMs:     number
  /** The raw interpolated value BEFORE any modifier in the chain ran.
   *  Useful for modifiers that want to compute a delta from the base. */
  baseValue:    number
  /** The value AFTER the previous modifier ran. The current modifier
   *  reads this when computing its output (e.g. `clamp` reads currentValue,
   *  ignores baseValue). */
  currentValue: number
  /** Deterministic seed — hashed from trackId + modifier.id at evaluator
   *  prep time. Noise / jitter / fractal modifiers MUST use this instead
   *  of Math.random() so runtime is reproducible across platforms. */
  seed: number
}
