import type { Timeline } from '../types'

/** Serializable cycle policy shared by runtime evaluation and bounded editor
 * transport. All time values are milliseconds; no scene or key mutation. */
export type TimelineCycle = Pick<Timeline, 'durationMs' | 'loop' | 'pingPong' | 'loopCount'>

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
export function computeTimelineCycleEnd(tl: TimelineCycle): number {
  if (tl.durationMs <= 0) return 0
  const period = tl.pingPong ? tl.durationMs * 2 : tl.durationMs
  if (tl.loopCount && tl.loopCount > 0) return period * tl.loopCount
  return period
}

/** True if any timeline keeps playing forever (no bounded loopCount, has
 *  loop or pingPong). Used to decide whether the global playhead should
 *  auto-stop at the end. */
export function hasInfinitePlayback(timelines: readonly TimelineCycle[]): boolean {
  return timelines.some((t) =>
    (t.loop || t.pingPong) && (!t.loopCount || t.loopCount === 0)
  )
}

/**
 * Compute the per-timeline playback head, accounting for loop, loopCount, and
 * ping-pong. globalTimeMs is the project-wide playback time (from usePlayback).
 */
export function computeLocalTime(tl: TimelineCycle, globalTimeMs: number): number {
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
