/** Squared distance and clamped parameter on a finite segment, in one shared
 * coordinate space. A zero-length segment is its endpoint. No mutation. */
export function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): { dSq: number; t: number } {
  const vx = bx - ax, vy = by - ay, length = vx * vx + vy * vy
  const t = Math.max(0, Math.min(1, length > 0 ? ((px - ax) * vx + (py - ay) * vy) / length : 0))
  const dx = px - ax - t * vx, dy = py - ay - t * vy
  return { dSq: dx * dx + dy * dy, t }
}
