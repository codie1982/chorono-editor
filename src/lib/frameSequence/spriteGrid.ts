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
 * Cell size is derived by integer-dividing the image by the grid. Finite grid/
 * frame/FPS inputs are required; columns/rows cannot exceed source pixels, so
 * no zero-sized cell or unsafe frame count can enter scene JSON. Nonpositive
 * columns/rows/frame counts retain historical clamping; nonpositive FPS uses12.
 * No per-frame arrays, allocation by frame count, native or scene mutation.
 */
export function buildSpriteGrid(assetId: string, input: SpriteGridInput): FrameSequenceData {
  if (![input.imageWidth, input.imageHeight].every(n => Number.isSafeInteger(n) && n > 0)) throw new RangeError('Sprite source dimensions must be positive pixel integers.')
  if (![input.columns, input.rows].every(Number.isFinite)) throw new RangeError('Sprite grid dimensions must be finite.')
  const columns = Math.max(1, Math.floor(input.columns))
  const rows    = Math.max(1, Math.floor(input.rows))
  const maxFrames = columns * rows
  if (!Number.isSafeInteger(maxFrames) || columns > input.imageWidth || rows > input.imageHeight) throw new RangeError('Each sprite cell must contain at least one source pixel.')
  if (input.frameCount !== undefined && !Number.isFinite(input.frameCount)) throw new RangeError('Sprite frame count must be finite.')
  if (input.fps !== undefined && !Number.isFinite(input.fps)) throw new RangeError('Sprite FPS must be finite.')
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
