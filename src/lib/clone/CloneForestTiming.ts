import type { Layer, Track } from '../types'

/** Shift plain source keys without trimming, resampling or changing identity.
 * Non-key time-dependent pipelines need bake: moving key timestamps alone does
 * not shift their controller/modifier clocks. Every key must remain inside its
 * existing timeline duration. This helper never changes that timeline clock. */
export function offsetCloneTrack(track: Track, deltaMs: number, durationMs: number): Track {
  if (!deltaMs) return track
  if (!Number.isFinite(deltaMs) || (track.controller && track.controller.type !== 'keyframe')
      || track.timeWarp || track.easeCurve || track.multiplierCurve || track.modifiers?.some(value => value.enabled)
      || track.keyframes.some(key => key.segmentModifiers?.some(value => value.enabled))) {
    throw new Error('Bake time-dependent controllers/modifiers before applying an array time offset.')
  }
  const keyframes = track.keyframes.map(key => ({ ...key, timeMs: key.timeMs + deltaMs }))
  if (keyframes.some(key => !Number.isFinite(key.timeMs) || key.timeMs < 0 || key.timeMs > durationMs)) {
    throw new Error('Array time offset exceeds the existing timeline duration. Increase its duration or reduce the offset; keys are never clipped.')
  }
  return { ...track, keyframes }
}

/** Shift explicit layer clip boundaries together. Unbounded ranges remain
 * unbounded; an overflow is refused instead of truncating a copied clip. */
export function offsetCloneRange(layer: Layer, deltaMs: number, durationMs: number): Layer {
  if (!deltaMs) return layer
  const startMs = layer.startMs === undefined ? undefined : layer.startMs + deltaMs
  const endMs = layer.endMs === undefined ? undefined : layer.endMs + deltaMs
  if ([startMs, endMs].some(value => value !== undefined && (!Number.isFinite(value) || value < 0 || value > durationMs))) {
    throw new Error('Array time offset exceeds the composition clip range; copied clips are never trimmed.')
  }
  const propertyExpressions = layer.propertyExpressions ? { version: 1 as const, fields: Object.fromEntries(
    Object.entries(layer.propertyExpressions.fields).map(([path, definition]) => [path, { ...definition, timeOffsetMs: (definition.timeOffsetMs ?? 0) + deltaMs }]),
  ) } : undefined
  return { ...layer, ...(startMs !== undefined ? { startMs } : {}), ...(endMs !== undefined ? { endMs } : {}),
    ...(propertyExpressions ? { propertyExpressions } : {}) }
}
