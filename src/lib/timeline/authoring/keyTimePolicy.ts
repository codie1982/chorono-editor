import type { Keyframe } from '../../types'

/** Millisecond equality for authored time, independent of FPS/hit-test pixels.
 * A sub-millisecond neighbouring key is distinct. Stable sort preserves input
 * order for ties; source edits reject ambiguous coincident identities. */
export const KEY_TIME_EPSILON_MS = 1e-6
export const sameKeyTime = (a: number, b: number): boolean => Math.abs(a - b) <= KEY_TIME_EPSILON_MS
export const compareKeyTime = (a: Pick<Keyframe, 'timeMs'>, b: Pick<Keyframe, 'timeMs'>): number => a.timeMs - b.timeMs

/** Validate local authored ms, allowing only floating-point boundary noise.
 * Does not clamp individual out-of-range group members or wrap playback. */
export function boundedKeyTime(timeMs: number, durationMs: number): number {
  if (!Number.isFinite(timeMs) || !Number.isFinite(durationMs) || durationMs < 0
    || timeMs < -KEY_TIME_EPSILON_MS || timeMs > durationMs + KEY_TIME_EPSILON_MS) {
    throw new Error(`Key time must be within this timeline (0–${durationMs} ms). The whole edit was cancelled.`)
  }
  return Math.max(0, Math.min(durationMs, timeMs))
}
