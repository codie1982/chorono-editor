/**
 * Anchor / pivot drag math. Pure, framework-free.
 */

import { snapToGrid } from './coordinateMath'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import type { Transform } from '@/lib/types'

export interface AnchorMoveInput {
  /** Relevant fields from the layer's transform at drag start. */
  x: number
  y: number
  anchorX: number
  anchorY: number
  rotationDeg: number
  scaleX: number
  scaleY: number
  /** Pointer delta in composition px. */
  dx: number
  dy: number
  snapGrid: boolean
  snapPixel: boolean
  /** Grid step (composition px) used when snapGrid is on. */
  gridSize: number
  /** Parent-local → composition transform at gesture start. */
  parentWorld?: Matrix2D
}

export interface AnchorMoveResult {
  anchorX: number
  anchorY: number
  x: number
  y: number
}

/** Change the local pivot while keeping every rendered point in place. */
export function reanchorTransform(transform: Transform, anchorX: number, anchorY: number): Transform {
  const dx = anchorX - transform.anchorX
  const dy = anchorY - transform.anchorY
  const linear = Matrix2D.rotation(transform.rotationDeg).scale(transform.scaleX, transform.scaleY)
  const rotated = linear.applyToVector({ x: dx, y: dy })
  return {
    ...transform,
    anchorX, anchorY,
    x: transform.x + rotated.x - dx,
    y: transform.y + rotated.y - dy,
  }
}

/**
 * Move a layer's anchor while keeping the layer visually pinned.
 *
 * Changing the anchor moves the rendered rotation/scale pivot, which would
 * shift every pixel of a rotated/scaled layer. We counter that by translating
 * transform.x/y. Derived from screenP = T + A + R·S·(P − A); solving for the
 * new T that keeps screenP fixed for any P.
 */
export function calculateAnchorMove(input: AnchorMoveInput): AnchorMoveResult {
  const { x, y, anchorX: origAX, anchorY: origAY, rotationDeg, scaleX, scaleY, dx, dy } = input
  const parent = input.parentWorld ?? Matrix2D.identity()
  const linear = parent.multiply(Matrix2D.rotation(rotationDeg).scale(scaleX, scaleY))
  if (Math.abs(linear.determinant()) < 1e-9) return { x, y, anchorX: origAX, anchorY: origAY }

  const pivot = parent.applyToPoint({ x: x + origAX, y: y + origAY })
  let targetX = pivot.x + dx
  let targetY = pivot.y + dy
  if (input.snapGrid) {
    targetX = snapToGrid(targetX, input.gridSize)
    targetY = snapToGrid(targetY, input.gridSize)
  }
  if (input.snapPixel) {
    targetX = Math.round(targetX)
    targetY = Math.round(targetY)
  }

  // Convert the cursor's world movement to the geometry's local axes. Passing
  // dx/dy through directly makes a rotated pivot move in the wrong direction.
  const delta = linear.invert().applyToVector({ x: targetX - pivot.x, y: targetY - pivot.y })
  const result = reanchorTransform({ x, y, anchorX: origAX, anchorY: origAY, rotationDeg, scaleX, scaleY },
    origAX + delta.x, origAY + delta.y)
  return { anchorX: result.anchorX, anchorY: result.anchorY, x: result.x, y: result.y }
}
