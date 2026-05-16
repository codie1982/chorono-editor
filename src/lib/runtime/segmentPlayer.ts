// ── Segment Player ────────────────────────────────────────────────────────────
// Computes the timeline-local time when a named segment is being played
// instead of the regular full-timeline playback. Pure functions; the React
// hook holds the wall-clock state.

import type { TimelineSegment } from '../types'

export interface SegmentPlaybackState {
  segmentId:        string
  timelineId:       string
  startMs:          number
  endMs:            number
  loop:             boolean
  /** `performance.now()` (or any monotonic ms clock) at the moment play() was called. */
  startWallTimeMs:  number
}

/**
 * Build a SegmentPlaybackState from a target segment.
 */
export function startSegment(
  timelineId: string,
  segment: TimelineSegment,
  loop: boolean,
  wallTimeMs: number,
): SegmentPlaybackState {
  return {
    segmentId:       segment.id,
    timelineId,
    startMs:         segment.startMs,
    endMs:           segment.endMs,
    loop,
    startWallTimeMs: wallTimeMs,
  }
}

/**
 * Compute the timeline-local time given how long the segment has been
 * playing. Returns the position within [startMs, endMs]. When loop=true the
 * position wraps; otherwise it clamps at endMs and `isComplete()` returns true.
 */
export function computeSegmentTime(
  state: SegmentPlaybackState,
  wallTimeMs: number,
): number {
  const length = state.endMs - state.startMs
  if (length <= 0) return state.startMs

  const elapsed = wallTimeMs - state.startWallTimeMs
  if (elapsed <= 0) return state.startMs

  if (state.loop) {
    return state.startMs + (elapsed % length)
  }
  if (elapsed >= length) return state.endMs
  return state.startMs + elapsed
}

/**
 * Did a non-looping segment finish? Always false for looping segments.
 */
export function isSegmentComplete(
  state: SegmentPlaybackState,
  wallTimeMs: number,
): boolean {
  if (state.loop) return false
  const length = state.endMs - state.startMs
  return (wallTimeMs - state.startWallTimeMs) >= length
}
