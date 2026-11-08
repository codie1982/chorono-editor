export interface Distribution { count: number; min: number; p50: number; p95: number; max: number; mean: number }

/**
 * Nearest-rank quantiles for finite, non-negative duration/byte/count samples.
 * Sorts a copy; caller order is preserved. Empty populations return null instead
 * of a fabricated zero. Invalid samples throw RangeError. O(n log n), intended
 * for bounded diagnostic summaries outside the hot render path.
 */
export function summarizeNumbers(values: readonly number[]): Distribution | null {
  if (!values.length) return null
  if (!values.every(value => Number.isFinite(value) && value >= 0)) throw new RangeError('Invalid numeric sample.')
  const sorted = [...values].sort((a, b) => a - b)
  return { count: sorted.length, min: sorted[0], p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted[sorted.length - 1],
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length }
}
