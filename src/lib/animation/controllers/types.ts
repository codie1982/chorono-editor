/** Procedural Track Controllers (BL-50).
 *
 *  Until now every Track was implicitly a "keyframe controller" — its
 *  value at time t was found by interpolating between adjacent kfs in
 *  track.keyframes. With this sprint a Track can opt OUT of keyframes
 *  entirely and source its value from a procedural formula instead.
 *
 *  Two formula types ship today:
 *
 *    waveform  — sine / cosine / square / triangle / sawtooth / reverseSawtooth
 *                with amplitude, frequency, phase, offset, duty.
 *    noise     — deterministic value noise / fbm with seed, frequency,
 *                strength, octaves, lacunarity, gain.
 *
 *  Compound / expression / layered controllers are intentionally deferred
 *  to a later sprint — they need a sandbox + dependency tracking that
 *  goes beyond a single pure formula.
 *
 *  Backward compat: `Track.controller` is OPTIONAL. Undefined → behave
 *  exactly as before (keyframe controller reading track.keyframes).
 *
 *  Pipeline order in evaluator (when controller is non-keyframe):
 *
 *      timeMs  →  resolveOutOfRange       (still honored — cycle/loop
 *                                          works around the formula too)
 *               →  CONTROLLER.sample(t)   (skip keyframe bracket logic)
 *               →  trackModifiers         (BL-46 — clamp/scale/etc. on top)
 *               →  multiplierCurve        (BL-48)
 *               →  final
 *
 *  segmentModifiers are NOT applied because there are no segments —
 *  procedural controllers produce a continuous signal, not a chain of
 *  kf segments.
 */

export type WaveformShape =
  | 'sine'
  | 'cosine'
  | 'square'
  | 'triangle'
  | 'sawtooth'
  | 'reverseSawtooth'

export interface WaveformControllerParams {
  shape:     WaveformShape
  /** Peak-to-trough amplitude. Final output ∈ [offset-amp, offset+amp]. */
  amplitude: number
  /** Cycles per second. */
  frequency: number
  /** Phase shift in radians. */
  phase:     number
  /** Constant added to the wave (DC offset). */
  offset:    number
  /** Square wave duty cycle ∈ [0, 1]. Ignored for non-square shapes. */
  duty:      number
}

export interface NoiseControllerParams {
  seed:       number
  frequency:  number
  strength:   number
  /** When true, output ∈ [0, strength] instead of [-strength, +strength]. */
  positiveOnly: boolean
  /** Add a constant baseline (so noise oscillates around offset). */
  offset:     number
  /** Octaves of fBm. 1 = pure value noise. Max 8. */
  octaves:    number
  /** fBm frequency multiplier per octave. */
  lacunarity: number
  /** fBm amplitude decay per octave. */
  gain:       number
}

export type TrackController =
  | { type: 'keyframe' }                               // implicit when undefined
  | { type: 'waveform'; waveform: WaveformControllerParams }
  | { type: 'noise';    noise:    NoiseControllerParams }

export const DEFAULT_WAVEFORM_PARAMS: WaveformControllerParams = {
  shape:     'sine',
  amplitude: 50,
  frequency: 1,
  phase:     0,
  offset:    0,
  duty:      0.5,
}

export const DEFAULT_NOISE_PARAMS: NoiseControllerParams = {
  seed:        0,
  frequency:   4,
  strength:    50,
  positiveOnly: false,
  offset:      0,
  octaves:     1,
  lacunarity:  2,
  gain:        0.5,
}
