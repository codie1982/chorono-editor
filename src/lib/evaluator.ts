import type { Timeline, Track, Keyframe, AnimatableValue } from './types'
import { resolveOutOfRange } from './animation/out-of-range/resolvers'
import { applyModifiers, hashTrackSeed } from './animation/modifiers/pipeline'
import { sampleBezier } from './animation/timeWarp/sampler'
import { sampleController } from './animation/controllers/sample'
import { sampleCubicBezier } from './animation/bezierEasing'
import { interpolateAnimatableValues, isColorTarget, isVec2, isScalarNumericTrack } from './animation/typedValues'
import { compareKeyTime } from './timeline/authoring/keyTimePolicy'

// ── Easing functions ──────────────────────────────────────────────────────────
const easeIn    = (t: number) => t * t * t
const easeOut   = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

// ── Cubic Bezier easing (Newton-Raphson solver) ──────────────────────────────
// The curve passes through (0,0) and (1,1) with control points (cx1,cy1) and
// (cx2,cy2). For a given input x we find t such that bezierX(t) = x, then
// return bezierY(t).

/**
 * Returns a function that maps x ∈ [0,1] to y ∈ [0,1] along the cubic bezier
 * curve defined by control points (cx1, cy1) and (cx2, cy2).
 *
 * Bracketed Newton steps with bisection fallback stay on the monotone X
 * interval, including flat derivatives. Y controls may overshoot.
 */
export function bezierEasing(cx1: number, cy1: number, cx2: number, cy2: number): (x: number) => number {
  return (x: number) => sampleCubicBezier({ cx1, cy1, cx2, cy2 }, x)
}

/** Apply the easing function defined on keyframe A to a normalized t [0,1]. */
function applyEasing(kfA: Keyframe, t: number): number {
  if (kfA.tangentMode === 'linear') return t
  const type = kfA.easing?.type ?? 'linear'
  switch (type) {
    case 'easeIn':    return easeIn(t)
    case 'easeOut':   return easeOut(t)
    case 'easeInOut': return easeInOut(t)
    case 'customBezier': {
      const b = kfA.easing?.bezier
      if (!b) return t
      return bezierEasing(b.cx1, b.cy1, b.cx2, b.cy2)(t)
    }
    default: return t  // 'linear', 'hold'
  }
}

/** Interpolate continuous values; text/boolean values hold until the next key. */
function interpolateKeyframes(kfA: Keyframe, kfB: Keyframe, timeMs: number, target: string): AnimatableValue {
  if (kfA.easing?.type === 'hold' && kfA.tangentMode !== 'linear') return kfA.value

  const range = kfB.timeMs - kfA.timeMs
  const t = range === 0 ? 1 : Math.max(0, Math.min(1, (timeMs - kfA.timeMs) / range))
  const easedT = applyEasing(kfA, t)

  return interpolateAnimatableValues(kfA.value, kfB.value, easedT, target)
}

/** Evaluate a track at timeline-local milliseconds, without mutating source.
 * Numeric procedural controllers need no keys; an empty keyframe track returns
 * null. Applies the existing controller/keyframe, range, warp and modifier
 * pipeline. Typed values retain their interpolation/hold semantics. */
export function evaluateTrack(track: Track, timeMs: number): AnimatableValue | null {
  return evaluateTrackPrepared(track, timeMs)
}

/** One authoritative signal pipeline; prepared samplers avoid rechecking the
 * same immutable keys on every numerical probe. Normal callers retain the
 * existing validation/sort behavior for independently supplied tracks. */
