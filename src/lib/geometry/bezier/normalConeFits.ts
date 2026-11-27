import type { Vec2 } from '../CoordinateSystem'

/** The Bézier derivative is a nonnegative combination of control-edge vectors.
 * If their directions fit this forward cone, every regular curve tangent does
 * too. Bounding d·|n_curve−n_chord| prevents a flat-looking, high-offset curve
 * from silently exceeding the requested approximation. */
export function normalConeFits(controls: readonly Vec2[], distance: number, tolerance: number): boolean {
  if (!distance) return true
  const a = controls[0], b = controls.at(-1)!, length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length < 1e-12) return false
  const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length
  return controls.slice(1).every((point, i) => {
    const dx = point.x - controls[i].x, dy = point.y - controls[i].y, size = Math.hypot(dx, dy)
    return size < 1e-12 || (dx * ux + dy * uy > 0 && distance * Math.hypot(dx / size - ux, dy / size - uy) <= tolerance)
  })
}
