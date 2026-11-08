import type { PathBounds } from '../../geometry/computePathBounds'
interface Affine { a: number; b: number; c: number; d: number; e: number; f: number }

/** Conservative affine AABB test in backing pixels. Unknown, singular or invalid
 * matrices/bounds preserve drawing. Two pixels protect antialias edges. Reused
 * by actual paint and resource demand; no separate culling approximation. */
export function paintOutsideArea(bounds: PathBounds | null, matrix: Affine, area: PathBounds): boolean {
  const m = matrix
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height, m.a, m.b, m.c, m.d, m.e, m.f,
    area.x, area.y, area.width, area.height].every(Number.isFinite) || bounds.width < 0 || bounds.height < 0
    || area.width < 0 || area.height < 0 || Math.abs(m.a * m.d - m.b * m.c) <= 1e-12) return false
  const halfW = bounds.width / 2, halfH = bounds.height / 2, x = bounds.x + halfW, y = bounds.y + halfH
  const cx = m.a * x + m.c * y + m.e, cy = m.b * x + m.d * y + m.f
  const rx = Math.abs(m.a) * halfW + Math.abs(m.c) * halfH, ry = Math.abs(m.b) * halfW + Math.abs(m.d) * halfH
  return cx + rx < area.x - 2 || cx - rx > area.x + area.width + 2
    || cy + ry < area.y - 2 || cy - ry > area.y + area.height + 2
}
