import type { BezierPath } from '../types/path'
import type { Matrix2D } from '../geometry/Matrix2D'

/** Transform an authored Bezier path into another affine coordinate space.
 * Anchors and paired in/out handles are absolute local coordinates, so all use
 * applyToPoint (never vector-only translation). Order, closed flag and anchor
 * metadata survive; source records are not mutated. Partial legacy handles stay
 * unchanged, matching the path converter's requirement for complete pairs.
 * No flattening, sampling or zoom-dependent approximation is introduced. The
 * caller owns finite-input and invertibility policy; reflections are supported.
 */
export function transformBezierPath(path: BezierPath, matrix: Matrix2D): BezierPath {
  return { ...path, anchors: path.anchors.map(anchor => ({
    ...anchor, ...matrix.applyToPoint(anchor),
    ...(anchor.inX !== undefined && anchor.inY !== undefined ? (() => {
      const point = matrix.applyToPoint({ x: anchor.inX, y: anchor.inY })
      return { inX: point.x, inY: point.y }
    })() : {}),
    ...(anchor.outX !== undefined && anchor.outY !== undefined ? (() => {
      const point = matrix.applyToPoint({ x: anchor.outX, y: anchor.outY })
      return { outX: point.x, outY: point.y }
    })() : {}),
  })) }
}
