import type { AudioData, Layer } from '../types'

export const MAX_AUDIO_GAIN = 4
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const positive = (value: number | undefined, fallback = 0) => Number.isFinite(value) ? Math.max(0, value!) : fallback

export function gainToDb(gain: number): number {
  return gain > 0 && Number.isFinite(gain) ? 20 * Math.log10(gain) : -Infinity
}

export function dbToGain(db: number): number {
  if (db === -Infinity) return 0
  if (!Number.isFinite(db)) throw new Error('Audio gain must be a finite dB value or -Infinity.')
  return clamp(Math.pow(10, db / 20), 0, MAX_AUDIO_GAIN)
}

export interface AudioClipWindow {
  startMs: number
  endMs: number
  durationMs: number
  sourceOffsetMs: number
  sourceEndMs: number
  sourceDurationMs?: number
  fadeInMs: number
  fadeOutMs: number
  fadeStartMs: number
  fadeEndMs: number
}

/** Resolves safe clip bounds, including legacy clips without explicit timing. */
export function resolveAudioClipWindow(layer: Layer, assetDurationMs?: number, fallbackEndMs = 0): AudioClipWindow {
  const sourceDurationMs = Number.isFinite(assetDurationMs) && assetDurationMs! > 0 ? assetDurationMs : undefined
  const startMs = positive(layer.startMs)
  const sourceOffsetMs = clamp(positive(layer.audio?.startOffsetMs), 0, sourceDurationMs ?? Infinity)
  const remaining = sourceDurationMs === undefined ? undefined : Math.max(0, sourceDurationMs - sourceOffsetMs)
  const defaultEnd = remaining === undefined ? Math.max(startMs, positive(fallbackEndMs)) : startMs + remaining
  let endMs = Math.max(startMs, positive(layer.endMs, defaultEnd))
  if (!layer.audio?.loop && remaining !== undefined) endMs = Math.min(endMs, startMs + remaining)
  const durationMs = endMs - startMs
  const fadeStartMs = Number.isFinite(layer.audio?.fadeRange?.startMs) ? layer.audio!.fadeRange!.startMs : startMs
  const fadeEndMs = Math.max(fadeStartMs, Number.isFinite(layer.audio?.fadeRange?.endMs) ? layer.audio!.fadeRange!.endMs : endMs)
  const fadeDurationMs = fadeEndMs - fadeStartMs
  return { startMs, endMs, durationMs, sourceOffsetMs, sourceEndMs: sourceOffsetMs + durationMs, sourceDurationMs,
    fadeInMs: clamp(positive(layer.audio?.fadeInMs), 0, fadeDurationMs),
    fadeOutMs: clamp(positive(layer.audio?.fadeOutMs), 0, fadeDurationMs), fadeStartMs, fadeEndMs }
}

/** Validate mutations before committing; malformed legacy data is tolerated only on reads. */
export function normalizeAudioClipPatch(patch: Partial<AudioData>, durationMs: number, sourceDurationMs?: number): Partial<AudioData> {
  const allowed = new Set(['assetId', 'volume', 'muted', 'startOffsetMs', 'loop', 'fadeInMs', 'fadeOutMs', 'fadeRange', 'pan', 'timelineId'])
  for (const key of Object.keys(patch)) if (!allowed.has(key)) throw new Error(`Unknown audio property: ${key}.`)
  const next = { ...patch }
  for (const key of ['volume', 'pan', 'startOffsetMs', 'fadeInMs', 'fadeOutMs'] as const) {
    if (key in next && (typeof next[key] !== 'number' || !Number.isFinite(next[key]))) throw new Error(`Audio ${key} must be finite.`)
  }
  if (next.volume !== undefined) next.volume = clamp(next.volume, 0, MAX_AUDIO_GAIN)
  if (next.pan !== undefined) next.pan = clamp(next.pan, -1, 1)
  if (next.startOffsetMs !== undefined) next.startOffsetMs = clamp(next.startOffsetMs, 0, positive(sourceDurationMs, Infinity))
  if (next.fadeInMs !== undefined) next.fadeInMs = clamp(next.fadeInMs, 0, Math.max(0, durationMs))
  if (next.fadeOutMs !== undefined) next.fadeOutMs = clamp(next.fadeOutMs, 0, Math.max(0, durationMs))
  for (const key of ['muted', 'loop'] as const) if (key in next && typeof next[key] !== 'boolean') throw new Error(`Audio ${key} must be a boolean.`)
  if ('assetId' in next && (typeof next.assetId !== 'string' || !next.assetId.trim())) throw new Error('Audio assetId must not be empty.')
  if (next.timelineId !== undefined && (typeof next.timelineId !== 'string' || !next.timelineId.trim())) throw new Error('Audio timelineId must not be empty.')
  if (next.fadeRange !== undefined && (!Number.isFinite(next.fadeRange?.startMs) || !Number.isFinite(next.fadeRange?.endMs)
      || next.fadeRange.endMs <= next.fadeRange.startMs)) throw new Error('Audio fade range must be a finite positive interval.')
  if (next.fadeRange && Object.keys(next.fadeRange).some(key => key !== 'startMs' && key !== 'endMs')) throw new Error('Unknown audio fade range property.')
  return next
}