function evaluateTrackPrepared(track: Track, timeMs: number, prepared?: { keys: Track['keyframes']; scalar: boolean }): AnimatableValue | null {
  // BL-50: procedural controllers bypass the keyframe path entirely. Out-of-
  // range (cycle/loop/pingPong) still pre-warps timeMs so a noise/waveform
  // controller can naturally loop or ping-pong if the user wants. Track
  // modifiers + multiplier curve still wrap the procedural output below.
  if (track.controller && track.controller.type !== 'keyframe' && (prepared?.scalar ?? isScalarNumericTrack(track))) {
    const ctrl = track.controller
    // For procedural controllers we don't have a kf range, so OOR is applied
    // against the timeline-derived range hint when the user explicitly set
    // OOR range overrides. Otherwise we just pass timeMs through.
    let evalTimeProc = timeMs
    if (track.outOfRange?.rangeStartMs != null && track.outOfRange?.rangeEndMs != null) {
      const r = resolveOutOfRange(
        timeMs, track.outOfRange,
        track.outOfRange.rangeStartMs, track.outOfRange.rangeEndMs,
      )
      evalTimeProc = r.timeMs
    }
    let value = sampleController(ctrl, evalTimeProc)
    // Track modifiers + multiplier curve still apply on top of the formula.
    if (track.modifiers && track.modifiers.length > 0) {
      const seed = hashTrackSeed(`${track.target}`)
      value = applyModifiers(track.modifiers, value, {
        timeMs: evalTimeProc, localT: 0,
        segmentStartMs: 0, segmentEndMs: 0, durationMs: 1,
        seed,
      })
    }
    if (track.multiplierCurve && (track.outOfRange?.rangeStartMs != null) && (track.outOfRange?.rangeEndMs != null)) {
      const dur = track.outOfRange.rangeEndMs - track.outOfRange.rangeStartMs
      const tNorm = dur > 0 ? Math.max(0, Math.min(1, (evalTimeProc - track.outOfRange.rangeStartMs) / dur)) : 0
      const amp = typeof track.multiplierAmplitude === 'number' ? track.multiplierAmplitude : 1
      value *= 1 + (sampleBezier(track.multiplierCurve, tNorm) - 0.5) * amp * 2
    }
    return value
  }
  // Keyframes are stored sorted; skip the copy + sort when already in order
  // (the common case — saves a lot of garbage for hot-path evaluation).
  let kfs = prepared?.keys ?? track.keyframes
  if (kfs.length === 0) return null
  for (let i = 1; !prepared && i < kfs.length; i++) {
    if (kfs[i - 1].timeMs > kfs[i].timeMs) {
      kfs = [...track.keyframes].sort(compareKeyTime)
      break
    }
  }

  const rangeStart = kfs[0].timeMs
  const rangeEnd = kfs[kfs.length - 1].timeMs

  // BL-45: Apply out-of-range behavior. For undefined outOfRange or single-keyframe
  // tracks (rangeStart === rangeEnd), this is effectively a no-op clamp.
  const resolved = resolveOutOfRange(timeMs, track.outOfRange, rangeStart, rangeEnd)
  const evalTime = resolved.timeMs
  const offset = resolved.relativeOffset

  // For relativeRepeat, offset is the cycle index — multiply by (lastValue - firstValue)
  // to get the actual value offset per cycle.
  const firstValue = kfs[0].value, lastValue = kfs[kfs.length - 1].value
  const applyRelativeOffset = (value: AnimatableValue): AnimatableValue => {
    if (!offset || isColorTarget(track.target)) return value
    if (typeof value === 'number' && typeof firstValue === 'number' && typeof lastValue === 'number') return value + (lastValue - firstValue) * offset
    if (isVec2(value) && isVec2(firstValue) && isVec2(lastValue)) return {
      x: value.x + (lastValue.x - firstValue.x) * offset, y: value.y + (lastValue.y - firstValue.y) * offset,
    }
    return value // discrete/color values repeat without numeric arithmetic
  }

  // BL-48: ease curve + time warp — re-time the WHOLE track via two
  // cubic-beziers applied to the local-T (track normalised time).
  // Composes as `timeWarp(easeCurve(localT))`. Identity when both unset.
  //
  // Track localT = (evalTime - rangeStart) / (rangeEnd - rangeStart)
  // We warp localT, then convert back to a warped evalTime, then proceed
  // with the normal kf bracket search. Skipped when track has no warp
  // or when there's only one keyframe (warp meaningless there).
  let warpedEvalTime = evalTime
  if (track.easeCurve || track.timeWarp) {
    const trackDur = rangeEnd - rangeStart
    if (trackDur > 0) {
      const tNorm = Math.max(0, Math.min(1, (evalTime - rangeStart) / trackDur))
      let warpedT = tNorm
      if (track.easeCurve) warpedT = sampleBezier(track.easeCurve, warpedT)
      if (track.timeWarp)  warpedT = sampleBezier(track.timeWarp,  warpedT)
      warpedEvalTime = rangeStart + warpedT * trackDur
    }
  }

  // Resolve the kf bracket so we can compute the base value and
  // pass segment timing into the modifier pipeline below.
  let baseValue: AnimatableValue
  let segStartMs: number
  let segEndMs:   number
  let leadingKf:  Keyframe
  if (warpedEvalTime <= rangeStart) {
    baseValue = applyRelativeOffset(kfs[0].value)
    leadingKf = kfs[0]
    segStartMs = kfs[0].timeMs
    segEndMs   = kfs[Math.min(1, kfs.length - 1)].timeMs
  } else if (warpedEvalTime >= rangeEnd) {
    baseValue = applyRelativeOffset(kfs[kfs.length - 1].value)
    leadingKf = kfs[Math.max(0, kfs.length - 2)]
    segStartMs = leadingKf.timeMs
    segEndMs   = kfs[kfs.length - 1].timeMs
  } else {
    // Binary search for the keyframe bracket — O(log n)
    let lo = 0, hi = kfs.length - 2
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (kfs[mid + 1].timeMs <= warpedEvalTime) lo = mid + 1
      else hi = mid
    }
    leadingKf = kfs[lo]
    baseValue = applyRelativeOffset(interpolateKeyframes(kfs[lo], kfs[lo + 1], warpedEvalTime, track.target))
    segStartMs = kfs[lo].timeMs
    segEndMs   = kfs[lo + 1].timeMs
  }

  // BL-46: apply segment-scope then track-scope modifier stacks.
  // BL-48: localT here is segment-local; warps above already happened.
  const hasSegmentMods    = leadingKf.segmentModifiers && leadingKf.segmentModifiers.length > 0
  const hasTrackMods      = track.modifiers && track.modifiers.length > 0
  const hasMultiplier     = !!track.multiplierCurve
  const needsCtx          = hasSegmentMods || hasTrackMods || hasMultiplier
  // Signal modifiers/multipliers are scalar operations. Imported typed tracks
  // with unsupported stacks retain their typed baseline instead of emitting
  // NaN or coercing text/booleans/colors into unrelated numeric output.
  if (!needsCtx || typeof baseValue !== 'number' || isColorTarget(track.target)) return baseValue

  const durationMs = Math.max(1, segEndMs - segStartMs)
  const localT = Math.max(0, Math.min(1, (warpedEvalTime - segStartMs) / durationMs))
  const seed = hashTrackSeed(`${track.target}`)
  const ctx = { timeMs: warpedEvalTime, localT, segmentStartMs: segStartMs, segmentEndMs: segEndMs, durationMs, seed }

  let value = baseValue
  if (hasSegmentMods) value = applyModifiers(leadingKf.segmentModifiers, value, ctx)
  if (hasTrackMods)   value = applyModifiers(track.modifiers,             value, ctx)
  // BL-48 multiplier — track-level value scale via bezier. Applied LAST
  // so the curve controls the final output, not an intermediate. The
  // bezier output is centred on 0.5 to allow attenuation AND amplification:
  //    multiplier = 1 + (bezier(t) - 0.5) * amplitude * 2
  //    amplitude=0 → multiplier=1 (no effect)
  //    amplitude=1, bezier(t) ∈ [0,1] → multiplier ∈ [0,2]
  if (hasMultiplier) {
    const trackDur = rangeEnd - rangeStart
    const tNorm = trackDur > 0
      ? Math.max(0, Math.min(1, (evalTime - rangeStart) / trackDur))
      : 0
    const amp = typeof track.multiplierAmplitude === 'number' ? track.multiplierAmplitude : 1
    const m = 1 + (sampleBezier(track.multiplierCurve!, tNorm) - 0.5) * amp * 2
    value *= m
  }
  return value
}

