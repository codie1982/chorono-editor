import type { PathBounds } from './computePathBounds'
import type { Matrix2D } from './Matrix2D'

/** Union of finite axis-aligned rectangles in the same coordinate space.
 * Does not mutate either input; null is the empty accumulator. */
export function unionBounds(a: PathBounds | null, b: PathBounds): PathBounds {
  if (!a) return { ...b }
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y }
}

/** Conservative affine AABB, using projected half-extents. Local input becomes
 * matrix-output coordinates; includes rotations, reflection and shear. Caller
 * validates finiteness/degeneracy before allocating from the result. */
export function transformBounds(bounds: PathBounds, matrix: Pick<Matrix2D, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>): PathBounds {
  const hw = bounds.width / 2, hh = bounds.height / 2
  const x = bounds.x + hw, y = bounds.y + hh
  const cx = matrix.a * x + matrix.c * y + matrix.e, cy = matrix.b * x + matrix.d * y + matrix.f
  const rx = Math.abs(matrix.a) * hw + Math.abs(matrix.c) * hh
  const ry = Math.abs(matrix.b) * hw + Math.abs(matrix.d) * hh
  return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 }
}
