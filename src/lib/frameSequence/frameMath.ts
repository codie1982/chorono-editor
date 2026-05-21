// ── frameMath ─────────────────────────────────────────────────────────────────
//
// Pure, stateless math for sprite-sheet / frame-sequence playback (BL-07).
// Same inputs → same output, so timeline scrubbing is deterministic.
//
// No DOM, no canvas — fully unit-testable in Node.

import type { FrameSequenceData } from '../types/media'

export interface FrameRect {
  /** Source-sheet x of the frame cell (px). */
  sx: number
  /** Source-sheet y of the frame cell (px). */
  sy: number
  /** Cell width (px). */
  sw: number
  /** Cell height (px). */
  sh: number
}

/**
 * Resolve the active frame index at a given global time.
 *
 * @param timeMs   Global playhead time (ms).
 * @param startMs  When this layer becomes active (ms). Default 0.
 * @param cfg      Frame-sequence config.
 * @returns        Frame index in [0, frameCount-1].
 */
export function frameAtTime(timeMs: number, startMs: number, cfg: FrameSequenceData): number {
  const count = Math.max(1, Math.floor(cfg.frameCount))
  const fps   = cfg.fps > 0 ? cfg.fps : 1
  const rel   = timeMs - startMs
  if (rel <= 0) return 0

  const frameDurationMs = 1000 / fps
  const raw = Math.floor(rel / frameDurationMs)

  if (cfg.loop ?? true) {
    // JS % can be negative only for negative raw, which we've excluded.
    return raw % count
  }
  return Math.min(raw, count - 1)
}

/**
 * Compute the source-sheet rectangle for a frame index.
 * Clamps the index defensively to [0, frameCount-1].
 */
export function frameRect(index: number, cfg: FrameSequenceData): FrameRect {
  const count = Math.max(1, Math.floor(cfg.frameCount))
  const cols  = Math.max(1, Math.floor(cfg.columns))
  const idx   = Math.max(0, Math.min(index, count - 1))
  const col   = idx % cols
  const row   = Math.floor(idx / cols)
  return {
    sx: col * cfg.frameWidth,
    sy: row * cfg.frameHeight,
    sw: cfg.frameWidth,
    sh: cfg.frameHeight,
  }
}

/** Total duration of one full playthrough (ms). */
export function sequenceDurationMs(cfg: FrameSequenceData): number {
  const count = Math.max(1, Math.floor(cfg.frameCount))
  const fps   = cfg.fps > 0 ? cfg.fps : 1
  return (count / fps) * 1000
}
