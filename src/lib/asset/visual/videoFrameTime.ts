import type { Layer } from '../../types'

/** Composition milliseconds to native source seconds. Native duration is used
 * only when finite/positive; recorded streams may initially report Infinity.
 * Loop wraps the whole source, preserving authored offset semantics. */
export function videoFrameTime(layer: Layer, timeMs: number, duration: number): number {
  const seconds = Math.max(0, (timeMs - (layer.startMs ?? 0) + (layer.video?.startOffsetMs ?? 0)) / 1000)
  if (!Number.isFinite(duration) || duration <= 0) return seconds
  return layer.video?.loop ? seconds % duration : Math.min(seconds, duration)
}
