/**
 * Scale-gizmo drag math (transform.scaleX / scaleY). Pure, framework-free.
 */

import type { Point } from './rotateMath'

/** Drag distance (composition px) that doubles the scale. */
export const SCALE_SENSITIVITY = 100
/** Floor scale so a layer can't flip past zero / vanish (stays selectable). */
export const MIN_SCALE = 0.05

export interface ScaleFactors {
  factorX: number
  factorY: number
}

/**
 * Convert a pointer delta into per-axis scale factors.
 *
 * `axis` is the grabbed gizmo arrow. 'both' (or Shift-forced uniform) uses the
 * dominant drag direction so diagonal drags feel natural.
 */
export function scaleFactorFromDelta(
  dx: number, dy: number,
  axis: 'x' | 'y' | 'both',
  sensitivity: number = SCALE_SENSITIVITY,
): ScaleFactors {
  const fx = 1 + dx / sensitivity
  const fy = 1 + dy / sensitivity
  if (axis === 'x') return { factorX: fx, factorY: 1 }
  if (axis === 'y') return { factorX: 1, factorY: fy }
  // both: uniform from the dominant axis
  const f = Math.abs(dx) >= Math.abs(dy) ? fx : fy
  return { factorX: f, factorY: f }
}

/** Apply a factor to a base scale, clamped to MIN_SCALE. */
export function clampScale(base: number, factor: number): number {
  return Math.max(MIN_SCALE, base * factor)
}

/**
 * New transform position for a layer scaled around a common pivot.
 *
 * The layer's ANCHOR (origin + anchor offset) is the point pushed away from /
 * pulled toward the pivot; the returned x/y is the transform origin that keeps
 * that anchor at the scaled location.
 */
export function scaleTransformAroundPivot(
  originalX: number, originalY: number,
  anchorX: number, anchorY: number,
  pivotX: number, pivotY: number,
  factorX: number, factorY: number,
): Point {
  const ax = originalX + anchorX
  const ay = originalY + anchorY
  const ox = (ax - pivotX) * factorX
  const oy = (ay - pivotY) * factorY
  return {
    x: (pivotX + ox) - anchorX,
    y: (pivotY + oy) - anchorY,
  }
}
