import { Matrix2D } from '../../geometry/Matrix2D'
import { numberSetting } from '../settings'

export interface MeshTransformSettings {
  x: number; y: number; rotation: number; scaleX: number; scaleY: number; pivotX: number; pivotY: number
}

/** Read the bounded, positive-scale local-pixel/degree affine contract shared by
 * Edit Mesh evaluation and gesture accumulation. Refuse rather than clamp. */
export function readMeshTransformSettings(settings: Readonly<Record<string, unknown>>): MeshTransformSettings {
  return { x: numberSetting(settings, 'x', -1e6, 1e6), y: numberSetting(settings, 'y', -1e6, 1e6),
    rotation: numberSetting(settings, 'rotation', -36000, 36000),
    scaleX: numberSetting(settings, 'scaleX', .01, 100), scaleY: numberSetting(settings, 'scaleY', .01, 100),
    pivotX: numberSetting(settings, 'pivotX', -1e7, 1e7), pivotY: numberSetting(settings, 'pivotY', -1e7, 1e7) }
}

/** Position-space matrix T(offset) T(pivot) R S T(-pivot); inputs are borrowed. */
export function meshTransformMatrix(s: MeshTransformSettings): Matrix2D {
  return Matrix2D.translation(s.x, s.y).translate(s.pivotX, s.pivotY)
    .rotate(s.rotation).scale(s.scaleX, s.scaleY).translate(-s.pivotX, -s.pivotY)
}

/** Apply a new local edit AFTER accumulated edits, preserving the original
 * stage pivot. Reuse Matrix2D decomposition; reject shear when reconstruction
 * differs by more than relative 1e-7 (absolute 1e-7 near unit scale). Viewport
 * translation/rotation/uniform scale remain representable after nonuniform
 * numeric settings. A new nonuniform scale may require shear and then refuses
 * atomically. No geometry, source settings or layer transform is mutated. */
export function accumulateMeshTransform(previous: MeshTransformSettings, delta: MeshTransformSettings): MeshTransformSettings {
  const matrix = meshTransformMatrix(delta).multiply(meshTransformMatrix(previous))
  const parts = matrix.decompose(), linear = Matrix2D.rotation(parts.rotation).scale(parts.scaleX, parts.scaleY)
  const tolerance = 1e-7 * Math.max(1, Math.abs(matrix.a), Math.abs(matrix.b), Math.abs(matrix.c), Math.abs(matrix.d))
  if (Math.max(Math.abs(matrix.a - linear.a), Math.abs(matrix.b - linear.b), Math.abs(matrix.c - linear.c), Math.abs(matrix.d - linear.d)) > tolerance)
    throw new Error('This edit requires shear. Use a separate modifier for nonuniform scaling in a different orientation.')
  const pivot = matrix.applyToPoint({ x: previous.pivotX, y: previous.pivotY })
  return readMeshTransformSettings({ x: pivot.x - previous.pivotX, y: pivot.y - previous.pivotY,
    rotation: parts.rotation, scaleX: parts.scaleX, scaleY: parts.scaleY, pivotX: previous.pivotX, pivotY: previous.pivotY })
}
