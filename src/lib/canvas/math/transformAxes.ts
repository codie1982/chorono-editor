import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { applyAxisLock } from './moveMath'

/** Viewport preference, independent of layer data, pivot mode and Undo. */
export type TransformSpace = 'scene' | 'local'
type Point = { x: number; y: number }

/** Unit-length axes in composition space. Scene uses the artboard axes; Local
 * follows the active root's evaluated world matrix, including parents and
 * reflections. Normalize each column to keep drag sensitivity in composition
 * pixels; inherited shear may make the axes non-perpendicular. Missing,
 * non-finite or singular frames fall back to Scene (edit guards still reject
 * singular layer transforms). Returns a fresh immutable matrix, no translation. */
export function transformAxisFrame(space: TransformSpace, world?: Matrix2D | null): Matrix2D {
  if (space === 'scene' || !world) return Matrix2D.identity()
  const x = Math.hypot(world.a, world.b), y = Math.hypot(world.c, world.d)
  if (![x, y, world.determinant()].every(Number.isFinite) || x < 1e-9 || y < 1e-9) return Matrix2D.identity()
  const frame = new Matrix2D(world.a / x, world.b / x, world.c / y, world.d / y, 0, 0)
  return Math.abs(frame.determinant()) < 1e-9 ? Matrix2D.identity() : frame
}

/** Constrain a composition-pixel displacement in a captured unit axis frame.
 * Hard arrow locks win; Shift picks the dominant frame coordinate, with X ties.
 * Returns a world vector and the chosen axis so snapping can reapply that exact
 * constraint without switching axes. Omitted frame preserves legacy Scene. */
export function constrainAxisDelta(delta: Point, axis: 'x' | 'y' | null | undefined,
  shift: boolean, frame = Matrix2D.identity()) {
  const local = frame.invert().applyToVector(delta)
  const chosen = axis ?? (shift ? Math.abs(local.x) >= Math.abs(local.y) ? 'x' : 'y' : null)
  const locked = applyAxisLock(local.x, local.y, chosen, false)
  const world = frame.applyToVector({ x: locked.dx, y: locked.dy })
  return { dx: world.x, dy: world.y, axis: chosen }
}
