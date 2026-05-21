/**
 * Rotation drag math. Pure, framework-free.
 */

export interface Point {
  x: number
  y: number
}

/** Normalise an angle (degrees) into the (-180, 180] range used by transforms. */
export function wrapAngle180(deg: number): number {
  let d = deg
  while (d > 180)  d -= 360
  while (d < -180) d += 360
  return d
}

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
