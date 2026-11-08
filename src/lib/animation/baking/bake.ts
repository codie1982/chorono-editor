/** Track baking (BL-51).
 *
 *  Converts an "active" track (with modifiers / out-of-range / time warp /
 *  procedural controller) into a flat keyframe array that any consumer
 *  can interpret with the existing linear/bezier interpolator. The
 *  bake-then-export workflow is what makes the runtime able to play
 *  modifier-heavy scenes on low-end devices without shipping the whole
 *  evaluator.
 *
 *  Pipeline:
 *    1. Sample evaluateTrack(track, t) at fixed FPS across [startMs, endMs].
 *    2. RDP-simplify the (timeMs, value) sequence to `tolerance`.
 *    3. Emit linear-easing keyframes (one per kept sample). Caller can
 *       wrap into a NEW track that has `modifiers: undefined`,
 *       `controller: undefined`, `outOfRange: undefined` — guaranteed
 *       playback parity within the tolerance.
 */

import type { Track, Keyframe } from '../../types'
import { evaluateTrack } from '../../evaluator'
import { simplifyRDP, type Sample } from './simplify'
import { isScalarNumericTrack } from '../typedValues'

export interface BakeOptions {
  /** Inclusive start time of the bake window (ms). */
  startMs:   number
  /** Inclusive end time of the bake window (ms). */
  endMs:     number
  /** Sample rate. 60 → one sample every ~16.66ms. */
  fps:       number
  /** RDP tolerance in normalised [0..1] units (fraction of bbox).
   *  0 disables simplification (raw sampled kfs). Typical: 0.005 - 0.02. */
  tolerance: number
}

/** Sample a track densely across the bake window. */
export function sampleTrackDense(track: Track, opts: BakeOptions): Sample[] {
  const stepMs = 1000 / Math.max(1, opts.fps)
  const out: Sample[] = []
  for (let t = opts.startMs; t <= opts.endMs + 0.0001; t += stepMs) {
    const v = evaluateTrack(track, t)
    if (typeof v === 'number') out.push({ timeMs: t, value: v })
  }
  // Always ensure the endMs sample is present (loop may stop one step short).
  if (out.length === 0 || out[out.length - 1].timeMs < opts.endMs) {
    const v = evaluateTrack(track, opts.endMs)
    if (typeof v === 'number') out.push({ timeMs: opts.endMs, value: v })
  }
  return out
}

/** Bake a track to a fresh array of linear-easing keyframes. The returned
 *  kfs have stable ids derived from index so a re-bake of the same window
 *  produces deterministic diff (cheap to undo/redo). */
export function bakeTrackToKeyframes(track: Track, opts: BakeOptions): Keyframe[] {
  if (!isScalarNumericTrack(track)) {
    throw new Error('Baking supports scalar numeric tracks only; color, vector and discrete tracks must retain their typed keys.')
  }
  const raw = sampleTrackDense(track, opts)
  const simplified = simplifyRDP(raw, opts.tolerance)
  return simplified.map((s, i) => ({
    id:     `baked_${i}_${Math.round(s.timeMs)}`,
    timeMs: s.timeMs,
    value:  s.value,
    easing: { type: 'linear' },
  }))
}

/** Return a new Track with the modifier / OOR / time-warp / procedural-
 *  controller fields stripped and `keyframes` replaced by the baked
 *  sequence. Use this when shipping a "frozen" runtime version of a
 *  signal-system-heavy scene. */
export function bakeTrack(track: Track, opts: BakeOptions): Track {
  const keyframes = bakeTrackToKeyframes(track, opts)
  return {
    target: track.target,
    label:  track.label,
    keyframes,
    kind:   'property',
    // All signal-system fields intentionally dropped:
    // outOfRange / modifiers / easeCurve / timeWarp / multiplierCurve /
    // multiplierAmplitude / controller are all undefined in the result.
  }
}