/** Evaluate all timelines and return a map of property path → computed value. */
export type OverrideMap = Map<string, AnimatableValue>

/** Scalar consumers (curve graph, gain, transform helpers) must explicitly
 * request numeric evaluation rather than casting a typed track's output. */
export function evaluateNumericTrack(track: Track, timeMs: number): number | null {
  const value = evaluateTrack(track, timeMs)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Borrow an immutable track for a bounded sampling job. Sorting and scalar
 * validation happen once; each probe uses the identical evaluator pipeline.
 * Returned closure owns only its sorted key array and must be dropped when
 * source changes. Do not mutate the borrowed track/controller while sampling.
 * This is not a global cache and never writes synthetic keys into source. */
export function createNumericTrackSampler(track: Track): (timeMs: number) => number | null {
  const prepared = { keys: [...track.keyframes].sort(compareKeyTime), scalar: isScalarNumericTrack(track) }
  return timeMs => {
    if (!Number.isFinite(timeMs) || !prepared.scalar) return null
    const value = evaluateTrackPrepared(track, timeMs, prepared)
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }
}

/**
 * Marker used by the runtime hook to drive a timeline's local time externally
 * — e.g. while a named segment is playing. When provided, the timeline whose
 * id matches `timelineId` evaluates against `localTimeMs` instead of the
 * usual computeLocalTime() output.
 */
export interface ExternalTimelineTime {
  timelineId: string
  localTimeMs: number
}

export function evaluateTimelines(
  timelines: Timeline[],
  globalTimeMs: number,
  externalTime?: ExternalTimelineTime | null,
): OverrideMap {
  const overrides: OverrideMap = new Map()

  for (const tl of timelines) {
    const localTime =
      externalTime && externalTime.timelineId === tl.id
        ? externalTime.localTimeMs
        : computeLocalTime(tl, globalTimeMs)

    for (const track of tl.tracks) {
      const val = evaluateTrack(track, localTime)
      if (val !== null) overrides.set(track.target, val)
    }
  }
  return overrides
}

/**
 * Merge multiple OverrideMaps — later entries win. Returns the first map
 * untouched when no extras are supplied (common path: nothing to merge).
 */
export function mergeOverrides(...maps: OverrideMap[]): OverrideMap {
  if (maps.length === 0) return new Map()
  if (maps.length === 1) return maps[0]
  const out = new Map(maps[0])
  for (let i = 1; i < maps.length; i++) {
    maps[i].forEach((v, k) => out.set(k, v))
  }
  return out
}

/**
 * Total wall-clock duration the global playhead needs to span before all of
 * a timeline's playback modes complete one cycle:
 *
 *   one-shot (loop=false, loopCount=0, pingPong=false): durationMs
 *   loop=true  (no loopCount): durationMs (wraps in-place via modulo)
 *   pingPong   (no loopCount): 2 × durationMs (forward + back)
 *   loopCount=N: N × periodMs (where periodMs = pingPong ? 2×duration : duration)
 *
 * Used by the playback host to size its rAF wrap point so loopCount / pingPong
 * are never cut short.
 */
export function computeTimelineCycleEnd(tl: Timeline): number {
  if (tl.durationMs <= 0) return 0
  const period = tl.pingPong ? tl.durationMs * 2 : tl.durationMs
  if (tl.loopCount && tl.loopCount > 0) return period * tl.loopCount
  return period
}

/** True if any timeline keeps playing forever (no bounded loopCount, has
 *  loop or pingPong). Used to decide whether the global playhead should
 *  auto-stop at the end. */
export function hasInfinitePlayback(timelines: Timeline[]): boolean {
  return timelines.some((t) =>
    (t.loop || t.pingPong) && (!t.loopCount || t.loopCount === 0)
  )
}

/**
 * Compute the per-timeline playback head, accounting for loop, loopCount, and
 * ping-pong. globalTimeMs is the project-wide playback time (from usePlayback).
 */
export function computeLocalTime(tl: Timeline, globalTimeMs: number): number {
  const duration = tl.durationMs
  if (duration <= 0) return 0

  const periodMs = tl.pingPong ? duration * 2 : duration

  // Bounded loopCount: stop at end after N iterations
  if (tl.loopCount && tl.loopCount > 0) {
    const totalMs = periodMs * tl.loopCount
    if (globalTimeMs >= totalMs) {
      // Hold on the last frame
      return tl.pingPong ? 0 : duration
    }
  }

  // Infinite loop OR within bounded loop window
  if (tl.loop || (tl.loopCount && tl.loopCount > 0) || tl.pingPong) {
    const phase = globalTimeMs % periodMs
    if (tl.pingPong) {
      return phase <= duration ? phase : periodMs - phase
    }
    return phase
  }

  // One-shot: clamp to [0, duration]
  return Math.min(globalTimeMs, duration)
}

/** Look up an overridden layer property value, falling back to the layer default. */
export function getLayerValue(
  overrides: OverrideMap,
  layerId: string,
  property: string,
  defaultValue: number,
): number {
  const key = `layers.${layerId}.${property}`
  const value = overrides.get(key)
  return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue
}

/** Typed lookup for renderer properties such as text, colors and booleans. */
export function getLayerPropertyValue(overrides: OverrideMap, layerId: string, property: string, defaultValue: AnimatableValue): AnimatableValue {
  return overrides.get(`layers.${layerId}.${property}`) ?? defaultValue
}
