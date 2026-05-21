/**
 * Shared scalar helpers for canvas drag math. Pure, framework-free — safe to
 * unit test and (eventually) port to the SDK / native runtime.
 */

/** Clamp `v` into the inclusive range [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Round `v` to the nearest multiple of `step`. `step <= 0` is a no-op. */
export function snapToGrid(v: number, step: number): number {
  if (step <= 0) return v
  return Math.round(v / step) * step
}
