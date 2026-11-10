import type { Track, Keyframe } from '../../types'
import { createNumericTrackSampler } from '../../evaluator'
import { simplifyRDP, type Sample } from './simplify'
import { isScalarNumericTrack } from '../typedValues'
import { sameKeyTime, compareKeyTime } from '../../timeline/authoring/keyTimePolicy'

export const MAX_BAKE_SAMPLES = 20000
export interface BakeOptions {
  /** Inclusive timeline-local ms, finite and 0 ≤ start ≤ end. */
  startMs: number
  endMs: number
  /** Positive finite sample rate, at most 240 Hz; fractional rates supported. */
  fps: number
  /** Normalized vertical value error at sample times, 0..1; zero keeps samples. */
  tolerance: number
  /** Transient cancellation, never persisted in scene/history. */
  signal?: { readonly aborted: boolean }
  /** Caller namespace for deterministic IDs; editor commands supply timeline ID. */
  keyIdPrefix?: string
}

/** Validate before allocating/evaluating; returns the finite number of intervals.
 * An exact end sample is emitted independently of floating-point frame drift. */
export function validateBakeOptions(opts: BakeOptions): number {
  if (![opts.startMs, opts.endMs, opts.fps, opts.tolerance].every(Number.isFinite)
    || opts.startMs < 0 || opts.endMs < opts.startMs || opts.fps <= 0 || opts.fps > 240
    || opts.tolerance < 0 || opts.tolerance > 1) throw new Error('Bake requires finite local bounds, 0 < FPS ≤ 240 and 0 ≤ tolerance ≤ 1.')
  const intervals = Math.ceil((opts.endMs - opts.startMs) * opts.fps / 1000)
  if (!Number.isSafeInteger(intervals) || intervals + 1 > MAX_BAKE_SAMPLES) throw new Error(`Bake exceeds ${MAX_BAKE_SAMPLES} samples; reduce FPS or the range.`)
  if (opts.signal?.aborted) throw new Error('Bake cancelled')
  return intervals
}

/** Fixed-FPS samples plus exact terminal sample. Every evaluated value must be
 * finite scalar; an invalid sample rejects the whole conversion. Caller owns
 * the returned array. Source is never mutated, even on cancellation/failure. */
export function sampleTrackDense(track: Track, opts: BakeOptions): Sample[] {
  const intervals = validateBakeOptions(opts)
  if (!isScalarNumericTrack(track)) throw new Error('Baking supports scalar numeric tracks only; color, vector and discrete tracks must retain their typed keys.')
  const sample = createNumericTrackSampler(track)
  return Array.from({ length: intervals + 1 }, (_, index) => {
    if (opts.signal?.aborted) throw new Error('Bake cancelled')
    const timeMs = index === intervals ? opts.endMs : Math.min(opts.endMs, opts.startMs + index * 1000 / opts.fps)
    const value = sample(timeMs)
    if (value === null) throw new Error(`Track has no finite numeric value at ${timeMs} ms.`)
    return { timeMs, value }
  })
}

/** Linear key conversion with stable exact-time identities where possible.
 * Generated IDs include caller namespace + target + exact time, so different
 * tracks/timelines cannot share the old baked_0_0 ID accidentally. */
function keysFromSamples(track: Track, raw: Sample[], opts: BakeOptions): Keyframe[] {
  const samples = simplifyRDP(raw, opts.tolerance, { metric: 'value', signal: opts.signal, maxComparisons: 2_000_000 })
  const existing = new Map(track.keyframes.map(key => [key.timeMs, key]))
  const used = new Set(track.keyframes.map(key => key.id))
  return samples.map(sample => {
    const old = existing.get(sample.timeMs)
    const { segmentModifiers: _segments, ...metadata } = old ?? ({} as Partial<Keyframe>)
    let id = old?.id ?? `baked:${encodeURIComponent(opts.keyIdPrefix ?? '')}:${encodeURIComponent(track.target)}:${sample.timeMs}`
    if (!old) { const base = id; let suffix = 0; while (used.has(id)) id = `${base}:${++suffix}` }
    used.add(id)
    return { ...metadata, id, timeMs: sample.timeMs, value: sample.value, easing: { type: 'linear' }, tangentMode: 'linear' }
  })
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
  const raw = sampleTrackDense(track, opts), keys = keysFromSamples(track, raw, opts)
  const baked = replaceSignal(track, keys, opts)
  const sourceSample = createNumericTrackSampler(track), bakedSample = createNumericTrackSampler(baked)
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
