import type { Track } from '../../types'
import { createTrackSampler } from '../../evaluator'
import { expressionValueType, type ExpressionValue, type ExpressionValueType } from '../../core/expression/ExpressionValue'
import { sampleBakeSignal } from './bakeSampling'
import { bakedKeysForSamples } from './bakeKeyframes'
import { simplifyRDP } from './simplify'
import { prepareNumericSignalBake, type BakeReport } from './bake'
import type { BakeOptions } from './BakeOptions'

/** Numeric channels in their native units; discrete values have none. */
function channels(value: ExpressionValue): number[] {
  if (typeof value === 'number') return [value]
  if (value && typeof value === 'object') return 'r' in value ? [value.r, value.g, value.b, value.a] : [value.x, value.y]
  return []
}
/** Maximum channel error (number/px/RGBA 0..255), or a 0/1 discrete mismatch. */
function error(a: ExpressionValue, b: ExpressionValue): number {
  const from = channels(a), to = channels(b)
  return from.length ? Math.max(...from.map((value, index) => Math.abs(value - to[index]))) : Object.is(a, b) ? 0 : 1
}

/** Explicit new native-track capture. Numbers reuse numeric baking unchanged;
 * vectors/colors union per-channel RDP samples at half the normalized tolerance,
 * keeping each channel within tolerance × its sampled span. Added channel
 * breakpoints preserve that bound; error reports remain in source units. Total
 * simplification comparisons remain ≤2M. Boolean/string values use hold keys
 * only when they change. A prepared native sampler measures raw and midpoint
 * errors without sorting every probe. FPS still limits discontinuity accuracy;
 * this report does not prove continuous equivalence. Cancellation/type failures
 * reject the job before publication; no dense runtime frame cache is retained. */
export function prepareTypedSignalBake(target: string, kind: ExpressionValueType, options: BakeOptions,
  source: (timeMs: number) => ExpressionValue): { track: Track; report: BakeReport } {
  const sample = (timeMs: number) => {
    const value = source(timeMs)
    if (expressionValueType(value) !== kind) throw new Error('Typed bake result changed type at ' + timeMs + ' ms.')
    return value
  }
  if (kind === 'number') return prepareNumericSignalBake({ target, keyframes: [] }, options, timeMs => sample(timeMs) as number)
  const raw = sampleBakeSignal(sample, options), dimensions = channels(raw[0].value).length
  let selected = raw
  if (!dimensions) selected = raw.filter((entry, index) => index === 0 || index === raw.length - 1 || !Object.is(entry.value, raw[index - 1].value))
  else if (options.tolerance > 0) {
    const keep = new Set<number>()
    for (let channel = 0; channel < dimensions; channel++) {
      for (const entry of simplifyRDP(raw.map(entry => ({ timeMs: entry.timeMs, value: channels(entry.value)[channel] })), options.tolerance / 2,
        { metric: 'value', signal: options.signal, maxComparisons: Math.floor(2_000_000 / dimensions) })) keep.add(entry.timeMs)
    }
    selected = raw.filter(entry => keep.has(entry.timeMs))
  }
  const track = { target, keyframes: bakedKeysForSamples({ target, keyframes: [] }, selected, options, !dimensions) }, baked = createTrackSampler(track)
  let maxSampleError = 0, maxMidpointError = 0
  const mins = new Array(dimensions).fill(Infinity), maxs = new Array(dimensions).fill(-Infinity)
  for (let index = 0; index < raw.length; index++) {
    if (options.signal?.aborted) throw new Error('Bake cancelled')
    const entry = raw[index], measured = baked(entry.timeMs)
    if (measured === null) throw new Error('Baked track has no typed sample.')
    maxSampleError = Math.max(maxSampleError, error(entry.value, measured))
    channels(entry.value).forEach((value, channel) => { mins[channel] = Math.min(mins[channel], value); maxs[channel] = Math.max(maxs[channel], value) })
    if (index) { const timeMs = (raw[index - 1].timeMs + entry.timeMs) / 2, mid = baked(timeMs); if (mid === null) throw new Error('Baked track has no typed midpoint.'); maxMidpointError = Math.max(maxMidpointError, error(sample(timeMs), mid)) }
  }
  return { track, report: { sampleCount: raw.length, keyCount: track.keyframes.length, maxSampleError, maxMidpointError,
    valueSpan: dimensions ? Math.max(...maxs.map((value, index) => value - mins[index])) : 1, retainedOutsideKeys: 0 } }
}
