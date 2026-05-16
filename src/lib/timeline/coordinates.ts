// ── Timeline Coordinate System ────────────────────────────────────────────────
// All timeline rendering uses pixel coordinates, not percentages.
// scrollLeftPx is the scroll state (not scrollLeftMs) so zoom changes don't
// require offset recalculation.

/** Convert a time value to a pixel position within the full (zoomed) content. */
export function msToPixel(
  timeMs: number,
  durationMs: number,
  zoom: number,
  trackWidth: number,
): number {
  if (durationMs <= 0) return 0
  return (timeMs / durationMs) * trackWidth * zoom
}

/** Convert a pixel position (within full zoomed content) back to milliseconds. */
export function pixelToMs(
  px: number,
  durationMs: number,
  zoom: number,
  trackWidth: number,
): number {
  const total = trackWidth * zoom
  if (total <= 0) return 0
  return (px / total) * durationMs
}

/**
 * Convert a clientX pointer coordinate to milliseconds.
 * Accounts for track area left edge, current scroll offset, and zoom.
 */
export function clientXToMs(
  clientX: number,
  trackAreaLeft: number,
  scrollLeftPx: number,
  durationMs: number,
  zoom: number,
  trackWidth: number,
): number {
  const px = clientX - trackAreaLeft + scrollLeftPx
  return Math.max(0, Math.min(durationMs, pixelToMs(px, durationMs, zoom, trackWidth)))
}

/** Convert milliseconds to frame number (floor). */
export function msToFrame(timeMs: number, frameRate: number): number {
  return Math.floor((timeMs / 1000) * frameRate)
}

/** Convert frame number to milliseconds. */
export function frameToMs(frame: number, frameRate: number): number {
  return (frame / frameRate) * 1000
}

/**
 * Compute a "nice" tick interval (ms) so that ticks appear roughly every
 * targetPxPerTick pixels given the current zoom and duration.
 */
export function computeTickIntervalMs(
  totalContentPx: number,
  durationMs: number,
  targetPxPerTick = 80,
): number {
  if (totalContentPx <= 0 || durationMs <= 0) return 1000
  const rawIntervalMs = (targetPxPerTick / totalContentPx) * durationMs
  const niceValues = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000]
  for (const v of niceValues) {
    if (v >= rawIntervalMs) return v
  }
  return niceValues[niceValues.length - 1]
}
