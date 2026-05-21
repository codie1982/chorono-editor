/**
 * Move-drag math. Pure, framework-free.
 *
 * NOTE: object/grid/pixel snapping for move lives in the SnapEngine and stays
 * in the component — this module only owns the deterministic axis-constraint
 * step that turns a raw pointer delta into the locked delta actually applied.
 */

export interface AxisLockResult {
  dx: number
  dy: number
}

/**
 * Apply axis constraints to a raw pointer delta.
 *
 * Precedence (matches Figma / Illustrator and the Move-mode arrows):
 *   1. A hard `axisLock` from clicking a Move-mode axis arrow wins outright.
 *   2. Otherwise, Shift locks to the dominant axis (larger absolute delta).
 *   3. Otherwise, the delta passes through unchanged.
 */
export function applyAxisLock(
  dx: number,
  dy: number,
  axisLock: 'x' | 'y' | null | undefined,
  shiftKey: boolean,
): AxisLockResult {
  let dxLocked = dx
  let dyLocked = dy
  if (axisLock === 'x')      dyLocked = 0
  else if (axisLock === 'y') dxLocked = 0
  else if (shiftKey) {
    if (Math.abs(dx) >= Math.abs(dy)) dyLocked = 0
    else                              dxLocked = 0
  }
  return { dx: dxLocked, dy: dyLocked }
}
