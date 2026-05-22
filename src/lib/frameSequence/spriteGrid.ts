// ── spriteGrid ────────────────────────────────────────────────────────────────
//
// Pure helpers that turn a sprite-sheet image + grid choice into a validated
// FrameSequenceData. No DOM — unit-testable in Node.

import type { FrameSequenceData } from '../types/media'

export interface SpriteGridInput {
  /** Source image pixel dimensions. */
  imageWidth: number
  imageHeight: number
  /** Grid columns / rows the user specified (≥ 1). */
  columns: number
  rows: number
  /** Playback rate (fps). Defaults to 12 when ≤ 0. */
  fps?: number
  /**
   * Total frames. Defaults to columns*rows. Clamped to [1, columns*rows] so a
   * partially-filled last row is supported.
   */
  frameCount?: number
  loop?: boolean
}

/**
 * Build a FrameSequenceData from a sprite-sheet grid choice.
 * Cell size is derived by integer-dividing the image by the grid.
 */
export function buildSpriteGrid(assetId: string, input: SpriteGridInput): FrameSequenceData {
  const columns = Math.max(1, Math.floor(input.columns))
  const rows    = Math.max(1, Math.floor(input.rows))
  const maxFrames = columns * rows
  const frameCount = input.frameCount === undefined
    ? maxFrames
    : Math.max(1, Math.min(Math.floor(input.frameCount), maxFrames))
  const fps = input.fps && input.fps > 0 ? input.fps : 12

  return {
    assetId,
    columns,
    rows,
    frameCount,
    frameWidth:  Math.floor(input.imageWidth  / columns),
    frameHeight: Math.floor(input.imageHeight / rows),
    fps,
    loop:        input.loop ?? true,
    objectFit:   'contain',
  }
}
