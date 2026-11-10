import type { Track } from '../types'
import { createNumericTrackSampler } from '../evaluator'
import type { ValueRange } from './curveMath'

/** Bounded read-only ranges of evaluated numeric signals, including zero-key
 * controllers and modifiers. Uses local ms over the visible window (negative
 * times allow existing OOR inspection). 129 probes per track; no synthetic
 * keys, history, polling or global cache. Sampling can miss narrow extrema.
 */
export function curveSignalPreview(tracks: readonly Track[], startMs: number, endMs: number) {
  const ranges = new Map<string, ValueRange>(), diagnostics = new Map<string, string>()
  let min = Infinity, max = -Infinity
  for (const track of tracks) {
    let low = Infinity, high = -Infinity
    try {
      if (![startMs, endMs].every(Number.isFinite) || endMs < startMs) throw new Error('Invalid curve preview window.')
      const sample = createNumericTrackSampler(track)
      for (let i = 0; i <= 128; i++) {
        const value = sample(startMs + (endMs - startMs) * i / 128)
        if (value === null) throw new Error('Signal has a non-finite or unavailable numeric value. Check its controller/modifiers before baking.')
        low = Math.min(low, value); high = Math.max(high, value)
      }
      const pad = (high - low) * 0.05 || 1
      ranges.set(track.target, { min: low - pad, max: high + pad })
      min = Math.min(min, low); max = Math.max(max, high)
    } catch (error) { diagnostics.set(track.target, error instanceof Error ? error.message : String(error)); ranges.set(track.target, { min: -1, max: 1 }) }
  }
  const pad = (max - min) * 0.05 || 1
  return { ranges, range: Number.isFinite(min) ? { min: min - pad, max: max + pad } : { min: -1, max: 1 }, diagnostics }
}
