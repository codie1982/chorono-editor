/**
 * Anchor / pivot drag math. Pure, framework-free.
 */

import { snapToGrid } from './coordinateMath'

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
}

export interface AnchorMoveResult {
  anchorX: number
  anchorY: number
  x: number
  y: number
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

  let nAX = origAX + dx
  let nAY = origAY + dy
  if (input.snapGrid) {
    // Snap the WORLD position of the anchor to the grid, then back to local.
    const wx = x + nAX
    const wy = y + nAY
    nAX = snapToGrid(wx, input.gridSize) - x
    nAY = snapToGrid(wy, input.gridSize) - y
  }
  if (input.snapPixel) {
    nAX = Math.round(nAX)
    nAY = Math.round(nAY)
  }

  const r  = (rotationDeg * Math.PI) / 180
  const cR = Math.cos(r), sR = Math.sin(r)
  const dAX = nAX - origAX
  const dAY = nAY - origAY
  const compX = dAX * (scaleX * cR - 1) - scaleY * sR * dAY
  const compY = scaleX * sR * dAX + dAY * (scaleY * cR - 1)

  return {
    anchorX: nAX,
    anchorY: nAY,
    x: x + compX,
    y: y + compY,
  }
}
