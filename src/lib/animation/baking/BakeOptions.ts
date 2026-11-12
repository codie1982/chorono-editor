export const MAX_BAKE_SAMPLES = 20000
export interface BakeOptions {
  /** Inclusive timeline-local ms, finite and 0 ≤ start ≤ end. */
  startMs: number
  endMs: number
  /** Positive finite sample rate, at most 240 Hz; fractional rates supported. */
  fps: number
  /** Normalized vertical value error at sample times, 0..1; zero keeps samples. */
  tolerance: number
  /** Transient cancellation, never persisted in scene/history. */
  signal?: { readonly aborted: boolean }
  /** Caller namespace for deterministic IDs; editor commands supply timeline ID. */
  keyIdPrefix?: string
}

/** Validate before allocating/evaluating; returns the finite number of intervals.
 * An exact end sample is emitted independently of floating-point frame drift. */
export function validateBakeOptions(opts: BakeOptions): number {
  if (![opts.startMs, opts.endMs, opts.fps, opts.tolerance].every(Number.isFinite)
    || opts.startMs < 0 || opts.endMs < opts.startMs || opts.fps <= 0 || opts.fps > 240
    || opts.tolerance < 0 || opts.tolerance > 1) throw new Error('Bake requires finite local bounds, 0 < FPS ≤ 240 and 0 ≤ tolerance ≤ 1.')
  const intervals = Math.ceil((opts.endMs - opts.startMs) * opts.fps / 1000)
  if (!Number.isSafeInteger(intervals) || intervals + 1 > MAX_BAKE_SAMPLES) throw new Error(`Bake exceeds ${MAX_BAKE_SAMPLES} samples; reduce FPS or the range.`)
  if (opts.signal?.aborted) throw new Error('Bake cancelled')
  return intervals
}
