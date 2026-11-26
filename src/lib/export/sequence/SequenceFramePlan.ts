/** Sampling range accepted by the image-sequence renderer. Omitting the range
 * preserves the legacy full-composition behavior. A bounded explicit range is
 * used by integrations such as Chorono Render's current-frame transfer. */
export interface SequenceFrameRange {
  /** Global timeline time for the first sample, in milliseconds. Default 0. */
  startTimeMs?: number
  /** Exact number of samples. Default derives from duration and FPS. */
  frameCount?: number
}

export interface SequenceFramePlan {
  readonly fps: number
  readonly startTimeMs: number
  readonly frameCount: number
}

/**
 * Resolve deterministic sequence sampling without touching renderer state.
 * FPS may be fractional for compatibility with existing exporters. The result
 * is capped before any canvas or ZIP allocation. Explicit ranges require both
 * a finite non-negative start time and a positive integer frame count.
 */
export function resolveSequenceFramePlan(
  durationMs: number,
  fps: number,
  range: SequenceFrameRange = {},
  maxFrames = 4096,
): SequenceFramePlan {
  if (!Number.isFinite(durationMs) || durationMs < 0 || !Number.isFinite(fps)) {
    throw new RangeError('Invalid sequence frame rate/duration.')
  }
  const resolvedFps = Math.max(1, fps)
  const startTimeMs = range.startTimeMs ?? 0
  if (!Number.isFinite(startTimeMs) || startTimeMs < 0) {
    throw new RangeError('Invalid sequence start time.')
  }
  const frameCount = range.frameCount ?? Math.max(1, Math.round(durationMs / 1000 * resolvedFps))
  if (!Number.isSafeInteger(frameCount) || frameCount < 1 || frameCount > maxFrames) {
    throw new RangeError(`Sequence output exceeds the ${maxFrames}-frame limit.`)
  }
  return { fps: resolvedFps, startTimeMs, frameCount }
}

/** Return the global timeline sample time for a zero-based frame index. */
export function sequenceFrameTimeMs(plan: SequenceFramePlan, index: number): number {
  if (!Number.isSafeInteger(index) || index < 0 || index >= plan.frameCount) {
    throw new RangeError('Sequence frame index is outside the resolved range.')
  }
  return plan.startTimeMs + index / plan.fps * 1000
}
