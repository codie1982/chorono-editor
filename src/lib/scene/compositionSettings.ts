import type { Composition } from '../types'

/** Existing portable-scene limits, shared by the inspector and MCP preflight. */
export const COMPOSITION_SETTINGS_LIMITS = Object.freeze({ minSize: 1, maxSize: 8192, minFps: 1, maxFps: 120, maxDurationMs: 3600000 })

/** Validate dimensions in pixels, duration in ms and FPS without coercion or
 * mutation. Zero duration is supported for still compositions; fractional FPS
 * remains valid. Does not retime tracks or validate unrelated source fields. */
export function compositionSettingsValid(value: Pick<Composition, 'width' | 'height' | 'frameRate' | 'durationMs'>): boolean {
  const l = COMPOSITION_SETTINGS_LIMITS
  return [value.width, value.height, value.frameRate, value.durationMs].every(Number.isFinite)
    && value.width >= l.minSize && value.width <= l.maxSize && value.height >= l.minSize && value.height <= l.maxSize
    && value.frameRate >= l.minFps && value.frameRate <= l.maxFps && value.durationMs >= 0 && value.durationMs <= l.maxDurationMs
}
