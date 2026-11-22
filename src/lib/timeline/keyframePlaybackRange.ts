import type { Timeline } from '../types'
import type { PlaybackRange } from './playbackClock'

/** Inclusive local milliseconds across all tracks in the active Timeline.
 * Selection, row filters, locks and visibility do not trim this range. Ignore
 * non-finite/out-of-duration times; preserve fractional/off-grid keys. A single
 * distinct time returns a zero-length pose range. Empty timelines return null.
 * Does not sort, allocate per-key arrays or mutate source: O(keys), O(1) space.
 */
export function keyframePlaybackRange(timeline: Timeline | null | undefined): PlaybackRange | null {
  if (!timeline || !Number.isFinite(timeline.durationMs) || timeline.durationMs < 0) return null
  let startMs = Infinity, endMs = -Infinity
  for (const track of timeline.tracks) for (const key of track.keyframes) {
    if (!Number.isFinite(key.timeMs) || key.timeMs < 0 || key.timeMs > timeline.durationMs) continue
    startMs = Math.min(startMs, key.timeMs); endMs = Math.max(endMs, key.timeMs)
  }
  return Number.isFinite(startMs) ? { startMs, endMs, loop: timeline.loop, pingPong: timeline.pingPong, loopCount: timeline.loopCount } : null
}
