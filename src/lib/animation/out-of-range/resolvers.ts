/** Out-of-range behavior resolver algorithms.
 *  Each function is deterministic and pure (no side effects).
 */

import type { OutOfRangeSettings, OutOfRangeResolution, OutOfRangeType } from './types'

/** Clamp time to range [t0, t1]. Used for 'constant' mode. */
export function constantOutOfRange(t: number, t0: number, t1: number): number {
  return Math.max(t0, Math.min(t1, t))
}

/** Wrap time using modulo. Used for 'cycle' and 'loop' modes.
 *  If t is outside [t0, t1], wraps it back into range via modulo.
 *  Example: t0=0, t1=100, t=250 → 50 (cycle 2.5 → position 50) */
export function wrapTime(t: number, t0: number, t1: number): number {
  const dur = t1 - t0
  if (dur <= 0) return t0
  const offset = t - t0
  const wrapped = offset % dur
  return t0 + (wrapped >= 0 ? wrapped : dur + wrapped)
}

/** Ping-pong (bouncing) time. Used for 'pingPong' mode.
 *  Alternates forward and backward through the range.
 *  Example: t0=0, t1=100, t=250 → 50 (cycle 2.5 → bounce back to 50) */
export function pingPongTime(t: number, t0: number, t1: number): number {
  const dur = t1 - t0
  if (dur <= 0) return t0
  const offset = t - t0
  const cycleLen = 2 * dur
  const moduloPos = offset % cycleLen
  const normalized = moduloPos < 0 ? cycleLen + moduloPos : moduloPos
  return normalized < dur ? t0 + normalized : t1 - (normalized - dur)
}

/** Linear extrapolation beyond range. Used for 'linear' mode.
 *  Extrapolates the tangent at the range boundary.
 *  @param t - time to evaluate
 *  @param rangeStart - start of keyframe range
 *  @param rangeEnd - end of keyframe range
 *  @param value - interpolated value at range boundary
 *  @param velocity - tangent/rate of change at boundary */
export function linearOutOfRangeValue(
  t: number,
  rangeStart: number,
  rangeEnd: number,
  value: number,
  velocity: number,
  isAfter: boolean
): number {
  const boundary = isAfter ? rangeEnd : rangeStart
  const offset = t - boundary
  return value + velocity * offset
}

/** Crossfade blend at loop seam. Used for 'loop' mode with loopBlendMs.
 *  Smoothly blends from end value back to start value over blend duration.
 *  @param localMs - time within current cycle
 *  @param startValue - value at start of loop
 *  @param endValue - value at end of loop
 *  @param cycleStart - start time of current cycle
 *  @param cycleDur - duration of single cycle
 *  @param blendDur - blend duration (ms) */
export function loopBlendValue(
  localMs: number,
  startValue: number,
  endValue: number,
  cycleStart: number,
  cycleDur: number,
  blendDur: number
): number {
  if (blendDur <= 0) return endValue
  const cycleEnd = cycleStart + cycleDur
  const blendStart = cycleEnd - blendDur
  if (localMs < blendStart) return endValue
  const blendProgress = (localMs - blendStart) / blendDur
  return endValue + (startValue - endValue) * blendProgress
}

/** Relative repeat value offset. Used for 'relativeRepeat' mode.
 *  Each cycle gets offset by (lastValue - firstValue) or velocity-extrapolated.
 *  @param baseValue - value at start of range (first keyframe)
 *  @param startValue - value at range start
 *  @param endValue - value at range end
 *  @param cycleIndex - 0 for first cycle, 1 for second, etc.
 *  @param mode - 'valueDelta' or 'velocityDelta' */
export function relativeRepeatOffset(
  startValue: number,
  endValue: number,
  cycleIndex: number,
  mode: 'valueDelta' | 'velocityDelta'
): number {
  const delta = endValue - startValue
  if (mode === 'valueDelta') {
    return delta * cycleIndex
  } else {
    // 'velocityDelta': assume linear extrapolation
    return delta * cycleIndex
  }
}

/** Detect keyframe range from a set of keyframe times.
 *  @param keyframeTimes - sorted array of keyframe times (ms)
 *  @returns [startMs, endMs] or null if no keyframes */
export function detectKeyframeRange(keyframeTimes: number[]): [number, number] | null {
  if (keyframeTimes.length === 0) return null
  const sorted = [...keyframeTimes].sort((a, b) => a - b)
  return [sorted[0], sorted[sorted.length - 1]]
}

/** Main resolver: apply out-of-range behavior to transform time.
 *  @param t - requested time
 *  @param oor - out-of-range settings
 *  @param rangeStart - auto-detected or overridden range start (ms)
 *  @param rangeEnd - auto-detected or overridden range end (ms)
 *  @returns OutOfRangeResolution with timeMs (for evaluation) + relativeOffset */
export function resolveOutOfRange(
  t: number,
  oor: OutOfRangeSettings | undefined,
  rangeStart: number,
  rangeEnd: number
): OutOfRangeResolution {
  // Backwards compatibility: undefined = constant on both sides
  if (!oor) {
    return { timeMs: constantOutOfRange(t, rangeStart, rangeEnd), relativeOffset: 0 }
  }

  // Use overrides if provided
  const start = oor.rangeStartMs ?? rangeStart
  const end = oor.rangeEndMs ?? rangeEnd

  // Within range: no transformation
  if (t >= start && t <= end) {
    return { timeMs: t, relativeOffset: 0 }
  }

  const isAfter = t > end
  const mode = isAfter ? oor.after : oor.before

  let timeMs = t
  let relativeOffset = 0

  switch (mode) {
    case 'constant':
      timeMs = constantOutOfRange(t, start, end)
      break

    case 'cycle':
      timeMs = wrapTime(t, start, end)
      break

    case 'loop':
      timeMs = wrapTime(t, start, end)
      break

    case 'pingPong':
      timeMs = pingPongTime(t, start, end)
      break

    case 'linear': {
      // For linear, we need to extrapolate from the boundary
      // This will be handled in the evaluator when we have access to velocity
      // For now, just clamp to range and let evaluator handle velocity
      timeMs = constantOutOfRange(t, start, end)
      break
    }

    case 'relativeRepeat': {
      const dur = end - start
      const cycleIndex = isAfter ? Math.floor((t - end) / dur) + 1 : Math.floor((start - t) / dur)
      timeMs = wrapTime(t, start, end)
      // Offset is calculated per cycle when we know actual values
      relativeOffset = cycleIndex > 0 ? cycleIndex : 0
      break
    }
  }

  return { timeMs, relativeOffset }
}
