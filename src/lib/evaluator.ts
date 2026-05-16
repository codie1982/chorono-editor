import type { Timeline, Track, Keyframe } from './types'

// ── Easing functions ──────────────────────────────────────────────────────────
const easeIn    = (t: number) => t * t * t
const easeOut   = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

// ── Cubic Bezier easing (Newton-Raphson solver) ──────────────────────────────
// The curve passes through (0,0) and (1,1) with control points (cx1,cy1) and
// (cx2,cy2). For a given input x we find t such that bezierX(t) = x, then
// return bezierY(t).

function cubicBezierComponent(t: number, a: number, b: number): number {
  const u = 1 - t
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
}

function cubicBezierDerivative(t: number, a: number, b: number): number {
  const u = 1 - t
  return 3 * u * u * a + 6 * u * t * (b - a) + 3 * t * t * (1 - b)
}

/**
 * Returns a function that maps x ∈ [0,1] to y ∈ [0,1] along the cubic bezier
 * curve defined by control points (cx1, cy1) and (cx2, cy2).
 *
 * Newton-Raphson with 8 iterations converges in <1e-5 for typical animation
 * curves. Falls back gracefully at the endpoints.
 */
export function bezierEasing(cx1: number, cy1: number, cx2: number, cy2: number): (x: number) => number {
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x  // good initial guess for monotone curves
    for (let i = 0; i < 8; i++) {
      const fx  = cubicBezierComponent(t, cx1, cx2) - x
      const dfx = cubicBezierDerivative(t, cx1, cx2)
      if (Math.abs(dfx) < 1e-6) break
      t -= fx / dfx
    }
    return cubicBezierComponent(t, cy1, cy2)
  }
}

/** Apply the easing function defined on keyframe A to a normalized t [0,1]. */
function applyEasing(kfA: Keyframe, t: number): number {
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

/** Interpolate a numeric value between two keyframes at the given timeMs. */
function interpolateKeyframes(kfA: Keyframe, kfB: Keyframe, timeMs: number): number {
  if (kfA.easing?.type === 'hold') return kfA.value as number

  const range = kfB.timeMs - kfA.timeMs
  const t = range === 0 ? 1 : Math.max(0, Math.min(1, (timeMs - kfA.timeMs) / range))
  const easedT = applyEasing(kfA, t)

  const vA = kfA.value as number
  const vB = kfB.value as number
  return vA + (vB - vA) * easedT
}

/** Return the evaluated value for a single track at timeMs, or null if no keyframes. */
export function evaluateTrack(track: Track, timeMs: number): number | null {
  // Keyframes are stored sorted; defensive sort here costs little for small arrays.
  const kfs = [...track.keyframes].sort((a, b) => a.timeMs - b.timeMs)
  if (kfs.length === 0) return null
  if (timeMs <= kfs[0].timeMs) return kfs[0].value as number
  if (timeMs >= kfs[kfs.length - 1].timeMs) return kfs[kfs.length - 1].value as number

  // Binary search for the keyframe bracket — O(log n)
  let lo = 0, hi = kfs.length - 2
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (kfs[mid + 1].timeMs <= timeMs) lo = mid + 1
    else hi = mid
  }
  return interpolateKeyframes(kfs[lo], kfs[lo + 1], timeMs)
}

/** Evaluate all timelines and return a map of property path → computed value. */
export type OverrideMap = Map<string, number>

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
function computeLocalTime(tl: Timeline, globalTimeMs: number): number {
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
  return overrides.has(key) ? (overrides.get(key) as number) : defaultValue
}
