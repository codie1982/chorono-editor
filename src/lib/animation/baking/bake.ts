import type { Track, Keyframe } from '../../types'
import { createNumericTrackSampler } from '../../evaluator'
import { simplifyRDP, type Sample } from './simplify'
import { isScalarNumericTrack } from '../typedValues'
import { sameKeyTime, compareKeyTime } from '../../timeline/authoring/keyTimePolicy'

import { validateBakeOptions, type BakeOptions } from './BakeOptions'
export { validateBakeOptions, MAX_BAKE_SAMPLES, type BakeOptions } from './BakeOptions'
import { sampleBakeSignal } from './bakeSampling'
import { bakedKeysForSamples } from './bakeKeyframes'

/** Fixed-FPS samples plus exact terminal sample. Every evaluated value must be
 * finite scalar; an invalid sample rejects the whole conversion. Caller owns
 * the returned array. Source is never mutated, even on cancellation/failure. */
export function sampleTrackDense(track: Track, opts: BakeOptions): Sample[] {
  if (!isScalarNumericTrack(track)) throw new Error('Baking supports scalar numeric tracks only; color, vector and discrete tracks must retain their typed keys.')
  return sampleNumericSignal(createNumericTrackSampler(track), opts)
}

/** Sample an explicit finite numeric signal using the same bounded exact-end
 * schedule as track baking. The callback is a trusted domain sampler, never
 * generated code; buffers are caller-owned and cancellation is synchronous. */
export function sampleNumericSignal(sample: (timeMs: number) => number | null, opts: BakeOptions): Sample[] {
  return sampleBakeSignal(timeMs => {
    const value = sample(timeMs)
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Track has no finite numeric value at ${timeMs} ms.`)
    return value
  }, opts)
}

/** Linear key conversion with stable exact-time identities where possible.
 * Generated IDs include caller namespace + target + exact time, so different
 * tracks/timelines cannot share the old baked_0_0 ID accidentally. */
function keysFromSamples(track: Track, raw: Sample[], opts: BakeOptions): Keyframe[] {
  const samples = simplifyRDP(raw, opts.tolerance, { metric: 'value', signal: opts.signal, maxComparisons: 2_000_000 })
  return bakedKeysForSamples(track, samples, opts)
}

/** Bake window keys only; independent pure utility, with local deterministic IDs.
 * Scene consumers provide keyIdPrefix to distinguish equal targets in timelines. */
export function bakeTrackToKeyframes(track: Track, opts: BakeOptions): Keyframe[] {
  return keysFromSamples(track, sampleTrackDense(track, opts), opts)
}

/** Strip the evaluated signal fields only. Preserve unrelated track metadata
 * and authored keys strictly outside the chosen window. Signal conversion is
 * global: outside that window preserved keys/constant endpoints now drive the
 * track, not its removed controller/OOR/modifiers. UI must state this explicitly. */
function replaceSignal(track: Track, keys: Keyframe[], opts: BakeOptions): Track {
  const { controller: _controller, outOfRange: _oor, modifiers: _modifiers, easeCurve: _ease,
    timeWarp: _warp, multiplierCurve: _multiplier, multiplierAmplitude: _amplitude, ...metadata } = track
  const outside = track.keyframes.filter(key => key.timeMs < opts.startMs && !sameKeyTime(key.timeMs, opts.startMs)
    || key.timeMs > opts.endMs && !sameKeyTime(key.timeMs, opts.endMs))
  return { ...metadata, keyframes: [...outside, ...keys].sort(compareKeyTime) }
}

/** Immutable numeric signal conversion. Sampling is bounded/synchronous; the
 * editor owns preview cancellation and a single atomic source commit. */
export function bakeTrack(track: Track, opts: BakeOptions): Track {
  return prepareBake(track, opts).track
}

export interface BakeReport {
  sampleCount: number; keyCount: number; maxSampleError: number; maxMidpointError: number
  valueSpan: number; retainedOutsideKeys: number
}

/** Prepare a reusable preview and measured quality report with one sample pass.
 * Vertical simplification tolerance is checked at samples. Midpoint checks show
 * interpolation/sampling error separately; neither proves continuous equality
 * or catches every aliased/discontinuous/high-frequency signal. No source edit. */
export function prepareBake(track: Track, opts: BakeOptions): { track: Track; report: BakeReport } {
  if (!isScalarNumericTrack(track)) throw new Error('Baking supports scalar numeric tracks only; color, vector and discrete tracks must retain their typed keys.')
  return prepareNumericSignalBake(track, opts, createNumericTrackSampler(track))
}

/** Shared scalar conversion/quality measurement for a prepared track or live
 * scene-property sampler. Sampling, stable IDs, simplification and midpoint
 * reporting have one implementation. No dense frames are persisted. */
export function prepareNumericSignalBake(track: Track, opts: BakeOptions, sourceSample: (timeMs: number) => number | null): { track: Track; report: BakeReport } {
  const raw = sampleNumericSignal(sourceSample, opts), keys = keysFromSamples(track, raw, opts)
  const baked = replaceSignal(track, keys, opts)
  const bakedSample = createNumericTrackSampler(baked)
  let min = Infinity, max = -Infinity, maxSampleError = 0, maxMidpointError = 0
  for (let i = 0; i < raw.length; i++) {
    if (opts.signal?.aborted) throw new Error('Bake cancelled')
    const sample = raw[i]; min = Math.min(min, sample.value); max = Math.max(max, sample.value)
    const evaluated = bakedSample(sample.timeMs)
    if (evaluated === null) throw new Error('Baked interpolation has no finite numeric value.')
    maxSampleError = Math.max(maxSampleError, Math.abs(sample.value - evaluated))
    if (i) {
      const time = (raw[i - 1].timeMs + sample.timeMs) / 2, original = sourceSample(time)
      if (original === null) throw new Error(`Track has no finite numeric midpoint at ${time} ms.`)
      const interpolated = bakedSample(time)
      if (interpolated === null) throw new Error('Baked interpolation has no finite numeric midpoint.')
      maxMidpointError = Math.max(maxMidpointError, Math.abs(original - interpolated))
    }
  }
  return { track: baked, report: { sampleCount: raw.length, keyCount: keys.length, maxSampleError,
    maxMidpointError, valueSpan: max - min, retainedOutsideKeys: baked.keyframes.length - keys.length } }
}
