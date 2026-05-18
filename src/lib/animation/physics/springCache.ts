/** Spring state cache (BL-49).
 *
 *  Springs are stateful — they remember their previous velocity. Stored
 *  outside the pure evaluator in a module-level Map keyed by
 *  `(trackId, modifierId)`. The evaluator looks the state up by track
 *  target + modifier id; if the playhead jumped backwards (scrub) we
 *  reset the spring (no time-travel-paradox velocities).
 *
 *  ResetSpringsBefore(t): blast all entries whose lastTimeMs > t —
 *  invoked when the user scrubs or seeks backwards. This keeps the
 *  spring's settled output reproducible after a seek.
 */

import { settleSpring, type SpringParams, type SpringState } from './spring'

interface CacheEntry {
  state:      SpringState
  lastTimeMs: number
}

const cache = new Map<string, CacheEntry>()

function keyOf(trackTarget: string, modifierId: string): string {
  return `${trackTarget}::${modifierId}`
}

/** Look up the spring's current value given the target it should be
 *  chasing and the current eval time. Steps the cached state forward
 *  in fixed sub-steps; resets if time moved backwards. */
export function getSpringValue(
  trackTarget: string,
  modifierId:  string,
  target:      number,
  nowMs:       number,
  params:      SpringParams,
): number {
  const k = keyOf(trackTarget, modifierId)
  const entry = cache.get(k)

  // No prior state OR scrub backwards → reset to the target with zero
  // velocity. Spring "snaps" to target on init; next frame it'll start
  // settling as the target moves.
  if (!entry || nowMs < entry.lastTimeMs) {
    cache.set(k, { state: { value: target, velocity: 0 }, lastTimeMs: nowMs })
    return target
  }

  // No time advance — return cached value.
  if (nowMs === entry.lastTimeMs) return entry.state.value

  const next = settleSpring(entry.state, target, entry.lastTimeMs, nowMs, params)
  cache.set(k, { state: next, lastTimeMs: nowMs })
  return next.value
}

/** Forget every cached spring. Call when the scene changes shape or on
 *  unmount so stale state doesn't leak. */
export function clearAllSprings(): void {
  cache.clear()
}

/** Forget springs for a specific track (called by undo / track delete). */
export function clearSpringsForTrack(trackTarget: string): void {
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(`${trackTarget}::`)) cache.delete(k)
  }
}
