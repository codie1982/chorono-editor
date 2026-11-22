import type { Transform } from '../types'
import { Matrix2D } from './Matrix2D'

/** Compose the existing anchored parent-local 2D TRS without evaluation or
 * mutation: T(position + anchor) R(degrees) S T(-anchor). No shear/z contract.
 * Shared by viewport transforms and persistent Boolean input preparation. */
export function layerTransformMatrix(transform: Readonly<Transform>): Matrix2D {
  return Matrix2D.translation(transform.x + transform.anchorX, transform.y + transform.anchorY)
    .rotate(transform.rotationDeg).scale(transform.scaleX, transform.scaleY)
    .translate(-transform.anchorX, -transform.anchorY)
}
