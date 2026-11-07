// ── Value graph sampling ─────────────────────────────────────────────────────
// Pure helpers used by the timeline to draw a track's interpolated value as a
// background polyline (mini value-graph in dope-sheet mode, full graph in
// graph editor mode).

import type { Track } from '../types'
import { evaluateNumericTrack } from '../evaluator'

export interface ValueRange { min: number; max: number }

/**
 * Find the numeric value range over a track's keyframes.
 *
 * For a flat track (all keyframes equal) we widen the range by ±0.5 so the
 * sampled line still has vertical room and doesn't collapse to a single pixel.
 */
export function sampleTrackValueRange(track: Track): ValueRange | null {
  let min = Infinity
  let max = -Infinity
  for (const kf of track.keyframes) {
    if (typeof kf.value !== 'number') return null  // non-numeric tracks (string, boolean) have no continuous graph
    if (kf.value < min) min = kf.value
    if (kf.value > max) max = kf.value
  }
  if (min === Infinity) return null
  if (min === max) return { min: min - 0.5, max: max + 0.5 }
  return { min, max }
}

interface BuildParams {
  track: Track
  /** Visible time range in ms */
  startMs: number
  endMs: number
  /** Pixel width to sample across (one sample every ~2 px) */
  widthPx: number
  /** Pixel height for the value axis */
  heightPx: number
  /** Map a timeMs to a screen-px X (within the track area) */
  msToScreenPx: (timeMs: number) => number
  /** Override the range (defaults to per-track auto range) */
  range?: ValueRange
}

/**
 * Build an SVG `d` attribute for the track's interpolated value polyline.
 *
 * Returns an empty string when the track has fewer than 2 keyframes, is
 * non-numeric, or the visible window is empty. Sampling step is ~2 px to
 * keep the path short without visible aliasing.
 */
export function buildValueGraphPath(p: BuildParams): string {
  if (p.track.keyframes.length < 2) return ''
  const range = p.range ?? sampleTrackValueRange(p.track)
  if (!range) return ''

  const span    = Math.max(0.0001, range.max - range.min)
  const stepPx  = 2                       // one sample every 2 px
  const steps   = Math.max(8, Math.floor(p.widthPx / stepPx))
  const visMs   = Math.max(1, p.endMs - p.startMs)
  if (visMs <= 0) return ''

  let d = ''
  for (let i = 0; i <= steps; i++) {
    const tMs = p.startMs + (i / steps) * visMs
    const v   = evaluateNumericTrack(p.track, tMs)
    if (v == null) continue
    const x = p.msToScreenPx(tMs)
    // Y axis is inverted in SVG: high values go to the top of the row
    const norm = (v - range.min) / span
    const y    = p.heightPx - norm * p.heightPx
    d += `${d ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `
  }
  return d.trim()
}

/** Convert a keyframe's value to its Y offset within a height-px row using the given range. */
export function valueToY(value: number, range: ValueRange, heightPx: number): number {
  const span = Math.max(0.0001, range.max - range.min)
  const norm = (value - range.min) / span
  return heightPx - norm * heightPx
}
