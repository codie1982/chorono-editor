/** Screen-space closure policy for a line/continued contour. At least three
 * distinct anchors are required; CSS distance stays constant across pan/zoom.
 * Only the owning contour's opposite endpoint is eligible (never auto-weld).
 * Degenerate collinear closed contours remain valid stroke-only geometry. */
export function shouldAutoClose(points: readonly { x: number; y: number }[], target: { x: number; y: number },
  pointer: { x: number; y: number }, zoom: number, existingCount = 0): boolean {
  return Number.isFinite(zoom) && zoom > 0 && points.length + existingCount >= 3
    && Math.hypot(pointer.x - target.x, pointer.y - target.y) * zoom <= 10
}
