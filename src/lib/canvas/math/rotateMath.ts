/**
 * Rotation drag math. Pure, framework-free.
 */

export interface Point {
  x: number
  y: number
}

export { wrapAngle180 } from '../../geometry/CoordinateSystem'

/** Angle (degrees) from a pivot to a point, measured with atan2 (0° = +X). */
export function angleDegFromPivot(pivotX: number, pivotY: number, x: number, y: number): number {
  return (Math.atan2(y - pivotY, x - pivotX) * 180) / Math.PI
}

/** Rotate a point around a pivot by `deltaDeg` degrees. */
export function rotatePointAroundPivot(
  x: number, y: number,
  pivotX: number, pivotY: number,
  deltaDeg: number,
): Point {
  const rad = (deltaDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const ox = x - pivotX
  const oy = y - pivotY
  return {
    x: pivotX + ox * cos - oy * sin,
    y: pivotY + ox * sin + oy * cos,
  }
}
