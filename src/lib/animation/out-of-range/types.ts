/** Out-of-range (looping) behavior types and interfaces for animation tracks.
 *  Based on 3ds Max conventions: Constant, Cycle, Loop, Ping Pong, Linear, Relative Repeat.
 */

export type OutOfRangeType =
  | 'constant'
  | 'cycle'
  | 'loop'
  | 'pingPong'
  | 'linear'
  | 'relativeRepeat'

export interface OutOfRangeSettings {
  /** Behavior before first keyframe (default: 'constant') */
  before: OutOfRangeType

  /** Behavior after last keyframe (default: 'constant') */
  after: OutOfRangeType

  /** Optional: override auto-detected range start (in ms).
   *  If undefined, uses first keyframe time. */
  rangeStartMs?: number

  /** Optional: override auto-detected range end (in ms).
   *  If undefined, uses last keyframe time. */
  rangeEndMs?: number

  /** For 'loop' mode: crossfade duration (ms) at seam.
   *  Blends the last frame back to first frame over this duration (default: 0). */
  loopBlendMs?: number

  /** For 'relativeRepeat': how to offset each cycle.
   *  'valueDelta': add (lastValue - firstValue) per cycle
   *  'velocityDelta': extrapolate velocity at endpoints (default: 'valueDelta') */
  relativeMode?: 'valueDelta' | 'velocityDelta'
}

/** Result of resolving out-of-range behavior: transformed time + optional value offset. */
export interface OutOfRangeResolution {
  /** Remapped time within keyframe range [rangeStartMs, rangeEndMs] */
  timeMs: number

  /** Offset to add to evaluated value (for relativeRepeat) */
  relativeOffset: number
}
